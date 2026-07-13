import { DEFAULT_DIFFICULTY_TIER, normalizeDifficultyTier, type DifficultyTier } from '../data/difficulty'
import { dateKeyToLocalDate, getNextUtcMidnight, getUtcDailyDateKey } from '../daily'
import { DEFAULT_GO_PUZZLE_COUNT, normalizeGoPuzzleCount, type GoPuzzleCount } from '../game/constants'
import {
  createGoSession,
  createOgSession,
  createPracticeGoSetup,
  createPracticeOgSetup,
  restoreGoSession,
  restoreOgSession,
  serializeGoSession,
  serializeOgSession,
  submitGoGuess,
  submitGuess,
  validateHardModeGuess,
  type GoSessionState,
  type GoAnswerGenerationVersion,
  type PuzzleSessionState,
  type SerializedGoSession,
  type SerializedOgSession,
} from '../game'
import type { GameMode, GuessResult, PlayScope, TileResult } from '../game/types'
import {
  createDailyMultiplayerGoSetup,
  createDailyMultiplayerOgSetup,
  normalizeMultiplayerProfileMap,
  normalizeMultiplayerProfileSummary,
  type MultiplayerProfileSummary,
} from './dailyMultiplayer'
import type { RatingBucketId } from './rating'

export const MAX_MULTIPLAYER_GAMES = 5

export const PRACTICE_MULTIPLAYER_TIME_LIMIT_OPTIONS = [
  { label: 'No time limit', value: null },
  { label: '30 seconds', value: 30_000 },
  { label: '1 minute', value: 60_000 },
  { label: '2 minutes', value: 120_000 },
  { label: '5 minutes', value: 300_000 },
  { label: '10 minutes', value: 600_000 },
  { label: '30 minutes', value: 1_800_000 },
  { label: '1 hour', value: 3_600_000 },
] as const

export type PracticeMultiplayerTimeLimitMs = Exclude<(typeof PRACTICE_MULTIPLAYER_TIME_LIMIT_OPTIONS)[number]['value'], null>

export type MultiplayerGameStatus = 'waiting' | 'playing' | 'won' | 'lost' | 'expired' | 'cancelled'
export type MultiplayerPlayerId = 'player-one' | 'player-two'

export interface MultiplayerPlayer {
  readonly id: MultiplayerPlayerId
  readonly label: string
}

export interface MultiplayerMove {
  readonly createdAt: string
  readonly guess: string
  readonly id: string
  readonly playerId: MultiplayerPlayerId
  readonly puzzleIndex: number
  readonly tiles: readonly TileResult[]
}

export type MultiplayerSerializedSession =
  | { readonly mode: 'og'; readonly session: SerializedOgSession }
  | { readonly mode: 'go'; readonly session: SerializedGoSession }

export interface MultiplayerGame {
  readonly answerGenerationVersion?: GoAnswerGenerationVersion
  readonly authorityVersion?: number
  readonly createdAt: string
  readonly currentTurn: MultiplayerPlayerId
  readonly customGameCode?: string
  readonly dailyDateKey?: string
  readonly deadlineAt?: string
  readonly difficulty: DifficultyTier
  readonly endedAt?: string
  readonly forfeitedPlayerId?: MultiplayerPlayerId
  readonly goPuzzleCount?: GoPuzzleCount
  readonly hardMode?: boolean
  readonly id: string
  readonly matchmakingRequestId?: string
  readonly mode: GameMode
  readonly moves: readonly MultiplayerMove[]
  readonly playerUserIds?: Partial<Record<MultiplayerPlayerId, string>>
  readonly players: readonly MultiplayerPlayer[]
  readonly playerSessions?: Partial<Record<MultiplayerPlayerId, MultiplayerSerializedSession>>
  readonly playerProfiles?: Partial<Record<MultiplayerPlayerId, MultiplayerProfileSummary>>
  readonly ranked?: boolean
  readonly ratingBucket?: RatingBucketId
  readonly scope: PlayScope
  readonly seed: number
  readonly serializedSession: MultiplayerSerializedSession
  readonly status: MultiplayerGameStatus
  readonly timeLimitMs?: PracticeMultiplayerTimeLimitMs | null
  readonly timeRemainingMs?: Partial<Record<MultiplayerPlayerId, number>>
  readonly timedOutPlayerId?: MultiplayerPlayerId
  readonly turnStartedAt?: string
  readonly updatedAt: string
  readonly winnerId?: MultiplayerPlayerId
  readonly wordLength: number
}

export interface MultiplayerState {
  readonly games: readonly MultiplayerGame[]
}

export interface CreateMultiplayerGameInput {
  readonly answerGenerationVersion?: GoAnswerGenerationVersion
  readonly createdAt?: string
  readonly customGameCode?: string
  readonly dailyDateKey?: string
  readonly difficulty?: DifficultyTier
  readonly goPuzzleCount?: GoPuzzleCount
  readonly id?: string
  readonly matchmakingRequestId?: string
  readonly mode: GameMode
  readonly playerUserIds?: Partial<Record<MultiplayerPlayerId, string>>
  readonly playerProfiles?: Partial<Record<MultiplayerPlayerId, MultiplayerProfileSummary>>
  readonly hardMode?: boolean
  readonly ranked?: boolean
  readonly ratingBucket?: RatingBucketId
  readonly scope: PlayScope
  readonly seed?: number
  readonly timeLimitMs?: PracticeMultiplayerTimeLimitMs | null
  readonly wordLength?: number
}

export interface JoinMultiplayerGameInput {
  readonly gameId: string
  readonly now?: string
  readonly playerProfile?: MultiplayerProfileSummary
  readonly userId: string
}

export interface SubmitMultiplayerGuessInput {
  readonly gameId: string
  readonly guess: string
  readonly now?: string
  readonly playerId?: MultiplayerPlayerId
}

export interface ForfeitMultiplayerGameInput {
  readonly gameId: string
  readonly now?: string
  readonly playerId: MultiplayerPlayerId
}

export interface CancelMultiplayerGameInput {
  readonly gameId: string
  readonly now?: string
  readonly userId: string
}

export interface SubmitMultiplayerGuessResult {
  readonly error?: string
  readonly game?: MultiplayerGame
  readonly state: MultiplayerState
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function createEmptyMultiplayerState(): MultiplayerState {
  return { games: [] }
}

function nextPlayerId(playerId: MultiplayerPlayerId): MultiplayerPlayerId {
  return playerId === 'player-one' ? 'player-two' : 'player-one'
}

function getSessionStatus(serializedSession: MultiplayerSerializedSession): MultiplayerGameStatus {
  if (serializedSession.mode === 'og') {
    const setup = createPracticeOgSetup(serializedSession.session.answer.length, 0)
    return restoreOgSession(serializedSession.session, setup.validGuesses).status
  }
  const firstPuzzle = serializedSession.session.puzzles[0]
  const setup = createPracticeGoSetup(firstPuzzle?.answer.length ?? 5, 0, undefined, normalizeGoPuzzleCount(serializedSession.session.puzzles.length))
  return restoreGoSession(serializedSession.session, setup.validGuesses).status
}

function getSessionHardMode(serializedSession: MultiplayerSerializedSession): boolean {
  return serializedSession.session.hardMode
}

function cloneSerializedSession(serializedSession: MultiplayerSerializedSession): MultiplayerSerializedSession {
  if (serializedSession.mode === 'og') {
    return {
      mode: 'og',
      session: {
        ...serializedSession.session,
        guesses: [...serializedSession.session.guesses],
      },
    }
  }

  return {
    mode: 'go',
    session: {
      ...serializedSession.session,
      priorAnswers: [...serializedSession.session.priorAnswers],
      puzzles: serializedSession.session.puzzles.map((puzzle) => ({
        ...puzzle,
        guesses: [...puzzle.guesses],
        prefilledGuesses: [...puzzle.prefilledGuesses],
      })),
    },
  }
}

function withSessionHardMode(serializedSession: MultiplayerSerializedSession, hardMode: boolean): MultiplayerSerializedSession {
  if (serializedSession.mode === 'og') {
    return {
      mode: 'og',
      session: {
        ...serializedSession.session,
        hardMode,
        guesses: [...serializedSession.session.guesses],
      },
    }
  }

  return {
    mode: 'go',
    session: {
      ...serializedSession.session,
      hardMode,
      priorAnswers: [...serializedSession.session.priorAnswers],
      puzzles: serializedSession.session.puzzles.map((puzzle) => ({
        ...puzzle,
        guesses: [...puzzle.guesses],
        hardMode,
        prefilledGuesses: [...puzzle.prefilledGuesses],
      })),
    },
  }
}

function normalizePlayer(value: unknown, fallback: MultiplayerPlayer): MultiplayerPlayer {
  if (typeof value !== 'object' || value === null) {
    return fallback
  }
  const record = value as Record<string, unknown>
  return {
    id: record.id === 'player-two' ? 'player-two' : fallback.id,
    label: typeof record.label === 'string' && record.label.trim() ? record.label : fallback.label,
  }
}

function normalizeTiles(value: unknown): readonly TileResult[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((tile): TileResult[] => {
    if (typeof tile !== 'object' || tile === null) {
      return []
    }
    const record = tile as Record<string, unknown>
    if (typeof record.letter !== 'string' || (record.state !== 'absent' && record.state !== 'present' && record.state !== 'correct')) {
      return []
    }
    return [{ letter: record.letter, state: record.state }]
  })
}

function normalizeMove(value: unknown): MultiplayerMove | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const record = value as Record<string, unknown>
  if (typeof record.guess !== 'string') {
    return undefined
  }
  return {
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date(0).toISOString(),
    guess: record.guess,
    id: typeof record.id === 'string' ? record.id : createId('move'),
    playerId: record.playerId === 'player-two' ? 'player-two' : 'player-one',
    puzzleIndex: typeof record.puzzleIndex === 'number' ? Math.max(0, Math.trunc(record.puzzleIndex)) : 0,
    tiles: normalizeTiles(record.tiles),
  }
}

function normalizePlayerUserIds(value: unknown): Partial<Record<MultiplayerPlayerId, string>> | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const record = value as Record<string, unknown>
  const playerOne = typeof record['player-one'] === 'string' && record['player-one'].trim() ? record['player-one'] : undefined
  const playerTwo = typeof record['player-two'] === 'string' && record['player-two'].trim() ? record['player-two'] : undefined
  return playerOne || playerTwo ? { 'player-one': playerOne, 'player-two': playerTwo } : undefined
}

function normalizePlayerSessions(
  value: unknown,
  fallback: MultiplayerSerializedSession,
  hardMode: boolean,
): Partial<Record<MultiplayerPlayerId, MultiplayerSerializedSession>> {
  const normalizedFallback = withSessionHardMode(fallback, hardMode)
  if (typeof value !== 'object' || value === null) {
    return {
      'player-one': cloneSerializedSession(normalizedFallback),
      'player-two': cloneSerializedSession(normalizedFallback),
    }
  }
  const record = value as Record<string, unknown>
  const playerOne = normalizeSerializedSession(record['player-one'])
  const playerTwo = normalizeSerializedSession(record['player-two'])
  return {
    'player-one': playerOne && playerOne.mode === fallback.mode ? withSessionHardMode(playerOne, hardMode) : cloneSerializedSession(normalizedFallback),
    'player-two': playerTwo && playerTwo.mode === fallback.mode ? withSessionHardMode(playerTwo, hardMode) : cloneSerializedSession(normalizedFallback),
  }
}

function normalizePracticeTimeLimitMs(value: unknown): PracticeMultiplayerTimeLimitMs | null {
  const match = PRACTICE_MULTIPLAYER_TIME_LIMIT_OPTIONS.find((option) => option.value === value)
  return match?.value ?? null
}

function normalizeTimeRemaining(
  value: unknown,
  timeLimitMs: PracticeMultiplayerTimeLimitMs | null,
): Partial<Record<MultiplayerPlayerId, number>> | undefined {
  if (!timeLimitMs) {
    return undefined
  }
  if (typeof value !== 'object' || value === null) {
    return { 'player-one': timeLimitMs, 'player-two': timeLimitMs }
  }
  const record = value as Record<string, unknown>
  const clamp = (candidate: unknown) => typeof candidate === 'number' && Number.isFinite(candidate)
    ? Math.max(0, Math.min(timeLimitMs, Math.trunc(candidate)))
    : timeLimitMs
  return {
    'player-one': clamp(record['player-one']),
    'player-two': clamp(record['player-two']),
  }
}

function getElapsedMs(startedAt: string | undefined, nowIso: string): number {
  if (!startedAt) {
    return 0
  }
  const elapsed = Date.parse(nowIso) - Date.parse(startedAt)
  return Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0
}

function profileLabel(profile: MultiplayerProfileSummary | undefined, fallback: string): string {
  return profile?.label ?? fallback
}

function isSerializedOg(value: unknown): value is SerializedOgSession {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  return typeof record.answer === 'string'
    && typeof record.continuationCount === 'number'
    && typeof record.currentGuess === 'string'
    && Array.isArray(record.guesses)
    && record.guesses.every((guess) => typeof guess === 'string')
    && typeof record.hardMode === 'boolean'
    && typeof record.maxAttempts === 'number'
}

function isSerializedGo(value: unknown): value is SerializedGoSession {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  return typeof record.currentPuzzleIndex === 'number'
    && typeof record.hardMode === 'boolean'
    && Array.isArray(record.priorAnswers)
    && record.priorAnswers.every((answer) => typeof answer === 'string')
    && Array.isArray(record.puzzles)
    && record.puzzles.length > 0
}

function normalizeSerializedSession(value: unknown): MultiplayerSerializedSession | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const record = value as Record<string, unknown>
  if (record.mode === 'og' && isSerializedOg(record.session)) {
    return { mode: 'og', session: record.session }
  }
  if (record.mode === 'go' && isSerializedGo(record.session)) {
    return { mode: 'go', session: record.session }
  }
  return undefined
}

function normalizeGame(value: unknown): MultiplayerGame | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const record = value as Record<string, unknown>
  if ((record.mode !== 'og' && record.mode !== 'go') || (record.scope !== 'daily' && record.scope !== 'practice')) {
    return undefined
  }
  const serializedSession = normalizeSerializedSession(record.serializedSession)
  if (!serializedSession || serializedSession.mode !== record.mode) {
    return undefined
  }
  const players = Array.isArray(record.players) ? record.players : []
  const normalizedPlayers: readonly MultiplayerPlayer[] = [
    normalizePlayer(players[0], { id: 'player-one', label: 'You' }),
    normalizePlayer(players[1], { id: 'player-two', label: 'Rival' }),
  ]
  const status = record.status === 'waiting'
    || record.status === 'playing'
    || record.status === 'won'
    || record.status === 'lost'
    || record.status === 'expired'
    || record.status === 'cancelled'
    ? record.status
    : getSessionStatus(serializedSession)
  const wordLength = serializedSession.mode === 'og'
    ? serializedSession.session.answer.length
    : serializedSession.session.puzzles[0]?.answer.length ?? 5
  const playerProfiles = normalizeMultiplayerProfileMap<MultiplayerPlayerId>(record.playerProfiles, ['player-one', 'player-two'])
  const allowsHardMode = record.scope === 'practice' || (record.scope === 'daily' && record.ranked === true)
  const hardMode = allowsHardMode && (record.hardMode === true || getSessionHardMode(serializedSession))
  const playerSessions = normalizePlayerSessions(record.playerSessions, serializedSession, hardMode)
  const timeLimitMs = record.scope === 'practice' ? normalizePracticeTimeLimitMs(record.timeLimitMs) : null
  const timeRemainingMs = normalizeTimeRemaining(record.timeRemainingMs, timeLimitMs)
  return {
    answerGenerationVersion: record.mode === 'go'
      ? record.answerGenerationVersion === 'v2' ? 'v2' : 'v1'
      : undefined,
    authorityVersion: typeof record.authorityVersion === 'number'
      && Number.isInteger(record.authorityVersion)
      && record.authorityVersion >= 0
      ? record.authorityVersion
      : undefined,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date(0).toISOString(),
    currentTurn: record.currentTurn === 'player-two' ? 'player-two' : 'player-one',
    customGameCode: typeof record.customGameCode === 'string' ? record.customGameCode : undefined,
    dailyDateKey: typeof record.dailyDateKey === 'string' ? record.dailyDateKey : undefined,
    deadlineAt: typeof record.deadlineAt === 'string' ? record.deadlineAt : undefined,
    difficulty: normalizeDifficultyTier(record.difficulty),
    endedAt: typeof record.endedAt === 'string' ? record.endedAt : undefined,
    forfeitedPlayerId: record.forfeitedPlayerId === 'player-one' || record.forfeitedPlayerId === 'player-two' ? record.forfeitedPlayerId : undefined,
    goPuzzleCount: typeof record.goPuzzleCount === 'number' ? normalizeGoPuzzleCount(record.goPuzzleCount) : undefined,
    hardMode,
    id: typeof record.id === 'string' ? record.id : createId('multiplayer'),
    matchmakingRequestId: typeof record.matchmakingRequestId === 'string' ? record.matchmakingRequestId : undefined,
    mode: record.mode,
    moves: Array.isArray(record.moves) ? record.moves.flatMap((move) => normalizeMove(move) ?? []) : [],
    playerProfiles,
    playerSessions,
    playerUserIds: normalizePlayerUserIds(record.playerUserIds),
    players: normalizedPlayers.map((player) => ({ ...player, label: profileLabel(playerProfiles?.[player.id], player.label) })),
    ranked: record.ranked === true,
    ratingBucket: typeof record.ratingBucket === 'string' ? record.ratingBucket as RatingBucketId : undefined,
    scope: record.scope,
    seed: typeof record.seed === 'number' ? record.seed : 0,
    serializedSession,
    status,
    timeLimitMs,
    timeRemainingMs,
    timedOutPlayerId: record.timedOutPlayerId === 'player-one' || record.timedOutPlayerId === 'player-two' ? record.timedOutPlayerId : undefined,
    turnStartedAt: typeof record.turnStartedAt === 'string' ? record.turnStartedAt : undefined,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date(0).toISOString(),
    winnerId: record.winnerId === 'player-one' || record.winnerId === 'player-two' ? record.winnerId : undefined,
    wordLength: typeof record.wordLength === 'number' ? Math.trunc(record.wordLength) : wordLength,
  }
}

export function normalizeMultiplayerState(value: unknown): MultiplayerState {
  if (typeof value !== 'object' || value === null) {
    return createEmptyMultiplayerState()
  }
  const record = value as Record<string, unknown>
  const games = Array.isArray(record.games) ? record.games.flatMap((game) => normalizeGame(game) ?? []) : []
  return { games }
}

function isActiveMultiplayerGame(game: MultiplayerGame): boolean {
  return game.status === 'waiting' || game.status === 'playing'
}

function multiplayerGameBelongsToViewer(game: MultiplayerGame, userId: string | undefined): boolean {
  if (!userId) {
    return true
  }
  const playerOne = game.playerUserIds?.['player-one']
  const playerTwo = game.playerUserIds?.['player-two']
  if (!playerOne && !playerTwo) {
    return true
  }
  return playerOne === userId || playerTwo === userId
}

export function getActiveMultiplayerGames(state: MultiplayerState, userId?: string): readonly MultiplayerGame[] {
  return normalizeMultiplayerState(state).games.filter((game) => isActiveMultiplayerGame(game) && multiplayerGameBelongsToViewer(game, userId))
}

export function canCreateMultiplayerGame(state: MultiplayerState, userId?: string): boolean {
  return getActiveMultiplayerGames(state, userId).length < MAX_MULTIPLAYER_GAMES
}

function createInitialSession(input: Required<Pick<CreateMultiplayerGameInput, 'difficulty' | 'goPuzzleCount' | 'mode' | 'scope' | 'seed' | 'wordLength'>> & { readonly answerGenerationVersion?: GoAnswerGenerationVersion; readonly dailyDateKey?: string; readonly hardMode: boolean; readonly ranked: boolean }): MultiplayerSerializedSession {
  if (input.mode === 'og') {
    const setup = input.scope === 'daily'
      ? createDailyMultiplayerOgSetup(dateKeyToLocalDate(input.dailyDateKey ?? getUtcDailyDateKey()), input.difficulty, input.ranked)
      : createPracticeOgSetup(input.wordLength, input.seed, input.difficulty)
    return { mode: 'og', session: serializeOgSession(createOgSession(setup, input.hardMode)) }
  }

  const setup = input.scope === 'daily'
    ? createDailyMultiplayerGoSetup(
        dateKeyToLocalDate(input.dailyDateKey ?? getUtcDailyDateKey()),
        input.difficulty,
        input.goPuzzleCount,
        input.ranked,
        input.answerGenerationVersion,
      )
    : createPracticeGoSetup(input.wordLength, input.seed, input.difficulty, input.goPuzzleCount)
  return { mode: 'go', session: serializeGoSession(createGoSession(setup, input.hardMode)) }
}

export function createMultiplayerGame(input: CreateMultiplayerGameInput): MultiplayerGame {
  const createdAt = input.createdAt ?? new Date().toISOString()
  const dailyDateKey = input.scope === 'daily' ? input.dailyDateKey ?? getUtcDailyDateKey(new Date(createdAt)) : undefined
  const isOnlineWaitingGame = Boolean(input.playerUserIds?.['player-one'] && !input.playerUserIds?.['player-two'])
  const playerProfiles = input.playerProfiles
  const timeLimitMs = input.scope === 'practice' ? normalizePracticeTimeLimitMs(input.timeLimitMs) : null
  const ranked = input.ranked === true
  const hardMode = (input.scope === 'practice' || (input.scope === 'daily' && ranked)) && input.hardMode === true
  const normalizedInput = {
    answerGenerationVersion: input.answerGenerationVersion,
    difficulty: input.difficulty ?? DEFAULT_DIFFICULTY_TIER,
    goPuzzleCount: input.scope === 'daily' && ranked ? DEFAULT_GO_PUZZLE_COUNT : input.goPuzzleCount ?? DEFAULT_GO_PUZZLE_COUNT,
    hardMode,
    mode: input.mode,
    ranked,
    scope: input.scope,
    seed: input.seed ?? Date.parse(createdAt),
    wordLength: input.scope === 'daily' ? 5 : input.wordLength ?? 5,
    dailyDateKey,
  }
  const serializedSession = createInitialSession(normalizedInput)
  return {
    answerGenerationVersion: serializedSession.mode === 'go'
      ? serializedSession.session.answerGenerationVersion ?? 'v1'
      : undefined,
    authorityVersion: input.scope === 'daily' && ranked ? 0 : undefined,
    createdAt,
    currentTurn: 'player-one',
    customGameCode: input.customGameCode,
    dailyDateKey,
    deadlineAt: input.scope === 'daily' ? getNextUtcMidnight(new Date(createdAt)).toISOString() : undefined,
    difficulty: normalizedInput.difficulty,
    goPuzzleCount: input.mode === 'go' ? normalizedInput.goPuzzleCount : undefined,
    hardMode,
    id: input.id ?? createId(`multiplayer-${input.scope}-${input.mode}`),
    matchmakingRequestId: input.matchmakingRequestId,
    mode: input.mode,
    moves: [],
    playerSessions: {
      'player-one': cloneSerializedSession(serializedSession),
      'player-two': cloneSerializedSession(serializedSession),
    },
    playerProfiles,
    playerUserIds: input.playerUserIds,
    players: [
      { id: 'player-one', label: profileLabel(playerProfiles?.['player-one'], isOnlineWaitingGame ? 'Host' : 'You') },
      { id: 'player-two', label: profileLabel(playerProfiles?.['player-two'], 'Rival') },
    ],
    ranked,
    ratingBucket: input.ratingBucket,
    scope: input.scope,
    seed: normalizedInput.seed,
    serializedSession,
    status: isOnlineWaitingGame ? 'waiting' : 'playing',
    timeLimitMs,
    timeRemainingMs: timeLimitMs ? { 'player-one': timeLimitMs, 'player-two': timeLimitMs } : undefined,
    turnStartedAt: timeLimitMs && !isOnlineWaitingGame ? createdAt : undefined,
    updatedAt: createdAt,
    wordLength: normalizedInput.wordLength,
  }
}

export function getMultiplayerSessionForPlayer(
  game: MultiplayerGame,
  playerId: MultiplayerPlayerId,
): MultiplayerSerializedSession {
  const session = game.playerSessions?.[playerId]
  return session && session.mode === game.mode ? session : game.serializedSession
}

export function getViewerMultiplayerPlayerId(game: MultiplayerGame, userId: string | undefined): MultiplayerPlayerId | undefined {
  if (!userId) {
    return undefined
  }
  if (game.playerUserIds?.['player-one'] === userId) {
    return 'player-one'
  }
  if (game.playerUserIds?.['player-two'] === userId) {
    return 'player-two'
  }
  return undefined
}

export function canViewerJoinMultiplayerGame(game: MultiplayerGame, userId: string | undefined): boolean {
  return Boolean(
    userId
      && game.status === 'waiting'
      && game.playerUserIds?.['player-one']
      && game.playerUserIds['player-one'] !== userId
      && !game.playerUserIds?.['player-two'],
  )
}

export function canViewerCancelMultiplayerGame(game: MultiplayerGame, userId: string | undefined): boolean {
  return Boolean(
    userId
      && game.status === 'waiting'
      && game.playerUserIds?.['player-one'] === userId
      && !game.playerUserIds?.['player-two'],
  )
}

export function hasDailyMultiplayerParticipation(
  state: MultiplayerState,
  dateKey: string | undefined,
  mode: GameMode,
  userId: string | undefined,
  ranked = false,
): boolean {
  if (!dateKey || !userId) {
    return false
  }
  return normalizeMultiplayerState(state).games.some((game) => (
    game.scope === 'daily'
    && game.dailyDateKey === dateKey
    && game.mode === mode
    && (game.ranked === true) === ranked
    && !(game.status === 'cancelled' && game.playerUserIds?.['player-one'] === userId && !game.playerUserIds?.['player-two'])
    && (game.playerUserIds?.['player-one'] === userId || game.playerUserIds?.['player-two'] === userId)
  ))
}

export function joinMultiplayerGame(
  state: MultiplayerState,
  input: JoinMultiplayerGameInput,
): SubmitMultiplayerGuessResult {
  const normalized = normalizeMultiplayerState(state)
  const game = normalized.games.find((entry) => entry.id === input.gameId)
  if (!game) {
    return { error: 'Multiplayer game not found.', state: normalized }
  }
  if (!canViewerJoinMultiplayerGame(game, input.userId)) {
    return { error: 'This multiplayer match is not available to join.', game, state: normalized }
  }
  if (!canCreateMultiplayerGame(
    { games: normalized.games.filter((entry) => entry.id !== game.id) },
    input.userId,
  )) {
    return { error: 'You already have five active multiplayer games.', game, state: normalized }
  }
  if (game.scope === 'daily' && hasDailyMultiplayerParticipation(
    { games: normalized.games.filter((entry) => entry.id !== game.id) },
    game.dailyDateKey,
    game.mode,
    input.userId,
    game.ranked === true,
  )) {
    return { error: 'You already claimed today\'s Daily Multiplayer game for this mode.', game, state: normalized }
  }

  const now = input.now ?? new Date().toISOString()
  const playerProfile = normalizeMultiplayerProfileSummary(input.playerProfile)
  const playerProfiles = playerProfile
    ? { ...game.playerProfiles, 'player-two': playerProfile }
    : game.playerProfiles
  const updated: MultiplayerGame = {
    ...game,
    playerProfiles,
    playerUserIds: {
      ...game.playerUserIds,
      'player-two': input.userId,
    },
    players: game.players.map((player) => player.id === 'player-two' ? { ...player, label: profileLabel(playerProfile, 'Rival') } : player),
    status: 'playing',
    turnStartedAt: game.timeLimitMs ? now : game.turnStartedAt,
    updatedAt: now,
  }
  return {
    game: updated,
    state: {
      games: normalized.games.map((entry) => entry.id === updated.id ? updated : entry),
    },
  }
}

export function addMultiplayerGame(state: MultiplayerState, game: MultiplayerGame): MultiplayerState {
  const normalized = normalizeMultiplayerState(state)
  const ownerUserId = game.playerUserIds?.['player-one']
  if (!canCreateMultiplayerGame(normalized, ownerUserId)) {
    return normalized
  }
  if (
    game.scope === 'daily'
    && ownerUserId
    && hasDailyMultiplayerParticipation(normalized, game.dailyDateKey, game.mode, ownerUserId, game.ranked === true)
  ) {
    return normalized
  }
  return {
    games: [game, ...normalized.games],
  }
}

export function cancelMultiplayerGame(state: MultiplayerState, input: CancelMultiplayerGameInput): SubmitMultiplayerGuessResult {
  const normalized = normalizeMultiplayerState(state)
  const game = normalized.games.find((entry) => entry.id === input.gameId)
  if (!game) {
    return { error: 'Multiplayer game not found.', state: normalized }
  }
  if (!canViewerCancelMultiplayerGame(game, input.userId)) {
    return { error: 'Only the creator can cancel an unjoined multiplayer lobby.', game, state: normalized }
  }

  const now = input.now ?? new Date().toISOString()
  const updated: MultiplayerGame = {
    ...game,
    endedAt: now,
    status: 'cancelled',
    updatedAt: now,
  }
  return {
    game: updated,
    state: {
      games: normalized.games.map((entry) => entry.id === updated.id ? updated : entry),
    },
  }
}

function getValidGuesses(game: MultiplayerGame): ReadonlySet<string> {
  if (game.mode === 'og') {
    return game.scope === 'daily'
      ? createDailyMultiplayerOgSetup(dateKeyToLocalDate(game.dailyDateKey ?? getUtcDailyDateKey()), game.difficulty, game.ranked === true).validGuesses
      : createPracticeOgSetup(game.wordLength, game.seed, game.difficulty).validGuesses
  }
  return game.scope === 'daily'
    ? createDailyMultiplayerGoSetup(dateKeyToLocalDate(game.dailyDateKey ?? getUtcDailyDateKey()), game.difficulty, game.goPuzzleCount ?? DEFAULT_GO_PUZZLE_COUNT, game.ranked === true).validGuesses
    : createPracticeGoSetup(game.wordLength, game.seed, game.difficulty, game.goPuzzleCount ?? DEFAULT_GO_PUZZLE_COUNT).validGuesses
}

function applyGuessToSession(game: MultiplayerGame, serializedSession: MultiplayerSerializedSession, guess: string): { readonly result?: GuessResult; readonly serializedSession?: MultiplayerSerializedSession; readonly status?: MultiplayerGameStatus; readonly error?: string } {
  if (serializedSession.mode === 'og') {
    const session = restoreOgSession(serializedSession.session, getValidGuesses(game))
    const filled: PuzzleSessionState = { ...session, currentGuess: guess.toLocaleLowerCase('en-US') }
    const next = submitGuess(filled)
    if (next.lastValidation) {
      return { error: next.lastValidation.message }
    }
    const result = next.guesses[next.guesses.length - 1]
    return {
      result,
      serializedSession: { mode: 'og', session: serializeOgSession(next) },
      status: next.status,
    }
  }

  const session = restoreGoSession(extendFinalGoPuzzleAttempts(serializedSession).session, getValidGuesses(game))
  const currentPuzzle = session.puzzles[session.currentPuzzleIndex]
  const puzzles = [...session.puzzles]
  puzzles[session.currentPuzzleIndex] = {
    ...currentPuzzle,
    currentGuess: guess.toLocaleLowerCase('en-US'),
  }
  const filled: GoSessionState = { ...session, puzzles }
  const next = submitGoGuess(filled)
  const submittedPuzzle = next.puzzles[session.currentPuzzleIndex]
  if (submittedPuzzle.lastValidation) {
    return { error: submittedPuzzle.lastValidation.message }
  }
  const result = submittedPuzzle.guesses[submittedPuzzle.guesses.length - 1]
  return {
    result,
    serializedSession: { mode: 'go', session: serializeGoSession(next) },
    status: next.status,
  }
}

function extendFinalGoPuzzleAttempts(serializedSession: MultiplayerSerializedSession): Extract<MultiplayerSerializedSession, { readonly mode: 'go' }> {
  if (serializedSession.mode !== 'go') {
    throw new Error('Expected GO multiplayer session.')
  }

  const session = serializedSession.session
  const currentPuzzleIndex = session.currentPuzzleIndex
  if (currentPuzzleIndex !== session.puzzles.length - 1) {
    return serializedSession
  }

  const currentPuzzle = session.puzzles[currentPuzzleIndex]
  if (!currentPuzzle || currentPuzzle.guesses.includes(currentPuzzle.answer)) {
    return serializedSession
  }

  const minimumMaxAttempts = currentPuzzle.guesses.length + 2
  if (currentPuzzle.maxAttempts >= minimumMaxAttempts) {
    return serializedSession
  }

  return {
    mode: 'go',
    session: {
      ...session,
      puzzles: session.puzzles.map((puzzle, index) => index === currentPuzzleIndex ? {
        ...puzzle,
        maxAttempts: minimumMaxAttempts,
      } : puzzle),
    },
  }
}

function getNextTurnAfterSubmission(
  game: MultiplayerGame,
  playerId: MultiplayerPlayerId,
  submittedStatus: MultiplayerGameStatus,
): MultiplayerPlayerId {
  const opponentId = nextPlayerId(playerId)
  const opponentStatus = getSessionStatus(getMultiplayerSessionForPlayer(game, opponentId))
  if (submittedStatus === 'playing' && opponentStatus !== 'playing') {
    return playerId
  }
  return opponentStatus === 'playing' ? opponentId : playerId
}

function getMovePuzzleIndex(serializedSession: MultiplayerSerializedSession): number {
  return serializedSession.mode === 'go' ? serializedSession.session.currentPuzzleIndex : 0
}

function getSharedPuzzleGuesses(game: MultiplayerGame, puzzleIndex: number): readonly GuessResult[] {
  return game.moves
    .filter((move) => move.puzzleIndex === puzzleIndex)
    .map((move): GuessResult => ({ guess: move.guess, tiles: move.tiles }))
}

function validateSharedHardModeGuess(
  game: MultiplayerGame,
  serializedSession: MultiplayerSerializedSession,
  guess: string,
): string | undefined {
  const supportsHardMode = game.scope === 'practice' || (game.scope === 'daily' && game.ranked === true)
  if (!supportsHardMode || !game.hardMode || !getSessionHardMode(serializedSession)) {
    return undefined
  }
  const sharedGuesses = getSharedPuzzleGuesses(game, getMovePuzzleIndex(serializedSession))
  if (sharedGuesses.length === 0) {
    return undefined
  }
  const validation = validateHardModeGuess(guess, sharedGuesses)
  return validation.ok ? undefined : validation.message
}

function isSolvedGuess(result: GuessResult): boolean {
  return result.tiles.length > 0 && result.tiles.every((tile) => tile.state === 'correct')
}

function applySolvedGuessToGoSession(
  game: MultiplayerGame,
  serializedSession: Extract<MultiplayerSerializedSession, { readonly mode: 'go' }>,
  solvedGuess: string,
): MultiplayerSerializedSession | undefined {
  const session = restoreGoSession(extendFinalGoPuzzleAttempts(serializedSession).session, getValidGuesses(game))
  const puzzleIndex = session.currentPuzzleIndex
  const currentPuzzle = session.puzzles[puzzleIndex]
  if (!currentPuzzle || currentPuzzle.answer !== solvedGuess) {
    return undefined
  }

  const puzzles = [...session.puzzles]
  puzzles[puzzleIndex] = {
    ...currentPuzzle,
    currentGuess: solvedGuess,
    lastValidation: undefined,
    maxAttempts: Math.max(currentPuzzle.maxAttempts, currentPuzzle.guesses.length + 1),
    status: 'playing',
  }
  const next = submitGoGuess({
    ...session,
    puzzles,
    revealedAnswer: undefined,
    status: 'playing',
  })
  const submittedPuzzle = next.puzzles[puzzleIndex]
  if (submittedPuzzle.lastValidation) {
    return undefined
  }
  const result = submittedPuzzle.guesses[submittedPuzzle.guesses.length - 1]
  if (!result || !isSolvedGuess(result)) {
    return undefined
  }
  return { mode: 'go', session: serializeGoSession(next) }
}

function synchronizeSolvedGoPuzzleSessions(
  game: MultiplayerGame,
  sessions: Partial<Record<MultiplayerPlayerId, MultiplayerSerializedSession>>,
  playerId: MultiplayerPlayerId,
  solvedPuzzleIndex: number,
  solvedGuess: string,
  solvedSession: MultiplayerSerializedSession,
): Partial<Record<MultiplayerPlayerId, MultiplayerSerializedSession>> {
  if (game.mode !== 'go' || solvedSession.mode !== 'go') {
    return sessions
  }

  const nextSessions: Partial<Record<MultiplayerPlayerId, MultiplayerSerializedSession>> = {
    ...sessions,
    [playerId]: solvedSession,
  }

  for (const targetPlayerId of ['player-one', 'player-two'] as const) {
    if (targetPlayerId === playerId) {
      continue
    }
    const targetSession = nextSessions[targetPlayerId] ?? getMultiplayerSessionForPlayer(game, targetPlayerId)
    if (!targetSession || targetSession.mode !== 'go') {
      continue
    }
    if (targetSession.session.currentPuzzleIndex !== solvedPuzzleIndex) {
      continue
    }
    const targetPuzzle = targetSession.session.puzzles[solvedPuzzleIndex]
    if (!targetPuzzle || targetPuzzle.answer !== solvedGuess) {
      continue
    }
    if (targetPuzzle.guesses.includes(solvedGuess)) {
      continue
    }
    const applied = applySolvedGuessToGoSession(game, targetSession, solvedGuess)
    if (applied) {
      nextSessions[targetPlayerId] = applied
    }
  }

  return nextSessions
}

function getTerminalStatusAfterSubmission(
  game: MultiplayerGame,
  playerId: MultiplayerPlayerId,
  submittedStatus: MultiplayerGameStatus,
): Pick<MultiplayerGame, 'status' | 'winnerId'> {
  const opponentId = nextPlayerId(playerId)
  const opponentStatus = getSessionStatus(getMultiplayerSessionForPlayer(game, opponentId))
  if (game.mode === 'og' && submittedStatus === 'won') {
    return { status: 'won', winnerId: playerId }
  }
  if (game.mode === 'og' && submittedStatus === 'lost' && opponentStatus === 'lost') {
    return { status: 'lost', winnerId: undefined }
  }
  if (game.mode === 'go' && submittedStatus !== 'playing' && opponentStatus !== 'playing') {
    return { status: 'won', winnerId: undefined }
  }
  return { status: 'playing', winnerId: game.winnerId }
}

export function submitMultiplayerGuess(state: MultiplayerState, input: SubmitMultiplayerGuessInput): SubmitMultiplayerGuessResult {
  const normalized = normalizeMultiplayerState(state)
  const game = normalized.games.find((entry) => entry.id === input.gameId)
  if (!game) {
    return { error: 'Multiplayer game not found.', state: normalized }
  }
  if (game.status === 'waiting') {
    return { error: 'Waiting for another player to join this multiplayer match.', game, state: normalized }
  }
  if (game.status !== 'playing') {
    return { error: 'This multiplayer game is already finished.', game, state: normalized }
  }
  const playerId = input.playerId ?? game.currentTurn
  if (playerId !== game.currentTurn) {
    return { error: "It is not this player's turn.", game, state: normalized }
  }

  const now = input.now ?? new Date().toISOString()
  const clocked = applyClockForTurn(game, playerId, now)
  if (clocked.status !== 'playing') {
    return {
      game: clocked,
      state: {
        games: normalized.games.map((entry) => entry.id === clocked.id ? clocked : entry),
      },
    }
  }
  const playerSession = getMultiplayerSessionForPlayer(clocked, playerId)
  if (getSessionStatus(playerSession) !== 'playing') {
    return { error: 'This player has already finished their board.', game: clocked, state: normalized }
  }
  const sharedHardModeError = validateSharedHardModeGuess(clocked, playerSession, input.guess)
  if (sharedHardModeError) {
    return { error: sharedHardModeError, game: clocked, state: normalized }
  }
  const applied = applyGuessToSession(clocked, playerSession, input.guess)
  if (applied.error || !applied.result || !applied.serializedSession || !applied.status) {
    return { error: applied.error ?? 'Unable to submit that guess.', game: clocked, state: normalized }
  }

  const move: MultiplayerMove = {
    createdAt: now,
    guess: applied.result.guess,
    id: createId('move'),
    playerId,
    puzzleIndex: getMovePuzzleIndex(playerSession),
    tiles: applied.result.tiles,
  }
  const status = applied.status
  const basePlayerSessions = {
    ...clocked.playerSessions,
    [playerId]: applied.serializedSession,
  }
  const playerSessions = isSolvedGuess(applied.result)
    ? synchronizeSolvedGoPuzzleSessions(
      clocked,
      basePlayerSessions,
      playerId,
      move.puzzleIndex,
      move.guess,
      applied.serializedSession,
    )
    : basePlayerSessions
  const sessionUpdatedGame: MultiplayerGame = {
    ...clocked,
    playerSessions,
    serializedSession: applied.serializedSession,
  }
  const terminal = getTerminalStatusAfterSubmission(sessionUpdatedGame, playerId, status)
  const gameStatus = terminal.status
  const updated: MultiplayerGame = {
    ...sessionUpdatedGame,
    currentTurn: gameStatus === 'playing' ? getNextTurnAfterSubmission(sessionUpdatedGame, playerId, status) : clocked.currentTurn,
    endedAt: gameStatus === 'playing' ? undefined : now,
    moves: [...clocked.moves, move],
    status: gameStatus,
    turnStartedAt: gameStatus === 'playing' && clocked.timeLimitMs ? now : undefined,
    updatedAt: now,
    winnerId: terminal.winnerId,
  }

  return {
    game: updated,
    state: {
      games: normalized.games.map((entry) => entry.id === updated.id ? updated : entry),
    },
  }
}

export function forfeitMultiplayerGame(state: MultiplayerState, input: ForfeitMultiplayerGameInput): SubmitMultiplayerGuessResult {
  const normalized = normalizeMultiplayerState(state)
  const game = normalized.games.find((entry) => entry.id === input.gameId)
  if (!game) {
    return { error: 'Multiplayer game not found.', state: normalized }
  }
  if (game.status !== 'waiting' && game.status !== 'playing') {
    return { error: 'This multiplayer game is already finished.', game, state: normalized }
  }
  if (!game.playerUserIds?.[input.playerId]) {
    return { error: 'Only a player in this match can forfeit.', game, state: normalized }
  }

  const now = input.now ?? new Date().toISOString()
  const opponentId = nextPlayerId(input.playerId)
  if (game.moves.length === 0) {
    const cancelled: MultiplayerGame = {
      ...game,
      endedAt: now,
      status: 'cancelled',
      updatedAt: now,
      winnerId: undefined,
    }
    return {
      game: cancelled,
      state: {
        games: normalized.games.map((entry) => entry.id === cancelled.id ? cancelled : entry),
      },
    }
  }
  const winnerId = game.playerUserIds?.[opponentId] ? opponentId : undefined
  const updated: MultiplayerGame = {
    ...game,
    endedAt: now,
    forfeitedPlayerId: input.playerId,
    status: 'lost',
    updatedAt: now,
    winnerId,
  }
  return {
    game: updated,
    state: {
      games: normalized.games.map((entry) => entry.id === updated.id ? updated : entry),
    },
  }
}

function applyClockForTurn(game: MultiplayerGame, playerId: MultiplayerPlayerId, nowIso: string): MultiplayerGame {
  if (game.scope !== 'practice' || !game.timeLimitMs || game.status !== 'playing' || game.currentTurn !== playerId) {
    return game
  }
  const remaining = normalizeTimeRemaining(game.timeRemainingMs, game.timeLimitMs) ?? {
    'player-one': game.timeLimitMs,
    'player-two': game.timeLimitMs,
  }
  const previous = remaining[playerId] ?? game.timeLimitMs
  const nextRemaining = Math.max(0, previous - getElapsedMs(game.turnStartedAt, nowIso))
  const timeRemainingMs = { ...remaining, [playerId]: nextRemaining }
  if (nextRemaining > 0) {
    return { ...game, timeRemainingMs, turnStartedAt: nowIso, updatedAt: nowIso }
  }
  const winnerId = nextPlayerId(playerId)
  return {
    ...game,
    endedAt: nowIso,
    status: 'lost',
    timedOutPlayerId: playerId,
    timeRemainingMs,
    turnStartedAt: undefined,
    updatedAt: nowIso,
    winnerId,
  }
}

export interface MultiplayerClockState {
  readonly activePlayerId?: MultiplayerPlayerId
  readonly remainingByPlayer: Readonly<Record<MultiplayerPlayerId, number>>
  readonly timedOutPlayerId?: MultiplayerPlayerId
  readonly timeLimitMs?: PracticeMultiplayerTimeLimitMs
}

export function getMultiplayerClockState(game: MultiplayerGame, now = new Date()): MultiplayerClockState | undefined {
  if (game.scope !== 'practice' || !game.timeLimitMs) {
    return undefined
  }
  const remaining = normalizeTimeRemaining(game.timeRemainingMs, game.timeLimitMs) ?? {
    'player-one': game.timeLimitMs,
    'player-two': game.timeLimitMs,
  }
  const activePlayerId = game.status === 'playing' ? game.currentTurn : undefined
  const activeRemaining = activePlayerId
    ? Math.max(0, (remaining[activePlayerId] ?? game.timeLimitMs) - getElapsedMs(game.turnStartedAt, now.toISOString()))
    : undefined
  const remainingByPlayer = {
    ...remaining,
    ...(activePlayerId ? { [activePlayerId]: activeRemaining ?? remaining[activePlayerId] ?? game.timeLimitMs } : {}),
  } as Readonly<Record<MultiplayerPlayerId, number>>
  return {
    activePlayerId,
    remainingByPlayer,
    timedOutPlayerId: game.timedOutPlayerId ?? (activePlayerId && remainingByPlayer[activePlayerId] <= 0 ? activePlayerId : undefined),
    timeLimitMs: game.timeLimitMs,
  }
}

export function expireTimedOutPracticeMultiplayerGames(state: MultiplayerState, now = new Date(), viewerUserId?: string): MultiplayerState {
  const nowIso = now.toISOString()
  return {
    games: normalizeMultiplayerState(state).games.map((game) => {
      if (viewerUserId && getViewerMultiplayerPlayerId(game, viewerUserId) !== game.currentTurn) {
        return game
      }
      const clock = getMultiplayerClockState(game, now)
      if (!clock?.timedOutPlayerId) {
        return game
      }
      return applyClockForTurn(game, game.currentTurn, nowIso)
    }),
  }
}

export function expireStaleDailyMultiplayerGames(state: MultiplayerState, now = new Date()): MultiplayerState {
  const currentUtcKey = getUtcDailyDateKey(now)
  const nowIso = now.toISOString()
  return {
    games: normalizeMultiplayerState(state).games.map((game) => {
      if (game.scope !== 'daily' || (game.status !== 'playing' && game.status !== 'waiting')) {
        return game
      }
      const expiredByDate = Boolean(game.dailyDateKey && game.dailyDateKey < currentUtcKey)
      const expiredByDeadline = Boolean(game.deadlineAt && Date.parse(game.deadlineAt) <= now.getTime())
      if (!expiredByDate && !expiredByDeadline) {
        return game
      }
      return {
        ...game,
        endedAt: game.endedAt ?? nowIso,
        status: 'expired',
        updatedAt: nowIso,
      }
    }),
  }
}

export function getMultiplayerGamesForDate(state: MultiplayerState, dateKey: string): readonly MultiplayerGame[] {
  return normalizeMultiplayerState(state).games.filter((game) => game.scope === 'daily' && game.dailyDateKey === dateKey)
}

export function hasDailyMultiplayerGame(state: MultiplayerState, dateKey: string, mode: GameMode): boolean {
  return getMultiplayerGamesForDate(state, dateKey).some((game) => game.mode === mode)
}

export function getMultiplayerAnswerWords(game: MultiplayerGame): readonly string[] {
  if (game.serializedSession.mode === 'og') {
    return [game.serializedSession.session.answer]
  }
  return game.serializedSession.session.puzzles.map((puzzle) => puzzle.answer)
}

export function mergeMultiplayerStates(left: unknown, right: unknown): MultiplayerState {
  const gamesById = new Map<string, MultiplayerGame>()
  for (const game of normalizeMultiplayerState(right).games) {
    gamesById.set(game.id, game)
  }
  for (const game of normalizeMultiplayerState(left).games) {
    const existing = gamesById.get(game.id)
    if (!existing || game.updatedAt >= existing.updatedAt) {
      gamesById.set(game.id, game)
    }
  }
  return {
    games: Array.from(gamesById.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  }
}
