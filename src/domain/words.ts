export const MIN_WORD_LENGTH = 2;
export const MAX_WORD_LENGTH = 35;

export type WordLength = number;
export type Difficulty = 'casual' | 'standard' | 'expert';

export const CASUAL_ANSWER_FRACTION = 0.35;
export const STANDARD_ANSWER_FRACTION = 0.7;

export const WORD_QUALITY_WEIGHTS = {
  frequency: 0.45,
  positional: 0.3,
  vowelBalance: 0.15,
  uniqueness: 0.1,
} as const;

export interface WordDefinition {
  readonly partOfSpeech?: string;
  readonly text: string;
}

export interface WordList {
  readonly schemaVersion: 1;
  readonly revision: string;
  readonly wordLength: WordLength;
  readonly answers: Readonly<Record<Difficulty, readonly string[]>>;
  readonly validGuesses: readonly string[];
  readonly definitions?: Readonly<Record<string, readonly WordDefinition[]>>;
}

export interface WordListProvider {
  load(wordLength: WordLength, signal?: AbortSignal): Promise<WordList>;
}

export class WordListValidationError extends Error {
  readonly name = 'WordListValidationError';

  constructor(message: string) {
    super(message);
  }
}

export function isWordLength(value: unknown): value is WordLength {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_WORD_LENGTH &&
    value <= MAX_WORD_LENGTH
  );
}

export function assertWordLength(value: number): WordLength {
  if (!isWordLength(value)) {
    throw new RangeError(
      `Word length must be an integer from ${MIN_WORD_LENGTH} through ${MAX_WORD_LENGTH}.`,
    );
  }
  return value;
}

export function normalizeWord(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
}

export function isAcceptedAlphabeticWord(value: string): boolean {
  return /^[a-z]+$/.test(value);
}

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
const TARGET_VOWEL_RATIO = 0.4;

interface FrequencyModel {
  readonly overall: ReadonlyMap<string, number>;
  readonly positional: readonly ReadonlyMap<string, number>[];
}

export interface WordQualityScore {
  readonly word: string;
  readonly score: number;
}

function buildFrequencyModel(words: readonly string[], wordLength: number): FrequencyModel {
  const overallCounts = new Map<string, number>();
  const positionalCounts: Map<string, number>[] = Array.from(
    { length: wordLength },
    () => new Map(),
  );
  let totalLetters = 0;
  for (const word of words) {
    for (let position = 0; position < word.length; position += 1) {
      const letter = word[position];
      if (letter === undefined) continue;
      overallCounts.set(letter, (overallCounts.get(letter) ?? 0) + 1);
      const positionMap = positionalCounts[position];
      positionMap?.set(letter, (positionMap.get(letter) ?? 0) + 1);
      totalLetters += 1;
    }
  }
  const overall = new Map<string, number>();
  for (const [letter, count] of overallCounts) overall.set(letter, count / totalLetters);
  return {
    overall,
    positional: positionalCounts.map((counts) => {
      const probabilities = new Map<string, number>();
      for (const [letter, count] of counts) probabilities.set(letter, count / words.length);
      return probabilities;
    }),
  };
}

function minMaxNormalize(values: readonly number[]): readonly number[] {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum;
  if (!Number.isFinite(range) || range === 0) return values.map(() => 0);
  return values.map((value) => (value - minimum) / range);
}

/**
 * Deterministically quality-ranks one retained answer catalog. The weighting is
 * the source-authorized in-repository model; it never changes valid guesses or
 * imports external frequency data.
 */
export function scoreWordsByQuality(
  rawWords: readonly string[],
  rawWordLength?: number,
): readonly WordQualityScore[] {
  const words = [...new Set(rawWords.map(normalizeWord))];
  if (words.length === 0) return [];
  const wordLength = assertWordLength(rawWordLength ?? words[0]?.length ?? 0);
  if (words.some((word) => !isAcceptedAlphabeticWord(word) || word.length !== wordLength)) {
    throw new WordListValidationError('Quality ranking requires one valid word length.');
  }
  const model = buildFrequencyModel(words, wordLength);
  const rawFrequency = words.map(
    (word) =>
      [...word].reduce((sum, letter) => sum + (model.overall.get(letter) ?? 0), 0) / word.length,
  );
  const rawPositional = words.map(
    (word) =>
      [...word].reduce(
        (sum, letter, position) => sum + (model.positional[position]?.get(letter) ?? 0),
        0,
      ) / word.length,
  );
  const frequency = minMaxNormalize(rawFrequency);
  const positional = minMaxNormalize(rawPositional);
  return words
    .map((word, index) => {
      const vowelRatio = [...word].filter((letter) => VOWELS.has(letter)).length / word.length;
      const maxVowelDistance = Math.max(TARGET_VOWEL_RATIO, 1 - TARGET_VOWEL_RATIO);
      const vowelBalance = 1 - Math.abs(vowelRatio - TARGET_VOWEL_RATIO) / maxVowelDistance;
      const uniqueness = new Set(word).size / word.length;
      return {
        word,
        score:
          WORD_QUALITY_WEIGHTS.frequency * (frequency[index] ?? 0) +
          WORD_QUALITY_WEIGHTS.positional * (positional[index] ?? 0) +
          WORD_QUALITY_WEIGHTS.vowelBalance * vowelBalance +
          WORD_QUALITY_WEIGHTS.uniqueness * uniqueness,
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score || (left.word < right.word ? -1 : left.word > right.word ? 1 : 0),
    );
}

/** Select quality-ranked nested pools while preserving the retained catalog order. */
export function partitionAnswerPools(
  rawAnswers: readonly string[],
): Readonly<Record<Difficulty, readonly string[]>> {
  const answers = [...new Set(rawAnswers.map(normalizeWord))];
  if (answers.length === 0) throw new WordListValidationError('Expert answers cannot be empty.');
  const wordLength = assertWordLength(answers[0]?.length ?? 0);
  const ordered = scoreWordsByQuality(answers, wordLength).map(({ word }) => word);
  const casualCount = Math.max(1, Math.ceil(answers.length * CASUAL_ANSWER_FRACTION));
  const standardCount = Math.max(casualCount, Math.ceil(answers.length * STANDARD_ANSWER_FRACTION));
  const casualSet = new Set(ordered.slice(0, casualCount));
  const standardSet = new Set(ordered.slice(0, standardCount));
  return {
    casual: answers.filter((word) => casualSet.has(word)),
    standard: answers.filter((word) => standardSet.has(word)),
    expert: answers,
  };
}

const MILLISECONDS_PER_DAY = 86_400_000;

export function dailyAnswerIndex(dateKey: string, answerCount: number): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !Number.isInteger(answerCount) || answerCount < 1) {
    throw new RangeError('Daily selection requires a date key and at least one answer.');
  }
  const day = Date.parse(`${dateKey}T00:00:00.000Z`) / MILLISECONDS_PER_DAY;
  if (
    !Number.isInteger(day) ||
    new Date(day * MILLISECONDS_PER_DAY).toISOString().slice(0, 10) !== dateKey
  ) {
    throw new RangeError('Daily selection requires a valid date key.');
  }
  return ((day % answerCount) + answerCount) % answerCount;
}

/** Selects the canonical OG answer without reordering the authoritative catalog. */
export function selectDailyOgAnswer(catalog: readonly string[], dateKey: string): string {
  if (catalog.length === 0) throw new RangeError('Daily OG requires at least one answer.');
  const answer = catalog[dailyAnswerIndex(dateKey, catalog.length)];
  if (answer === undefined) throw new RangeError('Daily OG answer selection failed.');
  return answer;
}

function normalizeWords(
  values: readonly string[],
  wordLength: WordLength,
  label: string,
): string[] {
  const normalized = new Set<string>();
  for (const rawWord of values) {
    const word = normalizeWord(rawWord);
    if (!isAcceptedAlphabeticWord(word) || word.length !== wordLength) {
      throw new WordListValidationError(`${label} contains an invalid ${wordLength}-letter word.`);
    }
    normalized.add(word);
  }
  return [...normalized];
}

export interface CreateWordListInput {
  readonly revision: string;
  readonly wordLength: number;
  readonly answers: Readonly<Record<Difficulty, readonly string[]>>;
  readonly validGuesses: readonly string[];
  readonly definitions?: Readonly<Record<string, readonly WordDefinition[]>>;
}

export interface NormalizedBundledWordPayload {
  readonly revision: string;
  readonly wordLength: WordLength;
  readonly answers: readonly string[];
  readonly validGuesses: readonly string[];
  readonly source?: string;
  readonly generatedAt?: string;
}

/**
 * Normalizes the retained portable payload shape. Difficulty partitioning is
 * deliberately left to the application adapter because the payload carries a
 * single curated answer catalog rather than three authoritative pools.
 */
export function normalizeBundledWordPayload(value: unknown): NormalizedBundledWordPayload {
  if (typeof value !== 'object' || value === null) {
    throw new WordListValidationError('Bundled word payload must be an object.');
  }
  const payload = value as {
    readonly metadata?: {
      readonly length?: unknown;
      readonly version?: unknown;
      readonly source?: unknown;
      readonly generatedAt?: unknown;
    };
    readonly answers?: unknown;
    readonly validGuesses?: unknown;
  };
  const wordLength = assertWordLength(Number(payload.metadata?.length));
  const revision =
    typeof payload.metadata?.version === 'string' ? payload.metadata.version.trim() : '';
  if (!revision) throw new WordListValidationError('Bundled word payload has no revision.');
  if (!Array.isArray(payload.answers) || !Array.isArray(payload.validGuesses)) {
    throw new WordListValidationError('Bundled word payload has invalid word collections.');
  }
  const answerValues = payload.answers.map((entry) => {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof (entry as { word?: unknown }).word !== 'string'
    ) {
      throw new WordListValidationError('Bundled answer records must contain a word.');
    }
    return (entry as { word: string }).word;
  });
  if (payload.validGuesses.some((entry) => typeof entry !== 'string')) {
    throw new WordListValidationError('Bundled valid guesses must be strings.');
  }
  const answers = normalizeWords(answerValues, wordLength, 'Bundled answers');
  const validGuesses = normalizeWords(
    payload.validGuesses as string[],
    wordLength,
    'Bundled valid guesses',
  );
  const source = typeof payload.metadata?.source === 'string' ? payload.metadata.source.trim() : '';
  const generatedAt =
    typeof payload.metadata?.generatedAt === 'string' &&
    !Number.isNaN(Date.parse(payload.metadata.generatedAt))
      ? new Date(payload.metadata.generatedAt).toISOString()
      : '';
  return {
    revision,
    wordLength,
    answers,
    validGuesses,
    ...(source ? { source } : {}),
    ...(generatedAt ? { generatedAt } : {}),
  };
}

export function createWordList(input: CreateWordListInput): WordList {
  const wordLength = assertWordLength(input.wordLength);
  const revision = input.revision.trim();
  if (!revision) throw new WordListValidationError('Word-list revision is required.');

  const expert = normalizeWords(input.answers.expert, wordLength, 'Expert answers');
  const standard = normalizeWords(input.answers.standard, wordLength, 'Standard answers');
  const casual = normalizeWords(input.answers.casual, wordLength, 'Casual answers');
  if (expert.length === 0) throw new WordListValidationError('Expert answers cannot be empty.');

  const expertSet = new Set(expert);
  for (const [difficulty, answers] of [
    ['Casual', casual],
    ['Standard', standard],
  ] as const) {
    if (answers.length === 0)
      throw new WordListValidationError(`${difficulty} answers cannot be empty.`);
    if (answers.some((word) => !expertSet.has(word))) {
      throw new WordListValidationError(
        `${difficulty} answers must be a subset of Expert answers.`,
      );
    }
  }

  const validGuesses = normalizeWords(input.validGuesses, wordLength, 'Valid guesses');
  const validSet = new Set(validGuesses);
  for (const answer of expert) validSet.add(answer);

  let definitions: Readonly<Record<string, readonly WordDefinition[]>> | undefined;
  if (input.definitions) {
    const safeDefinitions: Record<string, readonly WordDefinition[]> = {};
    for (const [rawWord, entries] of Object.entries(input.definitions)) {
      const word = normalizeWord(rawWord);
      if (!expertSet.has(word) && !validSet.has(word)) continue;
      const safeEntries = entries
        .filter((entry) => entry.text.trim().length > 0)
        .map((entry) => {
          const text = entry.text.trim();
          const partOfSpeech = entry.partOfSpeech?.trim();
          return partOfSpeech ? { partOfSpeech, text } : { text };
        });
      if (safeEntries.length > 0) safeDefinitions[word] = safeEntries;
    }
    definitions = safeDefinitions;
  }

  return {
    schemaVersion: 1,
    revision,
    wordLength,
    answers: { casual, standard, expert },
    validGuesses: [...validSet],
    ...(definitions ? { definitions } : {}),
  };
}

export function answerPoolForDifficulty(
  wordList: WordList,
  difficulty: Difficulty = 'expert',
): readonly string[] {
  return wordList.answers[difficulty];
}

export function createCachedWordListProvider(
  source: WordListProvider,
): WordListProvider & { clear(): void } {
  const resolved = new Map<WordLength, WordList>();
  const inFlight = new Map<WordLength, Promise<WordList>>();

  return {
    async load(wordLength, signal) {
      assertWordLength(wordLength);
      if (signal?.aborted) throw signal.reason;
      const cached = resolved.get(wordLength);
      if (cached) return cached;
      const pending = inFlight.get(wordLength);
      if (pending) return pending;

      const request = source
        .load(wordLength, signal)
        .then((list) => {
          if (list.wordLength !== wordLength) {
            throw new WordListValidationError('Provider returned a different word length.');
          }
          resolved.set(wordLength, list);
          return list;
        })
        .finally(() => inFlight.delete(wordLength));
      inFlight.set(wordLength, request);
      return request;
    },
    clear() {
      resolved.clear();
      inFlight.clear();
    },
  };
}
