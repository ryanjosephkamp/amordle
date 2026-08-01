'use client';

import { listEnvelopes, mutateEnvelope, readEnvelope, writeEnvelope } from '@/adapters/indexeddb';
import type { VersionedEnvelope } from '@/adapters/indexeddb';
import {
  loadCloudSoloEnvelopes,
  loadCloudSoloRegistry,
  mutateCloudSoloRegistry,
} from '@/adapters/cloud/solo';
import type { GameSession } from '@/domain/game';
import { gameSessionSchema } from '@/features/solo/session-schema';
import {
  emptySoloSessionRegistry,
  mergeSoloSessionRegistries,
  reserveSoloSession,
  setSoloSessionLifecycle,
  soloSessionRegistryDomain,
  soloSessionRegistryForOwner,
  soloSessionRegistrySchema,
  upsertSoloSession,
} from '@/domain/solo-sessions';
import type { SoloSessionRegistry, SoloSessionSummary } from '@/domain/solo-sessions';

function legacyResumeHref(session: GameSession): string | null {
  if (session.id.startsWith('daily:')) {
    const [, localDate, mode] = session.id.split(':');
    return localDate && (mode === 'og' || mode === 'go')
      ? `/play/solo/daily/${localDate}/${mode}`
      : null;
  }
  const currentPractice = session.id.match(/^practice:(og|go):([0-9a-f]{8}-[0-9a-f-]{27,})$/i);
  if (currentPractice) {
    const [, mode, sessionToken] = currentPractice;
    const query = new URLSearchParams({
      length: String(session.settings.length),
      difficulty: session.settings.difficulty,
      hard: session.settings.hardMode ? '1' : '0',
      generation: '0',
      session: sessionToken ?? '',
      ...(mode === 'go' ? { count: String(session.settings.goCount) } : {}),
    });
    return `/play/solo/practice/${mode}?${query.toString()}`;
  }
  const [lane, mode, length, difficulty, hard, count, generation] = session.id.split(':');
  if (
    lane !== 'practice' ||
    (mode !== 'og' && mode !== 'go') ||
    !length ||
    !difficulty ||
    !count ||
    !generation
  ) {
    return null;
  }
  const query = new URLSearchParams({
    length,
    difficulty,
    hard: hard === 'hard' ? '1' : '0',
    generation,
    ...(mode === 'go' ? { count } : {}),
  });
  return `/play/solo/practice/${mode}?${query.toString()}`;
}

function summaryFromEnvelope(
  ownerNamespace: string,
  envelope: VersionedEnvelope<GameSession>,
): SoloSessionSummary | null {
  const session = envelope.state;
  if (session.status === 'won' || session.status === 'lost') return null;
  const resumeHref = legacyResumeHref(session);
  if (!resumeHref) return null;
  const dailyMatch = session.id.match(/^daily:(\d{4}-\d{2}-\d{2}):(?:og|go):/);
  return {
    schemaVersion: 2,
    id: session.id,
    ownerNamespace,
    lane: dailyMatch ? 'daily' : 'practice',
    settings: session.settings,
    localDate: dailyMatch?.[1] ?? null,
    resumeHref,
    lifecycle: 'active',
    acceptedGuesses: session.rows.filter((row) => row.kind === 'accepted').length,
    puzzleIndex: session.puzzleIndex,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    lastPlayedAt: session.updatedAt,
  };
}

async function localMutation(
  ownerNamespace: string,
  transform: (registry: SoloSessionRegistry) => SoloSessionRegistry,
) {
  return mutateEnvelope(
    ownerNamespace,
    soloSessionRegistryDomain,
    soloSessionRegistrySchema,
    emptySoloSessionRegistry(),
    transform,
  );
}

async function reconcileRegistry(
  ownerNamespace: string,
  local: VersionedEnvelope<SoloSessionRegistry> | null,
  remote: VersionedEnvelope<SoloSessionRegistry> | null,
) {
  const state = mergeSoloSessionRegistries(
    soloSessionRegistryForOwner(local?.state ?? emptySoloSessionRegistry(), ownerNamespace),
    soloSessionRegistryForOwner(remote?.state ?? emptySoloSessionRegistry(), ownerNamespace),
  );
  const envelope: VersionedEnvelope<SoloSessionRegistry> = {
    schemaVersion: 1,
    ownerNamespace,
    domain: soloSessionRegistryDomain,
    revision: Math.max(local?.revision ?? 0, remote?.revision ?? 0),
    updatedAt:
      [local?.updatedAt, remote?.updatedAt].filter(Boolean).sort().at(-1) ??
      new Date().toISOString(),
    state,
  };
  await writeEnvelope(envelope);
  return state;
}

export async function loadSoloSessionRegistry(
  ownerNamespace: string,
  userId?: string,
): Promise<SoloSessionRegistry> {
  const local = await readEnvelope(
    ownerNamespace,
    soloSessionRegistryDomain,
    soloSessionRegistrySchema,
  );
  let remote: VersionedEnvelope<SoloSessionRegistry> | null = null;
  const localGames = await listEnvelopes(ownerNamespace, 'solo:', gameSessionSchema);
  let legacySummaries = localGames.flatMap((envelope) => {
    const summary = summaryFromEnvelope(ownerNamespace, envelope);
    return summary ? [summary] : [];
  });
  if (userId) {
    try {
      const [cloudRegistry, cloudGames] = await Promise.all([
        loadCloudSoloRegistry(userId),
        loadCloudSoloEnvelopes(userId),
      ]);
      remote =
        cloudRegistry?.ownerNamespace === ownerNamespace
          ? {
              ...cloudRegistry,
              state: soloSessionRegistryForOwner(cloudRegistry.state, ownerNamespace),
            }
          : null;
      legacySummaries = [
        ...legacySummaries,
        ...cloudGames.flatMap((envelope) => {
          const summary = summaryFromEnvelope(ownerNamespace, envelope);
          return summary ? [summary] : [];
        }),
      ];
    } catch {
      // The local registry remains usable offline and is reconciled on the next entry.
    }
  }
  const reconciled = await reconcileRegistry(ownerNamespace, local, remote);
  const withLegacy = legacySummaries.reduce(upsertSoloSession, reconciled);
  await writeEnvelope({
    schemaVersion: 1,
    ownerNamespace,
    domain: soloSessionRegistryDomain,
    revision: Math.max(local?.revision ?? 0, remote?.revision ?? 0) + 1,
    updatedAt: new Date().toISOString(),
    state: withLegacy,
  });
  return withLegacy;
}

async function mutateSoloRegistry(
  ownerNamespace: string,
  userId: string | undefined,
  transform: (registry: SoloSessionRegistry) => SoloSessionRegistry,
) {
  const local = await localMutation(ownerNamespace, transform);
  if (!userId) return local.state;
  try {
    const remote = await mutateCloudSoloRegistry(userId, ownerNamespace, (registry) =>
      transform(mergeSoloSessionRegistries(registry, local.state)),
    );
    return reconcileRegistry(ownerNamespace, local, remote);
  } catch {
    return local.state;
  }
}

export function reserveSoloSessionSummary(
  ownerNamespace: string,
  userId: string | undefined,
  summary: SoloSessionSummary,
) {
  return mutateSoloRegistry(ownerNamespace, userId, (registry) =>
    reserveSoloSession(registry, summary),
  );
}

export function registerSoloSessionSummary(
  ownerNamespace: string,
  userId: string | undefined,
  summary: SoloSessionSummary,
) {
  return mutateSoloRegistry(ownerNamespace, userId, (registry) =>
    registry.sessions[summary.id]
      ? upsertSoloSession(registry, summary)
      : reserveSoloSession(registry, summary),
  );
}

export function upsertSoloSessionSummary(
  ownerNamespace: string,
  userId: string | undefined,
  summary: SoloSessionSummary,
) {
  return mutateSoloRegistry(ownerNamespace, userId, (registry) =>
    upsertSoloSession(registry, summary),
  );
}

export function abandonSoloSession(
  ownerNamespace: string,
  userId: string | undefined,
  sessionId: string,
) {
  const updatedAt = new Date().toISOString();
  return mutateSoloRegistry(ownerNamespace, userId, (registry) =>
    setSoloSessionLifecycle(registry, sessionId, 'abandoned', updatedAt),
  );
}
