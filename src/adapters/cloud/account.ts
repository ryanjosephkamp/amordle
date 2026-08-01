'use client';

import { z } from 'zod';
import type { Json } from '@/types/database';
import { levelForXp } from '@/domain/economy';
import {
  ACCOUNT_STATE_KIND,
  accountStateEntrySchema,
  defaultAccountProgress,
  historyRowSchema,
  normalizeAccountProgress,
  normalizeLegacyHistory,
  progressSchema,
} from '@/domain/account-continuity';
import type { AccountHistoryRow } from '@/domain/account-continuity';
import { keyboardSoundProfileSchema } from '@/domain/feedback';
import { getBrowserSupabase } from './browser';
import { parseServiceResult, ServiceError, throwServiceError } from './shared';

export const economySchema = z
  .object({
    applied: z.boolean(),
    coins: z.number().int().nonnegative(),
    operation_id: z.string(),
    remove_incorrect_letters: z.number().int().nonnegative(),
    reveal_one_letter: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
  })
  .strict();

const storedPlayerSettingsV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    sound: z.boolean(),
    reducedEffects: z.boolean(),
    notifications: z.boolean(),
    defaultHardMode: z.boolean(),
  })
  .strict();

export const playerSettingsSchema = storedPlayerSettingsV1Schema.extend({
  keyboardSoundProfile: keyboardSoundProfileSchema,
  hapticsEnabled: z.boolean(),
});

export type PlayerSettings = z.infer<typeof playerSettingsSchema>;

export const ratingProfileSchema = z
  .object({
    bucket: z.string(),
    draws: z.number().int().nonnegative(),
    games_played: z.number().int().nonnegative(),
    losses: z.number().int().nonnegative(),
    provisional: z.boolean(),
    rating: z.number(),
    updated_at: z.string(),
    user_id: z.string().uuid(),
    wins: z.number().int().nonnegative(),
  })
  .strict();

export { historyEntrySchema, historyRowSchema, progressSchema } from '@/domain/account-continuity';

function client() {
  const value = getBrowserSupabase();
  if (!value) throw new ServiceError('Account services are unavailable.', 'UNAVAILABLE');
  return value;
}

export async function getEconomy() {
  const { data, error } = await client().rpc('get_player_economy_state');
  if (error) throwServiceError(error);
  return parseServiceResult(economySchema, data?.[0]);
}

export async function purchaseConsumable(
  type: 'reveal_one_letter' | 'remove_incorrect_letters',
  operationId: string,
) {
  const { data, error } = await client().rpc('purchase_solo_practice_consumable', {
    p_consumable_type: type,
    p_operation_id: operationId,
  });
  if (error) throwServiceError(error);
  return parseServiceResult(economySchema, data?.[0]);
}

export async function loadSettings(userId: string): Promise<PlayerSettings> {
  const { data, error } = await client()
    .from('settings')
    .select('settings,keyboard_sound_profile,haptics_enabled')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throwServiceError(error);
  const defaults: PlayerSettings = {
    schemaVersion: 1,
    sound: true,
    reducedEffects: false,
    notifications: true,
    defaultHardMode: false,
    keyboardSoundProfile: 'terminal',
    hapticsEnabled: false,
  };
  if (!data) return defaults;
  const stored = parseServiceResult(storedPlayerSettingsV1Schema, data.settings);
  return playerSettingsSchema.parse({
    ...stored,
    keyboardSoundProfile: keyboardSoundProfileSchema.parse(data.keyboard_sound_profile),
    hapticsEnabled: data.haptics_enabled,
  });
}

export async function saveSettings(userId: string, settings: PlayerSettings) {
  const parsed = playerSettingsSchema.parse(settings);
  const stored = storedPlayerSettingsV1Schema.parse({
    schemaVersion: 1,
    sound: parsed.sound,
    reducedEffects: parsed.reducedEffects,
    notifications: parsed.notifications,
    defaultHardMode: parsed.defaultHardMode,
  });
  const { error } = await client().from('settings').upsert({
    user_id: userId,
    settings: stored,
    keyboard_sound_profile: parsed.keyboardSoundProfile,
    haptics_enabled: parsed.hapticsEnabled,
    updated_at: new Date().toISOString(),
  });
  if (error) throwServiceError(error);
  return parsed;
}

export async function loadProgress(userId: string) {
  return (await readAccountProgress(userId)).progress;
}

export async function loadRatingProfiles(userId: string) {
  const { data, error } = await client()
    .from('multiplayer_rating_profiles')
    .select('bucket,draws,games_played,losses,provisional,rating,updated_at,user_id,wins')
    .eq('user_id', userId)
    .order('bucket', { ascending: true });
  if (error) throwServiceError(error);
  return z.array(ratingProfileSchema).parse(data ?? []);
}

export async function consumeConsumable(
  type: 'reveal_one_letter' | 'remove_incorrect_letters',
  operationId: string,
) {
  const { data, error } = await client().rpc('consume_solo_practice_consumable', {
    p_consumable_type: type,
    p_operation_id: operationId,
    p_scope: 'solo-practice',
  });
  if (error) throwServiceError(error);
  return parseServiceResult(economySchema, data?.[0]);
}

export async function spendCoins(amount: number, operationId: string) {
  const { data, error } = await client().rpc('spend_player_economy_coins', {
    p_amount: amount,
    p_operation_id: operationId,
  });
  if (error) throwServiceError(error);
  return parseServiceResult(economySchema, data?.[0]);
}

export async function creditCoins(amount: number, operationId: string) {
  const { data, error } = await client().rpc('credit_player_economy_coins', {
    p_amount: amount,
    p_operation_id: operationId,
  });
  if (error) throwServiceError(error);
  return parseServiceResult(economySchema, data?.[0]);
}

export async function loadHistory(userId: string) {
  return (await loadHistoryWithDiagnostics(userId)).rows;
}

export async function loadHistoryWithDiagnostics(userId: string) {
  const [history, snapshot] = await Promise.all([
    client()
      .from('game_history')
      .select('id,user_id,completed_at,entry')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false })
      .limit(200),
    client().from('progress_snapshots').select('progress').eq('user_id', userId).maybeSingle(),
  ]);
  if (history.error && snapshot.error) throwServiceError(history.error);
  const supported = (history.error ? [] : (history.data ?? [])).flatMap((row) => {
    const parsed = historyRowSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
  const legacy = snapshot.error ? [] : normalizeLegacyHistory(snapshot.data?.progress, userId);
  const byId = new Map([...supported, ...legacy].map((row) => [row.id, row]));
  return {
    rows: [...byId.values()]
      .sort((left, right) => right.completed_at.localeCompare(left.completed_at))
      .slice(0, 100),
    failedSources: Number(Boolean(history.error)) + Number(Boolean(snapshot.error)),
  };
}

function rewardOperationId(rowId: string): string {
  return rowId.startsWith('solo:')
    ? `solo-reward:${rowId.slice('solo:'.length)}`
    : `completion-reward:${rowId}`;
}

export async function finalizeAccountHistoryRow(row: AccountHistoryRow) {
  const parsed = historyRowSchema.parse(row);
  const { error } = await client()
    .from('game_history')
    .upsert({
      id: parsed.id,
      user_id: parsed.user_id,
      completed_at: parsed.completed_at,
      entry: parsed.entry as Json,
    });
  if (error) throwServiceError(error);

  const operationId = rewardOperationId(parsed.id);
  if (parsed.entry.rewardCoins > 0) {
    await creditCoins(parsed.entry.rewardCoins, operationId);
  }
  if (parsed.entry.rewardXp > 0) {
    await writeAccountProgressCas(parsed.user_id, (snapshot) => {
      if (snapshot.appliedRewards?.[operationId] !== undefined) return snapshot;
      const xp = snapshot.xp + parsed.entry.rewardXp;
      return {
        ...snapshot,
        xp,
        level: levelForXp(xp),
        revision: snapshot.revision + 1,
        appliedRewards: { ...snapshot.appliedRewards, [operationId]: parsed.entry.rewardXp },
      };
    });
  }
  return parsed;
}

function stateRowId(userId: string): string {
  return `amordle-account-state-v1:${userId}`;
}

const stateRowSchema = z
  .object({
    completed_at: z.string(),
    entry: accountStateEntrySchema,
  })
  .strict();

async function readAccountProgress(userId: string) {
  const [state, snapshot] = await Promise.all([
    client()
      .from('game_history')
      .select('completed_at,entry')
      .eq('id', stateRowId(userId))
      .eq('user_id', userId)
      .maybeSingle(),
    client().from('progress_snapshots').select('progress').eq('user_id', userId).maybeSingle(),
  ]);
  if (state.error) throwServiceError(state.error);
  if (snapshot.error) throwServiceError(snapshot.error);
  if (state.data) {
    const parsed = stateRowSchema.safeParse(state.data);
    if (!parsed.success) {
      throw new ServiceError('Account progress could not be read safely.', 'INVALID_RESPONSE');
    }
    return {
      progress: parsed.data.entry.progress,
      completedAt: parsed.data.completed_at,
    };
  }
  if (!snapshot.data) return { progress: defaultAccountProgress(), completedAt: null };
  const normalized = normalizeAccountProgress(snapshot.data.progress);
  if (normalized.kind === 'unknown') {
    throw new ServiceError('Account progress format is not recognized.', 'INVALID_RESPONSE');
  }
  return { progress: normalized.progress, completedAt: null };
}

export async function writeAccountProgressCas(
  userId: string,
  transform: (snapshot: z.infer<typeof progressSchema>) => z.infer<typeof progressSchema>,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await readAccountProgress(userId);
    const next = progressSchema.parse(transform(current.progress));
    const completedAt = new Date().toISOString();
    const entry = {
      kind: ACCOUNT_STATE_KIND,
      schemaVersion: 1 as const,
      progress: next,
    };
    if (current.completedAt === null) {
      const inserted = await client()
        .from('game_history')
        .insert({
          id: stateRowId(userId),
          user_id: userId,
          completed_at: completedAt,
          entry: entry as Json,
        });
      if (!inserted.error) return next;
      if (inserted.error.code !== '23505') throwServiceError(inserted.error);
      continue;
    }
    const updated = await client()
      .from('game_history')
      .update({ entry: entry as Json, completed_at: completedAt })
      .eq('id', stateRowId(userId))
      .eq('user_id', userId)
      .eq('completed_at', current.completedAt)
      .select('id');
    if (updated.error) throwServiceError(updated.error);
    if (updated.data.length === 1) return next;
  }
  throw new ServiceError(
    'A newer account save arrived first. Reload before retrying.',
    'STALE_REVISION',
  );
}
