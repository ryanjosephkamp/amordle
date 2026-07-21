export const MIN_WORD_LENGTH = 2;
export const MAX_WORD_LENGTH = 35;

export type WordLength = number;
export type Difficulty = 'casual' | 'standard' | 'expert';

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
