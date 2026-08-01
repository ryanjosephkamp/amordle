'use client';

import { z } from 'zod';
import type { GameSession } from '@/domain/game';
import { gameSessionSchema } from '@/features/solo/session-schema';
import type { VersionedEnvelope } from '@/adapters/indexeddb';
import {
  finalizeAccountHistoryRow,
  loadProgress,
  progressSchema,
  writeAccountProgressCas,
} from './account';
import { ServiceError } from './shared';
import { historyRowSchema } from '@/domain/account-continuity';
import type { AccountHistoryRow } from '@/domain/account-continuity';

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

export async function loadCloudSolo(
  userId: string,
  domain: string,
): Promise<VersionedEnvelope<GameSession> | null> {
  const progress = await loadProgress(userId);
  const candidate = progress.solo?.[domain];
  if (candidate === undefined) return null;
  const envelope = envelopeSchema.safeParse(candidate);
  return envelope.success ? envelope.data : null;
}

async function writeSnapshotCas(
  userId: string,
  transform: (snapshot: z.infer<typeof progressSchema>) => z.infer<typeof progressSchema>,
): Promise<z.infer<typeof progressSchema>> {
  return writeAccountProgressCas(userId, transform);
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
  return finalizeAccountHistoryRow(buildSoloHistoryRow(userId, session, kind, dailyDate));
}

export function buildSoloHistoryRow(
  userId: string,
  session: GameSession,
  kind: 'solo-practice' | 'solo-daily',
  dailyDate?: string,
): AccountHistoryRow {
  const reward = soloReward(session);
  const acceptedGuesses = session.rows.filter((row) => row.kind === 'accepted').length;
  const puzzlesSolved = new Set(
    session.rows
      .filter(
        (row) => row.kind === 'accepted' && row.tiles.every((tile) => tile.state === 'correct'),
      )
      .map((row) => row.puzzleIndex),
  ).size;
  return historyRowSchema.parse({
    id: `solo:${session.id}`,
    user_id: userId,
    completed_at: session.updatedAt,
    entry: {
      schemaVersion: 3,
      kind,
      lane: dailyDate ? 'daily' : 'practice',
      mode: session.settings.mode,
      ranked: false,
      result: session.status,
      terminalReason: session.status === 'won' ? 'solved' : 'attempts_exhausted',
      wordLength: session.settings.length,
      difficulty: session.settings.difficulty,
      hardMode: session.settings.hardMode,
      goPuzzleCount: session.settings.mode === 'go' ? session.settings.goCount : null,
      acceptedGuesses,
      puzzlesSolved,
      points: null,
      rewardCoins: reward.coins,
      rewardXp: reward.xp,
      ...(dailyDate === undefined ? {} : { dailyDate }),
      ratingDelta: null,
      revealedAnswers: session.answers.slice(0, session.puzzleIndex + 1),
    },
  });
}
