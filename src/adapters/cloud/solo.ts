'use client';

import { z } from 'zod';
import type { GameSession } from '@/domain/game';
import type { Json } from '@/types/database';
import { levelForXp } from '@/domain/economy';
import { gameSessionSchema } from '@/features/solo/session-schema';
import type { VersionedEnvelope } from '@/adapters/indexeddb';
import { getBrowserSupabase } from './browser';
import { creditCoins, progressSchema } from './account';
import { parseServiceResult, ServiceError, throwServiceError } from './shared';

const envelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    ownerNamespace: z.string(),
    domain: z.string(),
    revision: z.number().int().nonnegative(),
    updatedAt: z.string(),
    state: gameSessionSchema,
  })
  .strict();

const snapshotRowSchema = z
  .object({
    progress: progressSchema,
    updated_at: z.string(),
  })
  .strict();

function client() {
  const value = getBrowserSupabase();
  if (!value) throw new ServiceError('Solo cloud saves are unavailable.', 'UNAVAILABLE');
  return value;
}

export async function loadCloudSolo(
  userId: string,
  domain: string,
): Promise<VersionedEnvelope<GameSession> | null> {
  const { data, error } = await client()
    .from('progress_snapshots')
    .select('progress,updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throwServiceError(error);
  if (!data) return null;
  const snapshot = parseServiceResult(snapshotRowSchema, data);
  const candidate = snapshot.progress.solo?.[domain];
  if (candidate === undefined) return null;
  const envelope = envelopeSchema.safeParse(candidate);
  return envelope.success ? envelope.data : null;
}

async function writeSnapshotCas(
  userId: string,
  transform: (snapshot: z.infer<typeof progressSchema>) => z.infer<typeof progressSchema>,
): Promise<z.infer<typeof progressSchema>> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await client()
      .from('progress_snapshots')
      .select('progress,updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throwServiceError(error);
    const current = data
      ? parseServiceResult(snapshotRowSchema, data)
      : {
          progress: progressSchema.parse({
            schemaVersion: 1,
            xp: 0,
            level: 1,
            dailyStreak: 0,
            revision: 0,
            solo: {},
            appliedRewards: {},
            dailyEntitlements: {},
          }),
          updated_at: null,
        };
    const next = progressSchema.parse(transform(current.progress));
    const updatedAt = new Date().toISOString();
    if (current.updated_at === null) {
      const inserted = await client()
        .from('progress_snapshots')
        .insert({ user_id: userId, progress: next as Json, updated_at: updatedAt });
      if (!inserted.error) return next;
      if (inserted.error.code !== '23505') throwServiceError(inserted.error);
      continue;
    }
    const updated = await client()
      .from('progress_snapshots')
      .update({ progress: next as Json, updated_at: updatedAt })
      .eq('user_id', userId)
      .eq('updated_at', current.updated_at)
      .select('user_id');
    if (updated.error) throwServiceError(updated.error);
    if (updated.data.length === 1) return next;
  }
  throw new ServiceError(
    'A newer Solo save arrived first. Reload before retrying.',
    'STALE_REVISION',
  );
}

export async function setDailyEntitlement(
  userId: string,
  key: string,
  state: 'pending' | 'unlocked',
) {
  return writeSnapshotCas(userId, (snapshot) => {
    const current = snapshot.dailyEntitlements?.[key];
    if (current === 'unlocked' || current === state) return snapshot;
    return {
      ...snapshot,
      revision: snapshot.revision + 1,
      dailyEntitlements: { ...snapshot.dailyEntitlements, [key]: state },
    };
  });
}

export async function saveCloudSolo(userId: string, envelope: VersionedEnvelope<GameSession>) {
  const parsed = envelopeSchema.parse(envelope);
  return writeSnapshotCas(userId, (snapshot) => {
    const currentValue = snapshot.solo?.[parsed.domain];
    const current = envelopeSchema.safeParse(currentValue);
    if (
      current.success &&
      (current.data.revision > parsed.revision ||
        (current.data.revision === parsed.revision &&
          Date.parse(current.data.updatedAt) >= Date.parse(parsed.updatedAt)))
    ) {
      return snapshot;
    }
    return {
      ...snapshot,
      revision: snapshot.revision + 1,
      solo: { ...snapshot.solo, [parsed.domain]: parsed },
    };
  });
}

export function soloReward(session: GameSession): { coins: number; xp: number } {
  const accepted = session.rows.filter((row) => row.kind === 'accepted').length;
  const puzzlesSolved = new Set(
    session.rows
      .filter(
        (row) => row.kind === 'accepted' && row.tiles.every((tile) => tile.state === 'correct'),
      )
      .map((row) => row.puzzleIndex),
  ).size;
  return {
    coins: session.status === 'won' ? 8 + puzzlesSolved * 4 : Math.min(4, puzzlesSolved),
    xp:
      session.status === 'won'
        ? 40 + puzzlesSolved * 20 + Math.max(0, 10 - accepted)
        : puzzlesSolved * 10,
  };
}

export async function finalizeSignedInSolo(
  userId: string,
  session: GameSession,
  kind: 'solo-practice' | 'solo-daily',
  dailyDate?: string,
) {
  if (session.status !== 'won' && session.status !== 'lost') {
    throw new ServiceError('Only terminal games can be finalized.', 'INVALID_STATE');
  }
  const operationId = `solo-reward:${session.id}`;
  const reward = soloReward(session);
  const acceptedGuesses = session.rows.filter((row) => row.kind === 'accepted').length;
  const puzzlesSolved = new Set(
    session.rows
      .filter(
        (row) => row.kind === 'accepted' && row.tiles.every((tile) => tile.state === 'correct'),
      )
      .map((row) => row.puzzleIndex),
  ).size;
  const { error } = await client()
    .from('game_history')
    .upsert({
      id: `solo:${session.id}`,
      user_id: userId,
      completed_at: session.updatedAt,
      entry: {
        schemaVersion: 1,
        kind,
        mode: session.settings.mode,
        result: session.status,
        wordLength: session.settings.length,
        acceptedGuesses,
        puzzlesSolved,
        rewardCoins: reward.coins,
        rewardXp: reward.xp,
        ...(dailyDate === undefined ? {} : { dailyDate }),
      },
    });
  if (error) throwServiceError(error);
  if (reward.coins > 0) await creditCoins(reward.coins, operationId);
  await writeSnapshotCas(userId, (snapshot) => {
    if (snapshot.appliedRewards?.[operationId] !== undefined) return snapshot;
    const xp = snapshot.xp + reward.xp;
    return {
      ...snapshot,
      xp,
      level: levelForXp(xp),
      revision: snapshot.revision + 1,
      appliedRewards: { ...snapshot.appliedRewards, [operationId]: reward.xp },
    };
  });
}
