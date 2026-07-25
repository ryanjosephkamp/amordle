import { isPracticeGoPuzzleCount, type GoPuzzleCount } from '../../domain/go';
import {
  assertWordLength,
  type Difficulty,
  type WordLength,
  type WordList,
  type WordListProvider,
} from '../../domain/words';

export type SoloMode = 'og' | 'go';
export type SoloScope = 'daily' | 'practice';

interface SoloLaunchBase {
  readonly difficulty: Difficulty;
  readonly hardMode: boolean;
}

export type SoloLaunchSpec =
  | (SoloLaunchBase & {
      readonly scope: 'daily';
      readonly mode: 'og';
      readonly wordLength: 5;
    })
  | (SoloLaunchBase & {
      readonly scope: 'daily';
      readonly mode: 'go';
      readonly wordLength: 5;
      readonly goPuzzleCount: 5;
    })
  | (SoloLaunchBase & {
      readonly scope: 'practice';
      readonly mode: 'og';
      readonly wordLength: WordLength;
    })
  | (SoloLaunchBase & {
      readonly scope: 'practice';
      readonly mode: 'go';
      readonly wordLength: WordLength;
      readonly goPuzzleCount: GoPuzzleCount;
    });

export interface SoloLaunchInput {
  readonly scope: SoloScope;
  readonly mode: SoloMode;
  readonly wordLength?: unknown;
  readonly goPuzzleCount?: unknown;
  readonly difficulty?: unknown;
  readonly hardMode?: unknown;
}

export type SoloLaunchCanonicalizationReason =
  | 'daily_word_length_removed'
  | 'daily_go_count_removed'
  | 'og_go_count_removed'
  | 'difficulty_defaulted'
  | 'hard_mode_defaulted';

export interface SoloLaunchNormalization {
  readonly changed: boolean;
  readonly reasons: readonly SoloLaunchCanonicalizationReason[];
  readonly canonical: {
    readonly wordLength: WordLength;
    readonly goPuzzleCount?: GoPuzzleCount;
    readonly difficulty: Difficulty;
    readonly hardMode: boolean;
  };
}

export type SoloLaunchFailure = {
  readonly ok: false;
  readonly code: 'invalid_word_length' | 'invalid_go_puzzle_count';
  readonly field: 'wordLength' | 'goPuzzleCount';
  readonly message: string;
};

export type SoloLaunchNormalizationResult =
  | {
      readonly ok: true;
      readonly spec: SoloLaunchSpec;
      readonly normalization: SoloLaunchNormalization;
    }
  | SoloLaunchFailure;

function supplied(value: unknown): boolean {
  return (
    value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === '')
  );
}

function parseInteger(value: unknown, fallback: number): number | undefined {
  if (!supplied(value)) return fallback;
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value.trim());
  return Number.isInteger(parsed) ? parsed : undefined;
}

function normalizeDifficulty(
  value: unknown,
  reasons: SoloLaunchCanonicalizationReason[],
): Difficulty {
  if (value === 'casual' || value === 'standard' || value === 'expert') return value;
  if (supplied(value)) reasons.push('difficulty_defaulted');
  return 'expert';
}

function normalizeHardMode(value: unknown, reasons: SoloLaunchCanonicalizationReason[]): boolean {
  if (value === true || value === 1 || value === '1') return true;
  if (!supplied(value) || value === false || value === 0 || value === '0') return false;
  reasons.push('hard_mode_defaulted');
  return false;
}

/**
 * Pure route-boundary normalization. Daily tampering is removed in favor of its
 * fixed contract; invalid Practice configuration fails instead of substituting
 * another word list.
 */
export function normalizeSoloLaunch(input: SoloLaunchInput): SoloLaunchNormalizationResult {
  const reasons: SoloLaunchCanonicalizationReason[] = [];
  const difficulty = normalizeDifficulty(input.difficulty, reasons);
  const hardMode = normalizeHardMode(input.hardMode, reasons);

  if (input.scope === 'daily') {
    if (supplied(input.wordLength)) reasons.push('daily_word_length_removed');
    if (supplied(input.goPuzzleCount)) reasons.push('daily_go_count_removed');
    const spec: SoloLaunchSpec =
      input.mode === 'go'
        ? { scope: 'daily', mode: 'go', wordLength: 5, goPuzzleCount: 5, difficulty, hardMode }
        : { scope: 'daily', mode: 'og', wordLength: 5, difficulty, hardMode };
    return {
      ok: true,
      spec,
      normalization: {
        changed: reasons.length > 0,
        reasons,
        canonical: {
          wordLength: 5,
          ...(input.mode === 'go' ? { goPuzzleCount: 5 as const } : {}),
          difficulty,
          hardMode,
        },
      },
    };
  }

  const parsedLength = parseInteger(input.wordLength, 5);
  if (parsedLength === undefined) {
    return {
      ok: false,
      code: 'invalid_word_length',
      field: 'wordLength',
      message: 'Practice word length must be an integer from 2 through 35.',
    };
  }
  let wordLength: WordLength;
  try {
    wordLength = assertWordLength(parsedLength);
  } catch {
    return {
      ok: false,
      code: 'invalid_word_length',
      field: 'wordLength',
      message: 'Practice word length must be an integer from 2 through 35.',
    };
  }

  if (input.mode === 'og') {
    if (supplied(input.goPuzzleCount)) reasons.push('og_go_count_removed');
    const spec: SoloLaunchSpec = {
      scope: 'practice',
      mode: 'og',
      wordLength,
      difficulty,
      hardMode,
    };
    return {
      ok: true,
      spec,
      normalization: {
        changed: reasons.length > 0,
        reasons,
        canonical: { wordLength, difficulty, hardMode },
      },
    };
  }

  const parsedCount = parseInteger(input.goPuzzleCount, 5);
  if (parsedCount === undefined || !isPracticeGoPuzzleCount(parsedCount)) {
    return {
      ok: false,
      code: 'invalid_go_puzzle_count',
      field: 'goPuzzleCount',
      message: 'Practice GO chain count must be 5, 7, or 10.',
    };
  }
  const spec: SoloLaunchSpec = {
    scope: 'practice',
    mode: 'go',
    wordLength,
    goPuzzleCount: parsedCount,
    difficulty,
    hardMode,
  };
  return {
    ok: true,
    spec,
    normalization: {
      changed: reasons.length > 0,
      reasons,
      canonical: { wordLength, goPuzzleCount: parsedCount, difficulty, hardMode },
    },
  };
}

export type PreparedSoloLaunch =
  | SoloLaunchFailure
  | {
      readonly ok: true;
      readonly spec: SoloLaunchSpec;
      readonly normalization: SoloLaunchNormalization;
      readonly wordList: WordList;
    };

/** Adapter seam that guarantees invalid Practice configuration cannot touch word data. */
export async function prepareSoloLaunch(
  input: SoloLaunchInput,
  provider: WordListProvider,
  signal?: AbortSignal,
): Promise<PreparedSoloLaunch> {
  const normalized = normalizeSoloLaunch(input);
  if (!normalized.ok) return normalized;
  const wordList = await provider.load(normalized.spec.wordLength, signal);
  return { ...normalized, wordList };
}
