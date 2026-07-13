export type GameMode = 'og' | 'go'
export type PlayScope = 'daily' | 'practice'
export type TileState = 'absent' | 'present' | 'correct'
export type GameStatus = 'playing' | 'won' | 'lost'
export type GuessValidationReason =
  | 'empty'
  | 'wrong-length'
  | 'invalid-characters'
  | 'unsupported-length'
  | 'not-in-word-list'
  | 'game-over'
  | 'hard-mode'

export interface TileResult {
  readonly letter: string
  readonly state: TileState
}

export interface GuessResult {
  readonly guess: string
  readonly tiles: readonly TileResult[]
}

export interface WordLengthRules {
  readonly scope: PlayScope
  readonly wordLength: number
}

export interface ValidationFailure {
  readonly ok: false
  readonly reason: GuessValidationReason
  readonly message: string
}

export interface ValidationSuccess {
  readonly ok: true
}

export type ValidationResult = ValidationSuccess | ValidationFailure
