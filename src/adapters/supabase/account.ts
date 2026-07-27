'use client';

import { z } from 'zod';
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

export const playerSettingsSchema = z
  .object({
    schemaVersion: z.literal(1),
    sound: z.boolean(),
    reducedEffects: z.boolean(),
    notifications: z.boolean(),
    defaultHardMode: z.boolean(),
  })
  .strict();

export type PlayerSettings = z.infer<typeof playerSettingsSchema>;

export const progressSchema = z
  .object({
    schemaVersion: z.literal(1),
    xp: z.number().int().nonnegative(),
    level: z.number().int().positive(),
    dailyStreak: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
    solo: z.record(z.string(), z.unknown()).optional(),
    appliedRewards: z.record(z.string(), z.number().int().nonnegative()).optional(),
    dailyEntitlements: z.record(z.string(), z.enum(['pending', 'unlocked'])).optional(),
  })
  .strict();

export const historyEntrySchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.enum(['solo-practice', 'solo-daily', 'combat-practice', 'combat-daily']),
    mode: z.enum(['og', 'go']),
    result: z.enum(['won', 'lost', 'draw', 'cancelled']),
    wordLength: z.number().int().min(2).max(35),
    acceptedGuesses: z.number().int().nonnegative(),
    puzzlesSolved: z.number().int().nonnegative(),
    rewardCoins: z.number().int().nonnegative(),
    rewardXp: z.number().int().nonnegative(),
    dailyDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .strict();

export const historyRowSchema = z
  .object({
    id: z.string(),
    user_id: z.string().uuid(),
    completed_at: z.string(),
    entry: historyEntrySchema,
  })
  .strict();

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
    .select('settings')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throwServiceError(error);
  const defaults: PlayerSettings = {
    schemaVersion: 1,
    sound: true,
    reducedEffects: false,
    notifications: true,
    defaultHardMode: false,
  };
  if (!data) return defaults;
  return parseServiceResult(playerSettingsSchema, data.settings);
}

export async function saveSettings(userId: string, settings: PlayerSettings) {
  const parsed = playerSettingsSchema.parse(settings);
  const { error } = await client().from('settings').upsert({
    user_id: userId,
    settings: parsed,
    updated_at: new Date().toISOString(),
  });
  if (error) throwServiceError(error);
  return parsed;
}

export async function loadProgress(userId: string) {
  const { data, error } = await client()
    .from('progress_snapshots')
    .select('progress')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throwServiceError(error);
  if (!data) {
    return progressSchema.parse({
      schemaVersion: 1,
      xp: 0,
      level: 1,
      dailyStreak: 0,
      revision: 0,
      solo: {},
      appliedRewards: {},
      dailyEntitlements: {},
    });
  }
  return parseServiceResult(progressSchema, data.progress);
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
  const { data, error } = await client()
    .from('game_history')
    .select('id,user_id,completed_at,entry')
    .eq('user_id', userId)
    .order('completed_at', { ascending: false })
    .limit(100);
  if (error) throwServiceError(error);
  return parseServiceResult(z.array(historyRowSchema), data);
}
