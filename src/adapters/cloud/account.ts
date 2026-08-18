'use client';

import { z } from 'zod';
import type { Json } from '@/types/database';
import {
  CONSUMABLE_RPC_SCOPE,
  CONSUMABLE_RPC_TYPE,
  levelForXp,
  type ConsumableProduct,
} from '@/domain/economy';
import {
  ACCOUNT_STATE_KIND,
  accountStateEntrySchema,
  defaultAccountProgress,
  historyRowSchema,
  normalizeAccountProgress,
  normalizeLegacyHistory,
  progressSchema,
} from '@/domain/account-continuity';
import type { AccountHistoryRow, AccountProgress } from '@/domain/account-continuity';
import { advanceDailyStreak, streakDateForEntry } from '@/domain/daily-streak';
import {
  defaultPlayerSettings,
  normalizePlayerSettings,
  type PlayerSettings,
} from '@/domain/player-settings';
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
  keyboardSoundProfile: z.enum(['terminal', 'soft-tap', 'mechanical', 'glass', 'low-thock']),
  hapticsEnabled: z.boolean(),
});

export type { PlayerSettings } from '@/domain/player-settings';

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

export async function purchaseConsumable(type: ConsumableProduct, operationId: string) {
  const { data, error } = await client().rpc('purchase_solo_practice_consumable', {
    p_consumable_type: CONSUMABLE_RPC_TYPE[type],
    p_operation_id: operationId,
  });
  if (error) throwServiceError(error);
  return parseServiceResult(economySchema, data?.[0]);
}

export async function loadSettings(userId: string): Promise<PlayerSettings> {
  return (await loadSettingsWithDiagnostics(userId)).settings;
}

export async function loadSettingsWithDiagnostics(
  userId: string,
): Promise<{ settings: PlayerSettings; recovered: boolean }> {
  const { data, error } = await client()
    .from('settings')
    .select('settings,keyboard_sound_profile,haptics_enabled')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throwServiceError(error);
  if (!data) return { settings: { ...defaultPlayerSettings }, recovered: false };
  return normalizePlayerSettings({
    stored: data.settings,
    keyboardSoundProfile: data.keyboard_sound_profile,
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

const dailyEntitlementRowSchema = z
  .object({
    local_date: z.string(),
    mode: z.enum(['og', 'go']),
    state: z.enum(['pending', 'unlocked']),
  })
  .strict();

/*
 * Daily entitlements no longer live in the progress snapshot.
 *
 * They used to be a field inside `progress_snapshots.progress`, which the owner
 * may update directly — so the record of having paid was written by the same
 * party that was supposed to pay. They now live in `player_daily_entitlements`,
 * which no browser role can write, and this reads them back into the shape the
 * calendar and the access gate already expect. See
 * supabase/migrations/20260818121000_amordle_daily_entitlement_authority_v1.sql.
 */
export async function listDailyEntitlements(): Promise<
  NonNullable<AccountProgress['dailyEntitlements']>
> {
  const { data, error } = await client().rpc('list_my_daily_entitlements_v1');
  if (error) throwServiceError(error);
  const rows = parseServiceResult(z.array(dailyEntitlementRowSchema), data ?? []);
  return Object.fromEntries(rows.map((row) => [`${row.local_date}:${row.mode}`, row.state]));
}

const unlockResultSchema = economySchema.extend({
  state: z.enum(['pending', 'unlocked']),
});

export async function unlockDailyEntitlement(localDate: string, mode: 'og' | 'go') {
  const { data, error } = await client().rpc('unlock_daily_entitlement_v1', {
    p_local_date: localDate,
    p_mode: mode,
  });
  if (error) throwServiceError(error);
  const parsed = parseServiceResult(unlockResultSchema, data?.[0]);
  const { state, ...economy } = parsed;
  return { economy, state };
}

export async function markDailyEntitlementUnlocked(localDate: string, mode: 'og' | 'go') {
  const { error } = await client().rpc('mark_daily_entitlement_unlocked_v1', {
    p_local_date: localDate,
    p_mode: mode,
  });
  if (error) throwServiceError(error);
}

/*
 * Deliberately NOT merged into loadProgress.
 *
 * loadProgress is read on almost every screen and polled on the home page, and
 * it is called three times inside the Solo adapter alone. Folding the
 * entitlement read into it would have added a request everywhere progress is
 * read — which is the opposite of what the rest of this change is for. The two
 * surfaces that actually need entitlements ask for them, and React Query
 * dedupes the result across both.
 *
 * The snapshot's own `dailyEntitlements` is no longer read anywhere. It is
 * owner-writable, so honouring it would leave the old grant path open beside
 * the new one; the migration backfilled its contents and nothing reads it now.
 */
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

export async function consumeConsumable(type: ConsumableProduct, operationId: string) {
  const { data, error } = await client().rpc('consume_solo_practice_consumable', {
    p_consumable_type: CONSUMABLE_RPC_TYPE[type],
    p_operation_id: operationId,
    p_scope: CONSUMABLE_RPC_SCOPE,
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

/*
 * The award is no longer an amount the browser chooses.
 *
 * `credit_player_economy_coins` took both the amount and the operation id from
 * the caller and is no longer granted to a browser role; see
 * supabase/migrations/20260818120000_amordle_solo_reward_authority_v1.sql. This
 * names the game instead, and the server reads the row, derives what it is
 * worth, and derives the operation id from the row id so one game pays once.
 *
 * This bounds the path rather than closing it. `game_history` is still
 * owner-writable, so a fabricated row still earns what a real one would — at
 * most 48 coins, once, and visible in the player's own History. Closing it
 * completely means the server holding the Solo session, which is deliberately
 * not what this is.
 */
export async function claimGameReward(historyRowId: string) {
  const { data, error } = await client().rpc('claim_game_reward_v1', {
    p_history_row_id: historyRowId,
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
  /*
   * The row is written first and then named, because the server derives the
   * award from the stored row. `rewardCoins` in the entry is now what the client
   * believes it earned; the coins actually paid are whatever the server derives
   * from the same row. The two agree for any game the app itself produced, and
   * tests/domain/solo-reward-contract.test.ts is what keeps them agreeing.
   */
  if (parsed.entry.rewardCoins > 0) {
    await claimGameReward(parsed.id);
  }

  const appliesXp = parsed.entry.rewardXp > 0;
  const dailyDate = streakDateForEntry(parsed.entry);
  // A Daily loss with nothing solved earns no XP, and it still keeps the streak, so this
  // cannot stay gated on the XP alone. One write carries both.
  if (appliesXp || dailyDate) {
    await writeAccountProgressCas(parsed.user_id, (snapshot) => {
      let next = snapshot;
      if (appliesXp && next.appliedRewards?.[operationId] === undefined) {
        const xp = next.xp + parsed.entry.rewardXp;
        next = {
          ...next,
          xp,
          level: levelForXp(xp),
          appliedRewards: { ...next.appliedRewards, [operationId]: parsed.entry.rewardXp },
        };
      }
      if (dailyDate) next = advanceDailyStreak(next, dailyDate);
      return next === snapshot ? snapshot : { ...next, revision: snapshot.revision + 1 };
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
