import { z } from 'zod';
import type { AmordleSupabaseClient } from '../lib/supabase-browser';
import type { Json, Tables } from '../types/database';
import { postgresTimestamptzSchema } from './postgres-timestamp';
import { ServiceError, throwIfServiceError } from './service-error';

const accountIdSchema = z.string().uuid();
const applicationTimestampSchema = z.iso.datetime();
const historyIdSchema = z.string().trim().min(1).max(200);
const jsonDocumentSchema = z.record(z.string(), z.json());
const historyRowSchema = z.object({
  id: historyIdSchema,
  user_id: accountIdSchema,
  completed_at: postgresTimestamptzSchema,
  entry: jsonDocumentSchema,
});

export type AccountDocumentSnapshot = {
  readonly value: Json;
  readonly updatedAt: string;
};

export type AccountWriteResult = {
  readonly status: 'saved' | 'current';
  readonly updatedAt: string;
};

function accountId(value: string): string {
  const parsed = accountIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new ServiceError('validation', 'Account persistence requires a valid account identity.');
  }
  return parsed.data;
}

function updateTimestamp(value: string): string {
  const parsed = applicationTimestampSchema.safeParse(value);
  if (!parsed.success) {
    throw new ServiceError('validation', 'Account persistence requires a valid update timestamp.');
  }
  const timestamp = new Date(parsed.data);
  if (timestamp.getTime() > Date.now() + 5 * 60_000) {
    throw new ServiceError('validation', 'Account persistence rejected a future update timestamp.');
  }
  return timestamp.toISOString();
}

function jsonDocument(value: Json, label: string): { [key: string]: Json | undefined } {
  const parsed = jsonDocumentSchema.safeParse(value);
  if (!parsed.success) {
    throw new ServiceError('validation', `${label} must be a JSON object.`);
  }
  return parsed.data;
}

function canonicalJson(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry as Json)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function nextTimestamp(candidate: string, current?: string): string {
  const candidateMs = Date.parse(updateTimestamp(candidate));
  const currentMs = current === undefined ? Number.NEGATIVE_INFINITY : Date.parse(current);
  if (!Number.isFinite(currentMs) && current !== undefined) {
    throw new ServiceError('persistence', 'Account persistence returned an invalid timestamp.');
  }
  return new Date(Math.max(candidateMs, currentMs + 1)).toISOString();
}

function insertConflict(error: { code?: string } | null): boolean {
  return error?.code === '23505' || error?.code === '409';
}

function jsonObject(value: Json | null): { [key: string]: Json | undefined } {
  if (value === null) return {};
  return jsonDocument(value, 'Account progress');
}

export class AccountRepository {
  constructor(private readonly client: AmordleSupabaseClient) {}

  async loadProgress(userId: string): Promise<Json | null> {
    const safeUserId = accountId(userId);
    const { data, error } = await this.client
      .from('progress_snapshots')
      .select('progress')
      .eq('user_id', safeUserId)
      .maybeSingle();
    throwIfServiceError(error, 'Load progress');
    return data?.progress ?? null;
  }

  async loadProgressSnapshot(
    userId: string,
  ): Promise<{ readonly progress: Json; readonly updatedAt: string } | null> {
    const safeUserId = accountId(userId);
    const { data, error } = await this.client
      .from('progress_snapshots')
      .select('progress,updated_at')
      .eq('user_id', safeUserId)
      .maybeSingle();
    throwIfServiceError(error, 'Load progress snapshot');
    if (!data) return null;
    return {
      progress: jsonDocument(data.progress, 'Account progress'),
      updatedAt: postgresTimestamptzSchema.parse(data.updated_at),
    };
  }

  async saveProgress(
    userId: string,
    progress: Json,
    updatedAt: string,
  ): Promise<AccountWriteResult> {
    const safeUserId = accountId(userId);
    const safeProgress = jsonDocument(progress, 'Account progress');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.loadProgressSnapshot(safeUserId);
      if (!current) {
        const timestamp = nextTimestamp(updatedAt);
        const created = await this.client
          .from('progress_snapshots')
          .insert({ user_id: safeUserId, progress: safeProgress, updated_at: timestamp })
          .select('updated_at')
          .maybeSingle();
        if (insertConflict(created.error)) continue;
        throwIfServiceError(created.error, 'Create progress');
        if (created.data) {
          return {
            status: 'saved',
            updatedAt: postgresTimestamptzSchema.parse(created.data.updated_at),
          };
        }
        continue;
      }
      if (canonicalJson(current.progress) === canonicalJson(safeProgress)) {
        return { status: 'current', updatedAt: current.updatedAt };
      }
      const timestamp = nextTimestamp(updatedAt, current.updatedAt);
      const replaced = await this.client
        .from('progress_snapshots')
        .update({ progress: safeProgress, updated_at: timestamp })
        .eq('user_id', safeUserId)
        .eq('updated_at', current.updatedAt)
        .select('updated_at')
        .maybeSingle();
      throwIfServiceError(replaced.error, 'Save progress');
      if (replaced.data) {
        return {
          status: 'saved',
          updatedAt: postgresTimestamptzSchema.parse(replaced.data.updated_at),
        };
      }
    }
    throw new ServiceError('conflict', 'Progress reconciliation did not converge.');
  }

  async saveProgression(
    userId: string,
    progression: Json,
    updatedAt: string,
  ): Promise<AccountWriteResult> {
    const safeUserId = accountId(userId);
    const safeProgression = jsonDocument(progression, 'Account progression');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.client
        .from('progress_snapshots')
        .select('progress,updated_at')
        .eq('user_id', safeUserId)
        .maybeSingle();
      throwIfServiceError(current.error, 'Load progress document');
      const progress = {
        ...jsonObject(current.data?.progress ?? null),
        progression: safeProgression,
      };
      if (current.data && canonicalJson(current.data.progress) === canonicalJson(progress)) {
        return {
          status: 'current',
          updatedAt: postgresTimestamptzSchema.parse(current.data.updated_at),
        };
      }
      if (!current.data) {
        const timestamp = nextTimestamp(updatedAt);
        const created = await this.client
          .from('progress_snapshots')
          .insert({ user_id: safeUserId, progress, updated_at: timestamp })
          .select('updated_at')
          .maybeSingle();
        if (insertConflict(created.error)) continue;
        throwIfServiceError(created.error, 'Create progression');
        if (created.data) {
          return {
            status: 'saved',
            updatedAt: postgresTimestamptzSchema.parse(created.data.updated_at),
          };
        }
        continue;
      }
      const timestamp = nextTimestamp(updatedAt, current.data.updated_at);
      const replaced = await this.client
        .from('progress_snapshots')
        .update({ progress, updated_at: timestamp })
        .eq('user_id', safeUserId)
        .eq('updated_at', current.data.updated_at)
        .select('updated_at')
        .maybeSingle();
      throwIfServiceError(replaced.error, 'Save progression');
      if (replaced.data) {
        return {
          status: 'saved',
          updatedAt: postgresTimestamptzSchema.parse(replaced.data.updated_at),
        };
      }
    }
    throw new ServiceError(
      'conflict',
      'Progression reconciliation did not converge after three exact retries.',
    );
  }

  async loadSettings(userId: string): Promise<Json | null> {
    const snapshot = await this.loadSettingsSnapshot(userId);
    return snapshot?.value ?? null;
  }

  async loadSettingsSnapshot(userId: string): Promise<AccountDocumentSnapshot | null> {
    const safeUserId = accountId(userId);
    const { data, error } = await this.client
      .from('settings')
      .select('settings,updated_at')
      .eq('user_id', safeUserId)
      .maybeSingle();
    throwIfServiceError(error, 'Load settings');
    if (!data) return null;
    return {
      value: jsonDocument(data.settings, 'Account settings'),
      updatedAt: postgresTimestamptzSchema.parse(data.updated_at),
    };
  }

  async saveSettings(
    userId: string,
    settings: Json,
    updatedAt: string,
  ): Promise<AccountWriteResult> {
    const safeUserId = accountId(userId);
    const safeSettings = jsonDocument(settings, 'Account settings');
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.loadSettingsSnapshot(safeUserId);
      const merged = { ...jsonObject(current?.value ?? null), ...safeSettings };
      if (current && canonicalJson(current.value) === canonicalJson(merged)) {
        return { status: 'current', updatedAt: current.updatedAt };
      }
      const timestamp = nextTimestamp(updatedAt, current?.updatedAt);
      if (!current) {
        const created = await this.client
          .from('settings')
          .insert({ user_id: safeUserId, settings: merged, updated_at: timestamp })
          .select('updated_at')
          .maybeSingle();
        if (insertConflict(created.error)) continue;
        throwIfServiceError(created.error, 'Create settings');
        if (created.data) {
          return {
            status: 'saved',
            updatedAt: postgresTimestamptzSchema.parse(created.data.updated_at),
          };
        }
        continue;
      }
      const replaced = await this.client
        .from('settings')
        .update({ settings: merged, updated_at: timestamp })
        .eq('user_id', safeUserId)
        .eq('updated_at', current.updatedAt)
        .select('updated_at')
        .maybeSingle();
      throwIfServiceError(replaced.error, 'Save settings');
      if (replaced.data) {
        return {
          status: 'saved',
          updatedAt: postgresTimestamptzSchema.parse(replaced.data.updated_at),
        };
      }
    }
    throw new ServiceError(
      'conflict',
      'Settings reconciliation did not converge after three exact retries.',
    );
  }

  async listHistory(userId: string, limit = 100): Promise<Tables<'game_history'>[]> {
    const safeUserId = accountId(userId);
    const safeLimit = z.number().int().min(1).max(250).parse(limit);
    const { data, error } = await this.client
      .from('game_history')
      .select('*')
      .eq('user_id', safeUserId)
      .order('completed_at', { ascending: false })
      .limit(safeLimit);
    throwIfServiceError(error, 'Load history');
    const parsed = z.array(historyRowSchema).safeParse(data ?? []);
    if (!parsed.success || parsed.data.some((row) => row.user_id !== safeUserId)) {
      throw new ServiceError('validation', 'Account history returned an invalid owner projection.');
    }
    return parsed.data;
  }

  async saveHistory(entry: Tables<'game_history'>): Promise<void> {
    const parsed = historyRowSchema.safeParse(entry);
    if (!parsed.success) {
      throw new ServiceError('validation', 'Account history requires a valid private record.');
    }
    const { error } = await this.client
      .from('game_history')
      .upsert(parsed.data, { onConflict: 'user_id,id' });
    throwIfServiceError(error, 'Save history');
  }
}
