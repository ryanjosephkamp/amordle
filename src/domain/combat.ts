import { scoreGuess, type ScoredTile } from './game';
import type { WordLength } from './words';

export const TILE_POINTS = { absent: 0, present: 2, correct: 5 } as const;
export const SOLVED_PUZZLE_BONUS = 100;
export const UNUSED_ATTEMPT_BONUS = 10;
export const HARD_MODE_SOLVE_BONUS = 15;
export const INITIAL_RATING = 1200;
export const PROVISIONAL_GAMES = 10;
export const PROVISIONAL_K_FACTOR = 40;
export const ESTABLISHED_K_FACTOR = 24;
export const ELO_SCALE = 400;
export const CANONICAL_RANKED_TIME_LIMIT_MS = 300_000;
export const SHARED_COMBAT_BASE_ROWS = 6;

export function sharedCombatRowCapacity(input: {
  seededRows: number;
  acceptedMoves: number;
  hasActiveDraft: boolean;
  attemptBudget: number;
}): number {
  for (const value of [input.seededRows, input.acceptedMoves, input.attemptBudget]) {
    if (!Number.isInteger(value) || value < 0) {
      throw new RangeError('Shared COMBAT row evidence must use non-negative integers.');
    }
  }
  return Math.max(
    SHARED_COMBAT_BASE_ROWS,
    input.seededRows + input.acceptedMoves + (input.hasActiveDraft ? 1 : 0),
  );
}

export type CombatMode = 'og' | 'go';
export type CombatScope = 'practice' | 'daily';
export type CombatOutcomeReason = 'cancellation' | 'forfeit' | 'timeout' | 'og_solve' | 'points';
export type PlayerResult = 'win' | 'loss' | 'draw';
export type RatingBucket =
  | 'multiplayer:og'
  | 'multiplayer:go'
  | 'multiplayer:og:timed:v1'
  | 'multiplayer:go:timed:v1'
  | 'multiplayer:og:daily:v1'
  | 'multiplayer:go:daily:v1';
export type RankBand = 'Learner' | 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond' | 'Master';

export interface PlayerPuzzlePerformance {
  readonly guesses: readonly (readonly ScoredTile[])[];
  readonly solved: boolean;
  readonly maxAttempts: number;
  readonly hardMode: boolean;
}

export function tilePoints(tiles: readonly ScoredTile[]): number {
  return tiles.reduce((points, tile) => points + TILE_POINTS[tile.state], 0);
}

export function puzzlePoints(performance: PlayerPuzzlePerformance): number {
  const livePoints = performance.guesses.reduce((points, tiles) => points + tilePoints(tiles), 0);
  if (!performance.solved) return livePoints;
  const unusedAttempts = Math.max(0, performance.maxAttempts - performance.guesses.length);
  return (
    livePoints +
    SOLVED_PUZZLE_BONUS +
    unusedAttempts * UNUSED_ATTEMPT_BONUS +
    (performance.hardMode ? HARD_MODE_SOLVE_BONUS : 0)
  );
}

export function playerCombatPoints(puzzles: readonly PlayerPuzzlePerformance[]): number {
  return puzzles.reduce((total, puzzle) => total + puzzlePoints(puzzle), 0);
}

export type CombatOutcome =
  | {
      readonly kind: 'cancelled';
      readonly reason: 'cancellation';
      readonly winnerId: null;
      readonly loserId: null;
      readonly revealAnswer: false;
    }
  | {
      readonly kind: 'draw';
      readonly reason: 'points';
      readonly winnerId: null;
      readonly loserId: null;
      readonly revealAnswer: true;
    }
  | {
      readonly kind: 'win';
      readonly reason: Exclude<CombatOutcomeReason, 'cancellation'>;
      readonly winnerId: string;
      readonly loserId: string;
      readonly revealAnswer: true;
    };

export interface DetermineCombatOutcomeInput {
  readonly playerIds: readonly [string, string];
  readonly submittedGuessCount: number;
  readonly points: Readonly<Record<string, number>>;
  readonly forfeitingPlayerId?: string;
  readonly timedOutPlayerId?: string;
  readonly ogSolvedByPlayerId?: string;
}

function opponentOf(playerIds: readonly [string, string], playerId: string): string {
  if (playerIds[0] === playerId) return playerIds[1];
  if (playerIds[1] === playerId) return playerIds[0];
  throw new RangeError('Outcome actor must be a participant.');
}

export function determineCombatOutcome(input: DetermineCombatOutcomeInput): CombatOutcome {
  if (input.playerIds[0] === input.playerIds[1])
    throw new RangeError('COMBAT requires distinct players.');
  if (input.forfeitingPlayerId && input.submittedGuessCount === 0) {
    opponentOf(input.playerIds, input.forfeitingPlayerId);
    return {
      kind: 'cancelled',
      reason: 'cancellation',
      winnerId: null,
      loserId: null,
      revealAnswer: false,
    };
  }
  if (input.forfeitingPlayerId) {
    return {
      kind: 'win',
      reason: 'forfeit',
      winnerId: opponentOf(input.playerIds, input.forfeitingPlayerId),
      loserId: input.forfeitingPlayerId,
      revealAnswer: true,
    };
  }
  if (input.timedOutPlayerId) {
    return {
      kind: 'win',
      reason: 'timeout',
      winnerId: opponentOf(input.playerIds, input.timedOutPlayerId),
      loserId: input.timedOutPlayerId,
      revealAnswer: true,
    };
  }
  if (input.ogSolvedByPlayerId) {
    return {
      kind: 'win',
      reason: 'og_solve',
      winnerId: input.ogSolvedByPlayerId,
      loserId: opponentOf(input.playerIds, input.ogSolvedByPlayerId),
      revealAnswer: true,
    };
  }
  const [left, right] = input.playerIds;
  const leftPoints = input.points[left] ?? 0;
  const rightPoints = input.points[right] ?? 0;
  if (leftPoints === rightPoints) {
    return { kind: 'draw', reason: 'points', winnerId: null, loserId: null, revealAnswer: true };
  }
  const winnerId = leftPoints > rightPoints ? left : right;
  return {
    kind: 'win',
    reason: 'points',
    winnerId,
    loserId: opponentOf(input.playerIds, winnerId),
    revealAnswer: true,
  };
}

export function expectedEloScore(rating: number, opponentRating: number): number {
  const exponent = Math.max(-10, Math.min(10, (opponentRating - rating) / ELO_SCALE));
  return Math.max(0, Math.min(1, 1 / (1 + 10 ** exponent)));
}

export function eloKFactor(gamesPlayed: number): number {
  return Math.max(0, Math.trunc(gamesPlayed)) < PROVISIONAL_GAMES
    ? PROVISIONAL_K_FACTOR
    : ESTABLISHED_K_FACTOR;
}

export interface EloUpdate {
  readonly oldRating: number;
  readonly newRating: number;
  readonly ratingDelta: number;
  readonly expectedScore: number;
  readonly kFactor: number;
  readonly gamesPlayed: number;
  readonly newGamesPlayed: number;
  readonly provisional: boolean;
}

export function calculateEloUpdate(input: {
  readonly rating: number;
  readonly opponentRating: number;
  readonly gamesPlayed: number;
  readonly result: PlayerResult;
}): EloUpdate {
  const oldRating = Number.isFinite(input.rating) ? Math.round(input.rating) : INITIAL_RATING;
  const opponentRating = Number.isFinite(input.opponentRating)
    ? Math.round(input.opponentRating)
    : INITIAL_RATING;
  const gamesPlayed = Math.max(0, Math.trunc(input.gamesPlayed));
  const expectedScore = expectedEloScore(oldRating, opponentRating);
  const actualScore = input.result === 'win' ? 1 : input.result === 'draw' ? 0.5 : 0;
  const kFactor = eloKFactor(gamesPlayed);
  const rawDelta = kFactor * (actualScore - expectedScore);
  // PostgreSQL numeric round resolves exact halves away from zero.
  const ratingDelta = rawDelta < 0 ? -Math.round(-rawDelta) : Math.round(rawDelta);
  const newGamesPlayed = gamesPlayed + 1;
  return {
    oldRating,
    newRating: oldRating + ratingDelta,
    ratingDelta,
    expectedScore,
    kFactor,
    gamesPlayed,
    newGamesPlayed,
    provisional: newGamesPlayed < PROVISIONAL_GAMES,
  };
}

export function rankBandForRating(rating: number): RankBand {
  if (rating < 900) return 'Learner';
  if (rating < 1100) return 'Bronze';
  if (rating < 1300) return 'Silver';
  if (rating < 1500) return 'Gold';
  if (rating < 1700) return 'Platinum';
  if (rating < 1900) return 'Diamond';
  return 'Master';
}

export function ratingBucketFor(input: {
  readonly scope: CombatScope;
  readonly mode: CombatMode;
  readonly timeLimitMs?: number;
}): RatingBucket | undefined {
  if (input.scope === 'daily') {
    if (input.timeLimitMs !== undefined) return undefined;
    return input.mode === 'og' ? 'multiplayer:og:daily:v1' : 'multiplayer:go:daily:v1';
  }
  if (input.timeLimitMs === undefined)
    return input.mode === 'og' ? 'multiplayer:og' : 'multiplayer:go';
  if (input.timeLimitMs === CANONICAL_RANKED_TIME_LIMIT_MS) {
    return input.mode === 'og' ? 'multiplayer:og:timed:v1' : 'multiplayer:go:timed:v1';
  }
  return undefined;
}

export interface RatingEligibilityInput {
  readonly authenticated: boolean;
  readonly durable: boolean;
  readonly ranked: boolean;
  readonly serverAuthorized: boolean;
  readonly terminal: boolean;
  readonly participant: boolean;
  readonly fixture: boolean;
  readonly scope: CombatScope;
  readonly mode: CombatMode;
  readonly timeLimitMs?: number;
}

export function ratingEligibility(
  input: RatingEligibilityInput,
):
  | { readonly eligible: true; readonly bucket: RatingBucket }
  | { readonly eligible: false; readonly reason: string } {
  if (!input.authenticated) return { eligible: false, reason: 'Authentication is required.' };
  if (!input.durable || !input.serverAuthorized)
    return { eligible: false, reason: 'Server-authorized durable evidence is required.' };
  if (!input.ranked) return { eligible: false, reason: 'Unranked games do not affect rating.' };
  if (!input.terminal) return { eligible: false, reason: 'Only terminal games can be settled.' };
  if (!input.participant || input.fixture)
    return { eligible: false, reason: 'Spectators and fixtures are ineligible.' };
  const bucket = ratingBucketFor(input);
  return bucket
    ? { eligible: true, bucket }
    : { eligible: false, reason: 'Unsupported ranked clock or mode.' };
}

export interface RatingSettlementState {
  readonly appliedIds: readonly string[];
  readonly ratings: Readonly<
    Record<string, { readonly rating: number; readonly gamesPlayed: number }>
  >;
}

export function settleRatingPair(input: {
  readonly state: RatingSettlementState;
  readonly idempotencyId: string;
  readonly playerIds: readonly [string, string];
  readonly result: Readonly<Record<string, PlayerResult>>;
}): {
  readonly applied: boolean;
  readonly state: RatingSettlementState;
  readonly updates: Readonly<Record<string, EloUpdate>>;
} {
  if (input.state.appliedIds.includes(input.idempotencyId)) {
    return { applied: false, state: input.state, updates: {} };
  }
  const [left, right] = input.playerIds;
  const leftProfile = input.state.ratings[left] ?? { rating: INITIAL_RATING, gamesPlayed: 0 };
  const rightProfile = input.state.ratings[right] ?? { rating: INITIAL_RATING, gamesPlayed: 0 };
  const leftUpdate = calculateEloUpdate({
    rating: leftProfile.rating,
    opponentRating: rightProfile.rating,
    gamesPlayed: leftProfile.gamesPlayed,
    result: input.result[left] ?? 'draw',
  });
  const rightUpdate = calculateEloUpdate({
    rating: rightProfile.rating,
    opponentRating: leftProfile.rating,
    gamesPlayed: rightProfile.gamesPlayed,
    result: input.result[right] ?? 'draw',
  });
  return {
    applied: true,
    state: {
      appliedIds: [...input.state.appliedIds, input.idempotencyId],
      ratings: {
        ...input.state.ratings,
        [left]: { rating: leftUpdate.newRating, gamesPlayed: leftUpdate.newGamesPlayed },
        [right]: { rating: rightUpdate.newRating, gamesPlayed: rightUpdate.newGamesPlayed },
      },
    },
    updates: { [left]: leftUpdate, [right]: rightUpdate },
  };
}

export interface RankedQueueSettings {
  readonly scope: CombatScope;
  readonly mode: CombatMode;
  readonly wordLength: WordLength;
  readonly hardMode: boolean;
  readonly timeLimitMs?: number;
}

export interface RankedQueueRequest {
  readonly id: string;
  readonly userId: string;
  readonly queuedAt: string;
  readonly settings: RankedQueueSettings;
  readonly status: 'searching' | 'matched' | 'cancelled' | 'expired';
  readonly matchedGameId?: string;
}

export function rankedQueueCompatible(
  left: RankedQueueRequest,
  right: RankedQueueRequest,
): boolean {
  const leftBucket = ratingBucketFor(left.settings);
  const rightBucket = ratingBucketFor(right.settings);
  return (
    left.userId !== right.userId &&
    left.status === 'searching' &&
    right.status === 'searching' &&
    left.settings.scope === right.settings.scope &&
    left.settings.mode === right.settings.mode &&
    left.settings.wordLength === right.settings.wordLength &&
    left.settings.hardMode === right.settings.hardMode &&
    left.settings.timeLimitMs === right.settings.timeLimitMs &&
    leftBucket !== undefined &&
    leftBucket === rightBucket
  );
}

export function oldestCompatibleQueueRequest(
  request: RankedQueueRequest,
  candidates: readonly RankedQueueRequest[],
): RankedQueueRequest | undefined {
  if (request.status === 'matched') return request;
  return candidates
    .filter((candidate) => rankedQueueCompatible(request, candidate))
    .sort(
      (left, right) =>
        left.queuedAt.localeCompare(right.queuedAt) || left.id.localeCompare(right.id),
    )[0];
}

export interface SharedCombatMove {
  readonly sequence: number;
  readonly actorId: string;
  readonly guess: string;
  readonly tiles: readonly ScoredTile[];
  readonly submittedAt: string;
}

export function projectSharedMove(input: {
  readonly sequence: number;
  readonly actorId: string;
  readonly guess: string;
  readonly answer: string;
  readonly submittedAt: string;
}): SharedCombatMove {
  if (!input.actorId.trim()) throw new RangeError('A shared move requires an actor.');
  return { ...input, tiles: scoreGuess(input.guess, input.answer) };
}
