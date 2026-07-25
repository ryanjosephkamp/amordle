import { z } from 'zod';
import type { AmordleSupabaseClient } from '../lib/supabase-browser';
import {
  sameIdentityScope,
  type IdentityScope,
  type VersionedEnvelope,
} from '../persistence/local-repository';
import type { Json } from '../types/database';
import { ServiceError, throwIfServiceError } from './service-error';

export const SOLO_CLOUD_DOCUMENT_FIELD = 'soloCloudV1';
export const SOLO_CLOUD_SCHEMA_VERSION = 1;

const authenticatedScopeSchema = z.object({
  kind: z.literal('authenticated'),
  userId: z.string().uuid(),
});

export type SoloCloudRow = {
  readonly progress: Json;
  readonly updatedAt: string;
};

export interface SoloCloudStore {
  read(userId: string): Promise<SoloCloudRow | null>;
  create(userId: string, progress: Json, updatedAt: string): Promise<boolean>;
  replace(
    userId: string,
    expectedUpdatedAt: string,
    progress: Json,
    updatedAt: string,
  ): Promise<boolean>;
}

export type SoloCloudLoadResult<T> =
  | { readonly status: 'guest-local-only' }
  | { readonly status: 'empty' }
  | { readonly status: 'ok'; readonly envelope: VersionedEnvelope<T> }
  | {
      readonly status: 'corrupt';
      readonly reason:
        'invalid_progress' | 'invalid_envelope' | 'owner_mismatch' | 'future_timestamp';
    };

export type SoloCloudReconcileResult<T> =
  | { readonly status: 'guest-local-only'; readonly authoritative?: VersionedEnvelope<T> }
  | { readonly status: 'empty' }
  | { readonly status: 'hydrated'; readonly authoritative: VersionedEnvelope<T> }
  | { readonly status: 'current'; readonly authoritative: VersionedEnvelope<T> }
  | { readonly status: 'published'; readonly authoritative: VersionedEnvelope<T> }
  | { readonly status: 'stale-rejected'; readonly authoritative: VersionedEnvelope<T> }
  | { readonly status: 'conflict'; readonly authoritative: VersionedEnvelope<T> }
  | Extract<SoloCloudLoadResult<T>, { status: 'corrupt' }>;

function isJsonObject(value: Json): value is { [key: string]: Json | undefined } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonCanonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(jsonCanonical).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${jsonCanonical(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sameEnvelopePayload<T>(left: VersionedEnvelope<T>, right: VersionedEnvelope<T>): boolean {
  return jsonCanonical(left.payload) === jsonCanonical(right.payload);
}

function parseTimestamp(value: string): number | null {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function nextRowTimestamp(current: string | undefined, nowMs: number): string {
  const currentMs = current ? parseTimestamp(current) : null;
  return new Date(Math.max(nowMs, currentMs === null ? nowMs : currentMs + 1)).toISOString();
}

function conflictCode(error: { code?: string } | null): boolean {
  return error?.code === '23505' || error?.code === '409';
}

export class SupabaseSoloCloudStore implements SoloCloudStore {
  constructor(private readonly client: AmordleSupabaseClient) {}

  async read(userId: string): Promise<SoloCloudRow | null> {
    const { data, error } = await this.client
      .from('progress_snapshots')
      .select('progress,updated_at')
      .eq('user_id', z.string().uuid().parse(userId))
      .maybeSingle();
    throwIfServiceError(error, 'Load Solo cloud state');
    return data ? { progress: data.progress, updatedAt: data.updated_at } : null;
  }

  async create(userId: string, progress: Json, updatedAt: string): Promise<boolean> {
    const { data, error } = await this.client
      .from('progress_snapshots')
      .insert({ user_id: z.string().uuid().parse(userId), progress, updated_at: updatedAt })
      .select('updated_at')
      .maybeSingle();
    if (conflictCode(error)) return false;
    throwIfServiceError(error, 'Create Solo cloud state');
    return Boolean(data);
  }

  async replace(
    userId: string,
    expectedUpdatedAt: string,
    progress: Json,
    updatedAt: string,
  ): Promise<boolean> {
    const { data, error } = await this.client
      .from('progress_snapshots')
      .update({ progress, updated_at: updatedAt })
      .eq('user_id', z.string().uuid().parse(userId))
      .eq('updated_at', expectedUpdatedAt)
      .select('updated_at')
      .maybeSingle();
    throwIfServiceError(error, 'Replace Solo cloud state');
    return Boolean(data);
  }
}

export class SoloCloudRepository<T> {
  private readonly envelopeSchema: z.ZodType<VersionedEnvelope<T>>;

  constructor(
    private readonly store: SoloCloudStore,
    payloadSchema: z.ZodType<T>,
    private readonly options: {
      readonly now?: () => Date;
      readonly maxFutureSkewMs?: number;
      readonly maxCasAttempts?: number;
    } = {},
  ) {
    this.envelopeSchema = z.object({
      schemaVersion: z.literal(SOLO_CLOUD_SCHEMA_VERSION),
      owner: authenticatedScopeSchema,
      revision: z.number().int().nonnegative(),
      updatedAt: z.iso.datetime(),
      payload: payloadSchema,
    }) as z.ZodType<VersionedEnvelope<T>>;
  }

  private nowMs(): number {
    return (this.options.now ?? (() => new Date()))().getTime();
  }

  private parseRow(
    scope: Extract<IdentityScope, { kind: 'authenticated' }>,
    row: SoloCloudRow | null,
    nowMs: number,
  ): SoloCloudLoadResult<T> {
    if (!row) return { status: 'empty' };
    if (!isJsonObject(row.progress)) return { status: 'corrupt', reason: 'invalid_progress' };
    const rawEnvelope = row.progress[SOLO_CLOUD_DOCUMENT_FIELD];
    if (rawEnvelope === undefined) return { status: 'empty' };
    const parsed = this.envelopeSchema.safeParse(rawEnvelope);
    if (!parsed.success) return { status: 'corrupt', reason: 'invalid_envelope' };
    if (!sameIdentityScope(parsed.data.owner, scope)) {
      return { status: 'corrupt', reason: 'owner_mismatch' };
    }
    const updatedAt = parseTimestamp(parsed.data.updatedAt);
    const maxFutureSkewMs = this.options.maxFutureSkewMs ?? 5 * 60_000;
    if (updatedAt === null || updatedAt > nowMs + maxFutureSkewMs) {
      return { status: 'corrupt', reason: 'future_timestamp' };
    }
    return { status: 'ok', envelope: parsed.data };
  }

  async load(scope: IdentityScope): Promise<SoloCloudLoadResult<T>> {
    if (scope.kind === 'guest') return { status: 'guest-local-only' };
    const safeScope = authenticatedScopeSchema.parse(scope);
    return this.parseRow(safeScope, await this.store.read(safeScope.userId), this.nowMs());
  }

  private parseCandidate(
    scope: Extract<IdentityScope, { kind: 'authenticated' }>,
    candidate: VersionedEnvelope<T>,
    nowMs: number,
  ): VersionedEnvelope<T> {
    const parsed = this.envelopeSchema.safeParse(candidate);
    if (!parsed.success || !sameIdentityScope(parsed.data.owner, scope)) {
      throw new ServiceError(
        'validation',
        'Solo cloud state must belong to the active authenticated account.',
      );
    }
    const updatedAt = parseTimestamp(parsed.data.updatedAt);
    const maxFutureSkewMs = this.options.maxFutureSkewMs ?? 5 * 60_000;
    if (updatedAt === null || updatedAt > nowMs + maxFutureSkewMs) {
      throw new ServiceError('validation', 'Solo cloud state timestamp is invalid.');
    }
    return parsed.data;
  }

  private mergeProgress(row: SoloCloudRow | null, envelope: VersionedEnvelope<T>): Json | null {
    if (row && !isJsonObject(row.progress)) return null;
    const serialized = z.json().safeParse(envelope);
    if (!serialized.success) {
      throw new ServiceError('validation', 'Solo cloud state is not JSON serializable.');
    }
    return {
      ...(row && isJsonObject(row.progress) ? row.progress : {}),
      [SOLO_CLOUD_DOCUMENT_FIELD]: serialized.data,
    };
  }

  async reconcile(
    scope: IdentityScope,
    candidate?: VersionedEnvelope<T>,
  ): Promise<SoloCloudReconcileResult<T>> {
    if (scope.kind === 'guest') {
      if (candidate && !sameIdentityScope(candidate.owner, scope)) {
        throw new ServiceError(
          'validation',
          'Guest Solo state cannot be transferred to an account implicitly.',
        );
      }
      return candidate
        ? { status: 'guest-local-only', authoritative: candidate }
        : { status: 'guest-local-only' };
    }

    const safeScope = authenticatedScopeSchema.parse(scope);
    const nowMs = this.nowMs();
    const safeCandidate = candidate ? this.parseCandidate(safeScope, candidate, nowMs) : undefined;
    const attempts = Math.min(Math.max(this.options.maxCasAttempts ?? 3, 1), 5);

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const row = await this.store.read(safeScope.userId);
      const cloud = this.parseRow(safeScope, row, nowMs);
      if (cloud.status === 'corrupt') return cloud;
      if (!safeCandidate) {
        return cloud.status === 'ok'
          ? { status: 'hydrated', authoritative: cloud.envelope }
          : { status: 'empty' };
      }

      if (cloud.status === 'ok') {
        const localTime = Date.parse(safeCandidate.updatedAt);
        const cloudTime = Date.parse(cloud.envelope.updatedAt);
        if (safeCandidate.revision < cloud.envelope.revision || localTime < cloudTime) {
          return { status: 'stale-rejected', authoritative: cloud.envelope };
        }
        if (safeCandidate.revision === cloud.envelope.revision) {
          return sameEnvelopePayload(safeCandidate, cloud.envelope)
            ? { status: 'current', authoritative: cloud.envelope }
            : { status: 'conflict', authoritative: cloud.envelope };
        }
      }

      const progress = this.mergeProgress(row, safeCandidate);
      if (!progress) return { status: 'corrupt', reason: 'invalid_progress' };
      const casUpdatedAt = nextRowTimestamp(row?.updatedAt, nowMs + attempt);
      const saved = row
        ? await this.store.replace(safeScope.userId, row.updatedAt, progress, casUpdatedAt)
        : await this.store.create(safeScope.userId, progress, casUpdatedAt);
      if (saved) return { status: 'published', authoritative: safeCandidate };
    }

    const latest = this.parseRow(safeScope, await this.store.read(safeScope.userId), this.nowMs());
    if (latest.status === 'ok') {
      return { status: 'conflict', authoritative: latest.envelope };
    }
    if (latest.status === 'corrupt') return latest;
    throw new ServiceError('conflict', 'Solo cloud reconciliation did not converge.');
  }
}
