import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Json } from '../../src/types/database.js';
import type {
  WordAnswerRecord,
  WordListDocument,
  WordListManifest,
  WordListManifestLength,
} from '../../src/types/services.js';
import type { WordListStore } from './blob-store.js';
import { RefreshError } from './safe-error.js';

const DATASET = 'ryanjosephkamp/english-openlist' as const;
const PATH_PREFIX = 'latest/brrrdle' as const;
const SUPPORTED_LENGTHS = Array.from({ length: 34 }, (_, index) => index + 2);
const metadataSchema = z.object({
  sha: z.string().min(7).max(128),
  lastModified: z.string().datetime().optional(),
});
const currentManifestSchema = z.object({
  revision: z.string(),
  generatedAt: z.string().datetime(),
  entries: z.array(z.object({ length: z.number().int().min(2).max(35) })).length(34),
});

type UpstreamPayload = Record<string, unknown> | string[];

export type RefreshSummary = {
  revision: string;
  generatedAt: string;
  fetchedAt: string;
  counts: Array<{ length: number; answers: number; validGuesses: number }>;
  persistence: 'manifest-published' | 'manifest-already-current' | 'manifest-preserved-newer';
};

export type RefreshDependencies = {
  store: WordListStore;
  fetcher?: typeof fetch;
  now?: () => Date;
};

function stringArray(source: Record<string, unknown>, names: string[]): string[] | null {
  for (const name of names) {
    const value = source[name];
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value;
  }
  return null;
}

function answerArray(source: Record<string, unknown>, names: string[]): unknown[] | null {
  for (const name of names) {
    const value = source[name];
    if (Array.isArray(value)) return value;
  }
  return null;
}

function normalizeWords(words: string[], length: number, label: string): string[] {
  if (words.length === 0)
    throw new RefreshError('validation', `Length ${length} ${label} was empty.`);
  const normalized = words.map((word) => word.normalize('NFKC').trim().toLowerCase());
  if (normalized.some((word) => !/^[a-z]+$/.test(word) || word.length !== length)) {
    throw new RefreshError('validation', `Length ${length} ${label} failed normalization.`);
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new RefreshError('validation', `Length ${length} ${label} contained duplicates.`);
  }
  return normalized;
}

function isJsonRecord(value: unknown): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeAnswers(answers: unknown[], length: number): WordAnswerRecord[] {
  if (answers.length === 0) {
    throw new RefreshError('validation', `Length ${length} answers was empty.`);
  }
  const normalized = answers.map((answer) => {
    if (typeof answer === 'string') {
      const [word] = normalizeWords([answer], length, 'answers');
      if (!word) throw new RefreshError('validation', `Length ${length} answer was invalid.`);
      return { word };
    }
    if (!isJsonRecord(answer) || typeof answer.word !== 'string') {
      throw new RefreshError('validation', `Length ${length} answers had an invalid record.`);
    }
    const [word] = normalizeWords([answer.word], length, 'answers');
    if (!word) throw new RefreshError('validation', `Length ${length} answer was invalid.`);
    return { ...answer, word };
  });
  const words = normalized.map(({ word }) => word);
  if (new Set(words).size !== words.length) {
    throw new RefreshError('validation', `Length ${length} answers contained duplicates.`);
  }
  return normalized;
}

export function validateWordListPayload(payload: unknown, length: number): WordListDocument {
  if (!Number.isInteger(length) || length < 2 || length > 35) {
    throw new RefreshError('validation', 'The requested word length is unsupported.');
  }
  if (!Array.isArray(payload) && (typeof payload !== 'object' || payload === null)) {
    throw new RefreshError('validation', `Length ${length} payload was not an object or array.`);
  }
  const source = payload as UpstreamPayload;
  const answersRaw = Array.isArray(source)
    ? source
    : answerArray(source, ['answers', 'answerWords', 'answer_words']);
  const validRaw = Array.isArray(source)
    ? source
    : stringArray(source, [
        'validGuesses',
        'valid_guesses',
        'validWords',
        'valid_words',
        'allowedGuesses',
        'guesses',
        'words',
      ]);
  if (!answersRaw || !validRaw) {
    throw new RefreshError(
      'validation',
      `Length ${length} payload omitted answers or valid guesses.`,
    );
  }
  const answers = normalizeAnswers(answersRaw, length);
  const validGuesses = normalizeWords(validRaw, length, 'valid guesses');
  const validSet = new Set(validGuesses);
  if (answers.some(({ word }) => !validSet.has(word))) {
    throw new RefreshError(
      'validation',
      `Length ${length} answers were not included in valid guesses.`,
    );
  }

  const rawMetadata: unknown = Array.isArray(source) ? null : source.metadata;
  let metadata: Record<string, Json> | null = null;
  if (rawMetadata !== null && rawMetadata !== undefined) {
    if (!isJsonRecord(rawMetadata)) {
      throw new RefreshError('validation', `Length ${length} metadata was invalid.`);
    }
    metadata = rawMetadata;
  }
  if (metadata && metadata.length !== undefined && metadata.length !== length) {
    throw new RefreshError('validation', `Length ${length} metadata did not match its file.`);
  }
  return {
    metadata: {
      length,
      source:
        metadata && typeof metadata.source === 'string'
          ? metadata.source
          : `huggingface:${DATASET}`,
      version: metadata && typeof metadata.version === 'string' ? metadata.version : 'unknown',
      generatedAt:
        metadata && typeof metadata.generatedAt === 'string'
          ? metadata.generatedAt
          : new Date(0).toISOString(),
      ...(metadata?.curation === undefined ? {} : { curation: metadata.curation }),
    },
    answers,
    validGuesses,
  };
}

function safeRevision(revision: string): string {
  const value = revision.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 128);
  if (value.length < 7)
    throw new RefreshError('source-metadata', 'Upstream revision metadata was invalid.');
  return value;
}

async function jsonResponse(
  response: Response,
  stage: 'source-metadata' | 'fetch',
): Promise<unknown> {
  if (!response.ok)
    throw new RefreshError(stage, 'The upstream word-list request did not complete.');
  try {
    return await response.json();
  } catch (error) {
    throw new RefreshError(stage, 'The upstream word-list response was invalid.', { cause: error });
  }
}

function summary(
  manifest: WordListManifest,
  persistence: RefreshSummary['persistence'],
): RefreshSummary {
  return {
    revision: manifest.revision,
    generatedAt: manifest.generatedAt,
    fetchedAt: manifest.fetchedAt,
    counts: manifest.entries.map(({ length, answers, validGuesses }) => ({
      length,
      answers,
      validGuesses,
    })),
    persistence,
  };
}

export async function refreshAllWordLists(
  dependencies: RefreshDependencies,
): Promise<RefreshSummary> {
  const fetcher = dependencies.fetcher ?? fetch;
  const now = dependencies.now ?? (() => new Date());
  let metadataResponse: Response;
  try {
    metadataResponse = await fetcher(
      `https://huggingface.co/api/datasets/${DATASET}/revision/main`,
      { headers: { Accept: 'application/json', 'User-Agent': 'amordle-word-list-refresh/1' } },
    );
  } catch (error) {
    throw new RefreshError('source-metadata', 'The upstream dataset could not be reached.', {
      cause: error,
    });
  }
  const metadata = metadataSchema.safeParse(
    await jsonResponse(metadataResponse, 'source-metadata'),
  );
  if (!metadata.success)
    throw new RefreshError('source-metadata', 'Upstream revision metadata was invalid.');
  const revision = safeRevision(metadata.data.sha);
  const fetchedAt = now().toISOString();
  const generatedAt = metadata.data.lastModified ?? fetchedAt;

  const documents = await Promise.all(
    SUPPORTED_LENGTHS.map(async (length) => {
      const url = `https://huggingface.co/datasets/${DATASET}/resolve/${encodeURIComponent(revision)}/${PATH_PREFIX}/words_length_${length}.json`;
      let response: Response;
      try {
        response = await fetcher(url, {
          headers: { Accept: 'application/json', 'User-Agent': 'amordle-word-list-refresh/1' },
        });
      } catch (error) {
        throw new RefreshError('fetch', `Length ${length} could not be fetched.`, { cause: error });
      }
      const document = validateWordListPayload(await jsonResponse(response, 'fetch'), length);
      return {
        ...document,
        metadata: {
          ...document.metadata,
          version: document.metadata.version === 'unknown' ? revision : document.metadata.version,
          generatedAt:
            document.metadata.generatedAt === new Date(0).toISOString()
              ? generatedAt
              : document.metadata.generatedAt,
        },
      };
    }),
  );

  const entries: WordListManifestLength[] = [];
  await Promise.all(
    documents.map(async (document) => {
      const body = JSON.stringify(document);
      const path = `word-lists/${revision}/words_length_${document.metadata.length}.json`;
      const stored = await dependencies.store.put(path, body, 'application/json; charset=utf-8');
      entries.push({
        length: document.metadata.length,
        url: stored.url,
        answers: document.answers.length,
        validGuesses: document.validGuesses.length,
        status: 'served',
      });
    }),
  );
  entries.sort((left, right) => left.length - right.length);
  if (entries.length !== SUPPORTED_LENGTHS.length) {
    throw new RefreshError('persistence', 'The served word list was not changed.');
  }

  const manifest: WordListManifest = {
    revision,
    generatedAt,
    fetchedAt,
    source: { datasetId: DATASET, pathPrefix: PATH_PREFIX },
    entries,
  };

  const currentRaw = await dependencies.store.readJson('word-lists/manifest.json');
  const current = currentManifestSchema.safeParse(currentRaw);
  if (current.success && current.data.revision === revision) {
    return summary(manifest, 'manifest-already-current');
  }
  if (current.success && Date.parse(current.data.generatedAt) > Date.parse(generatedAt)) {
    return {
      ...summary(manifest, 'manifest-preserved-newer'),
      revision: current.data.revision,
      generatedAt: current.data.generatedAt,
    };
  }
  await dependencies.store.put(
    'word-lists/manifest.json',
    JSON.stringify(manifest),
    'application/json; charset=utf-8',
  );
  return summary(manifest, 'manifest-published');
}

export function refreshRequestId(): string {
  return randomUUID();
}
