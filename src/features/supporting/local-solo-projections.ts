import { currentGoPuzzle, restoreGoSession } from '../../domain/go';
import { restoreOgSession } from '../../domain/game';
import {
  ownerStorageSegment,
  sameIdentityScope,
  type IdentityScope,
  type StorageLike,
} from '../../persistence/local-repository';
import type { SoloSession } from '../play/solo-session-repository';
import { readSoloHistory } from '../play/solo-history-repository';

export type LocalSoloProjection = {
  readonly id: string;
  readonly mode: 'og' | 'go';
  readonly scope: 'daily' | 'practice';
  readonly status: 'playing' | 'won' | 'lost';
  readonly wordLength: number;
  readonly route: string;
  readonly label: string;
  readonly detail: string;
  readonly result: 'Won' | 'Lost' | null;
  readonly acceptedGuesses: number;
  readonly puzzleCount: number;
  readonly completedPuzzles: number;
  readonly dateKey: string | null;
  readonly updatedAt: string;
};

type StoredEnvelope = {
  readonly owner?: unknown;
  readonly updatedAt?: unknown;
  readonly payload?: unknown;
};

function restoreSession(payload: unknown): SoloSession | undefined {
  return restoreOgSession(payload) ?? restoreGoSession(payload);
}

function dailyDateKey(session: SoloSession): string | null {
  if (session.scope !== 'daily') return null;
  const match = /^daily:(?:og|go):(\d{4}-\d{2}-\d{2})(?::|$)/.exec(session.id);
  return match?.[1] ?? null;
}

function sessionRoute(session: SoloSession): string {
  const base = `/play/${session.scope}/${session.mode}`;
  if (session.scope === 'daily') {
    const dateKey = dailyDateKey(session);
    return dateKey ? `${base}?date=${encodeURIComponent(dateKey)}` : base;
  }
  const puzzle = session.mode === 'go' ? currentGoPuzzle(session) : session;
  const search = new URLSearchParams({
    length: String(puzzle.wordLength),
    difficulty: session.difficulty,
  });
  if (session.hardMode) search.set('hard', '1');
  if (session.mode === 'go') search.set('count', String(session.puzzles.length));
  return `${base}?${search}`;
}

function projectSession(session: SoloSession, envelopeUpdatedAt: string): LocalSoloProjection {
  const puzzle = session.mode === 'go' ? currentGoPuzzle(session) : session;
  const puzzleCount = session.mode === 'go' ? session.puzzles.length : 1;
  const completedPuzzles =
    session.mode === 'go'
      ? session.puzzles.filter((candidate) => candidate.status === 'won').length
      : session.status === 'won'
        ? 1
        : 0;
  const acceptedGuesses =
    session.mode === 'go'
      ? session.puzzles.reduce((total, candidate) => total + candidate.guesses.length, 0)
      : session.guesses.length;
  const draftLetters = puzzle.draft.filter(Boolean).length;
  const detail =
    session.mode === 'go'
      ? `Puzzle ${session.currentPuzzleIndex + 1}/${puzzleCount} · ${puzzle.guesses.length}/${puzzle.maxAttempts} guesses · ${session.priorAnswers.length} prior ${session.priorAnswers.length === 1 ? 'answer' : 'answers'} carried`
      : `${puzzle.guesses.length}/${puzzle.maxAttempts} guesses${draftLetters > 0 ? ` · draft ${draftLetters}/${puzzle.wordLength}` : ''}`;

  return {
    id: session.id,
    mode: session.mode,
    scope: session.scope,
    status: session.status,
    wordLength: puzzle.wordLength,
    route: sessionRoute(session),
    label: `${session.scope === 'daily' ? 'Daily' : 'Practice'} Solo · ${session.mode.toUpperCase()} · ${puzzle.wordLength}L`,
    detail,
    result: session.status === 'playing' ? null : session.status === 'won' ? 'Won' : 'Lost',
    acceptedGuesses,
    puzzleCount,
    completedPuzzles,
    dateKey: dailyDateKey(session),
    updatedAt: envelopeUpdatedAt,
  };
}

/** Read-only view projection. It never creates, repairs, migrates, or clears durable state. */
export function readLocalSoloProjections(
  identity: IdentityScope,
  storage: StorageLike | undefined = typeof localStorage === 'undefined' ? undefined : localStorage,
): readonly LocalSoloProjection[] {
  if (!storage) return [];
  const suffix = `:${ownerStorageSegment(identity)}`;
  const latestBySession = new Map<string, LocalSoloProjection>();
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key?.startsWith('amordle:solo:') || !key.endsWith(suffix)) continue;
      const raw = storage.getItem(key);
      if (!raw) continue;
      let envelope: StoredEnvelope;
      try {
        envelope = JSON.parse(raw) as StoredEnvelope;
      } catch {
        continue;
      }
      if (
        typeof envelope.owner !== 'object' ||
        envelope.owner === null ||
        !sameIdentityScope(envelope.owner as IdentityScope, identity) ||
        typeof envelope.updatedAt !== 'string' ||
        Number.isNaN(Date.parse(envelope.updatedAt))
      ) {
        continue;
      }
      const session = restoreSession(envelope.payload);
      if (!session) continue;
      // Terminal sessions become visible only after the explicit completion
      // decision has produced a sanitized History entry.
      if (session.status !== 'playing') continue;
      const projection = projectSession(session, envelope.updatedAt);
      const prior = latestBySession.get(session.id);
      if (!prior || Date.parse(projection.updatedAt) > Date.parse(prior.updatedAt)) {
        latestBySession.set(session.id, projection);
      }
    }
    for (const entry of readSoloHistory(identity, storage)) {
      latestBySession.set(entry.id, {
        id: entry.id,
        mode: entry.mode,
        scope: entry.scope,
        status: entry.status,
        wordLength: entry.wordLength,
        route: '/history',
        label: `${entry.scope === 'daily' ? 'Daily' : 'Practice'} Solo · ${entry.mode.toUpperCase()} · ${entry.wordLength}L`,
        detail: `${entry.acceptedGuesses} accepted ${entry.acceptedGuesses === 1 ? 'guess' : 'guesses'}${entry.mode === 'go' ? ` · ${entry.completedPuzzles}/${entry.puzzleCount} puzzles solved` : ''}`,
        result: entry.status === 'won' ? 'Won' : 'Lost',
        acceptedGuesses: entry.acceptedGuesses,
        puzzleCount: entry.puzzleCount,
        completedPuzzles: entry.completedPuzzles,
        dateKey: entry.dateKey ?? null,
        updatedAt: entry.completedAt,
      });
    }
  } catch {
    return [];
  }
  return [...latestBySession.values()].sort(
    (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
  );
}
