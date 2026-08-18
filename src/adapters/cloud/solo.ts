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
import {
  emptySoloSessionRegistry,
  mergeSoloSessionRegistries,
  soloSessionRegistryForOwner,
  soloSessionRegistryDomain,
  soloSessionRegistrySchema,
} from '@/domain/solo-sessions';
import type { SoloSessionRegistry } from '@/domain/solo-sessions';

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

const registryEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    ownerNamespace: z.string().min(1),
    domain: z.literal(soloSessionRegistryDomain),
    revision: z.number().int().nonnegative(),
    updatedAt: z.iso.datetime({ offset: true }),
    state: soloSessionRegistrySchema,
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

export async function loadCloudSoloEnvelopes(
  userId: string,
): Promise<VersionedEnvelope<GameSession>[]> {
  const progress = await loadProgress(userId);
  return Object.entries(progress.solo ?? {}).flatMap(([domain, value]) => {
    if (domain === soloSessionRegistryDomain) return [];
    const parsed = envelopeSchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
}

async function writeSnapshotCas(
  userId: string,
  transform: (snapshot: z.infer<typeof progressSchema>) => z.infer<typeof progressSchema>,
): Promise<z.infer<typeof progressSchema>> {
  return writeAccountProgressCas(userId, transform);
}

/*
 * `setDailyEntitlement` is gone rather than deprecated.
 *
 * It wrote the entitlement into the owner-writable progress snapshot, which is
 * the thing the 2026-08-18 migration moved out. Leaving a working writer next
 * to the new authority would have kept the old grant path open, and a caller
 * that still compiled would have kept using it. The replacements live in
 * ./account: unlockDailyEntitlement charges and grants together, and
 * markDailyEntitlementUnlocked advances a grant that already exists.
 */

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

export async function loadCloudSoloRegistry(
  userId: string,
): Promise<VersionedEnvelope<SoloSessionRegistry> | null> {
  const progress = await loadProgress(userId);
  const parsed = registryEnvelopeSchema.safeParse(progress.solo?.[soloSessionRegistryDomain]);
  return parsed.success ? parsed.data : null;
}

export async function mutateCloudSoloRegistry(
  userId: string,
  ownerNamespace: string,
  transform: (registry: SoloSessionRegistry) => SoloSessionRegistry,
): Promise<VersionedEnvelope<SoloSessionRegistry>> {
  let result: VersionedEnvelope<SoloSessionRegistry> | null = null;
  await writeSnapshotCas(userId, (snapshot) => {
    const parsed = registryEnvelopeSchema.safeParse(snapshot.solo?.[soloSessionRegistryDomain]);
    const current =
      parsed.success && parsed.data.ownerNamespace === ownerNamespace
        ? {
            ...parsed.data,
            state: soloSessionRegistryForOwner(parsed.data.state, ownerNamespace),
          }
        : null;
    const nextState = soloSessionRegistrySchema.parse(
      transform(current?.state ?? emptySoloSessionRegistry()),
    );
    result = {
      schemaVersion: 1,
      ownerNamespace,
      domain: soloSessionRegistryDomain,
      revision: (current?.revision ?? 0) + 1,
      updatedAt: new Date().toISOString(),
      state: current ? mergeSoloSessionRegistries(current.state, nextState) : nextState,
    };
    return {
      ...snapshot,
      revision: snapshot.revision + 1,
      solo: { ...snapshot.solo, [soloSessionRegistryDomain]: result },
    };
  });
  if (!result) throw new ServiceError('Solo session registry was not saved.', 'INVALID_STATE');
  return registryEnvelopeSchema.parse(result);
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
