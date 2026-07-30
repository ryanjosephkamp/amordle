'use client';

import { z } from 'zod';
import type { RankedPracticeConfig } from '@/domain/multiplayer';

const rankedPracticeConfigSchema = z
  .object({
    mode: z.enum(['og', 'go']),
    wordLength: z.number().int().min(2).max(35),
    difficulty: z.enum(['casual', 'standard', 'expert']),
    hardMode: z.boolean(),
    goPuzzleCount: z.union([z.literal(5), z.literal(7), z.literal(10), z.null()]),
    timeLimitMs: z.union([z.literal(300_000), z.null()]),
  })
  .strict();

export const rankedPracticeQueueIntentSchema = z
  .object({
    schemaVersion: z.literal(2),
    ownerUserId: z.string().uuid(),
    requestId: z.string().min(1),
    creationKey: z.string().min(1),
    claimActionId: z.string().min(1),
    finalizeActionId: z.string().min(1),
    createdAt: z.iso.datetime({ offset: true }),
    config: rankedPracticeConfigSchema,
  })
  .strict();

export type RankedPracticeQueueIntent = z.infer<typeof rankedPracticeQueueIntentSchema>;

export type RankedPracticeQueueIntentRead =
  | { status: 'missing' }
  | { status: 'corrupt' }
  | { status: 'valid'; intent: RankedPracticeQueueIntent };

const legacyKey = 'amordle:combat:ranked-practice:provisional';

function storageKey(userId: string): string {
  return `amordle:combat:ranked-practice:queue:v2:${userId}`;
}

export function readRankedPracticeQueueIntent(userId: string): RankedPracticeQueueIntentRead {
  try {
    sessionStorage.removeItem(legacyKey);
    const key = storageKey(userId);
    const raw = sessionStorage.getItem(key);
    if (!raw) return { status: 'missing' };
    const parsed = rankedPracticeQueueIntentSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.ownerUserId !== userId) {
      sessionStorage.removeItem(key);
      return { status: 'corrupt' };
    }
    return { status: 'valid', intent: parsed.data };
  } catch {
    try {
      sessionStorage.removeItem(storageKey(userId));
    } catch {
      // A disabled storage surface is reported as corrupt and remains fail-closed.
    }
    return { status: 'corrupt' };
  }
}

export function writeRankedPracticeQueueIntent(intent: RankedPracticeQueueIntent): void {
  const parsed = rankedPracticeQueueIntentSchema.parse(intent);
  sessionStorage.setItem(storageKey(parsed.ownerUserId), JSON.stringify(parsed));
}

export function removeRankedPracticeQueueIntent(userId: string): void {
  sessionStorage.removeItem(storageKey(userId));
}

export function normalizeRankedPracticeConfig(config: RankedPracticeConfig): RankedPracticeConfig {
  return rankedPracticeConfigSchema.parse(config);
}

export const rankedDailyQueueIntentSchema = z
  .object({
    schemaVersion: z.literal(3),
    ownerUserId: z.string().uuid(),
    dailyDateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    mode: z.enum(['og', 'go']),
    hardMode: z.boolean(),
    requestId: z.string().min(1),
    matchedGameId: z.string().min(1),
    creationKey: z.string().min(1),
    claimActionId: z.string().min(1),
    finalizeActionId: z.string().min(1),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type RankedDailyQueueIntent = z.infer<typeof rankedDailyQueueIntentSchema>;

export type RankedDailyQueueIntentRead =
  | { status: 'missing' }
  | { status: 'corrupt' }
  | { status: 'valid'; intent: RankedDailyQueueIntent };

const legacyRankedDailyKey = 'amordle:combat:ranked-daily:intent';

function rankedDailyStorageKey(userId: string): string {
  return `amordle:combat:ranked-daily:queue:v3:${userId}`;
}

export function readRankedDailyQueueIntent(userId: string): RankedDailyQueueIntentRead {
  try {
    sessionStorage.removeItem(legacyRankedDailyKey);
    const key = rankedDailyStorageKey(userId);
    const raw = sessionStorage.getItem(key);
    if (!raw) return { status: 'missing' };
    const parsed = rankedDailyQueueIntentSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.ownerUserId !== userId) {
      sessionStorage.removeItem(key);
      return { status: 'corrupt' };
    }
    return { status: 'valid', intent: parsed.data };
  } catch {
    try {
      sessionStorage.removeItem(rankedDailyStorageKey(userId));
    } catch {
      // Disabled session storage fails closed and leaves no cross-account intent.
    }
    return { status: 'corrupt' };
  }
}

export function writeRankedDailyQueueIntent(intent: RankedDailyQueueIntent): void {
  const parsed = rankedDailyQueueIntentSchema.parse(intent);
  sessionStorage.setItem(rankedDailyStorageKey(parsed.ownerUserId), JSON.stringify(parsed));
}

export function removeRankedDailyQueueIntent(userId: string): void {
  sessionStorage.removeItem(rankedDailyStorageKey(userId));
}
