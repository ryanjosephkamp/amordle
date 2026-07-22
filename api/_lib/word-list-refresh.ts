import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Json } from '../../src/types/database.js';
import type {
  WordAnswerRecord,
  WordListDocument,
  WordListManifest,
  WordListManifestLength,
} from '../../src/types/services.js';
import { wordListManifestSchema } from '../../src/services/manifest-service.js';
import type { WordListStore } from './blob-store.js';
import { RefreshError } from './safe-error.js';
import {
  createVercelWordListPublicationStore,
  PublicationPreconditionError,
  type PublicationRecord,
  type WordListPublicationStore,
} from './word-list-publication-store.js';

const DATASET = 'ryanjosephkamp/english-openlist' as const;
const PATH_PREFIX = 'latest/brrrdle' as const;
const SUPPORTED_LENGTHS = Array.from({ length: 34 }, (_, index) => index + 2);
const MANIFEST_PATH = 'word-lists/manifest.json' as const;
const REFRESH_LEASE_PATH = 'word-lists/.refresh-lease.json' as const;
const REFRESH_LEASE_DURATION_MS = 5 * 60_000;
const metadataSchema = z.object({
  sha: z.string().min(7).max(128),
  lastModified: z.string().datetime().optional(),
});
const refreshLeaseSchema = z.object({
  version: z.literal(1),
  leaseId: z.string().min(1).max(200),
  revision: z.string().regex(/^[a-zA-Z0-9._-]{7,128}$/),
  acquiredAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

type UpstreamPayload = Record<string, unknown> | string[];

export type RefreshSummary = {
  revision: string;
  generatedAt: string;
  fetchedAt: string;
  counts: Array<{ length: number; answers: number; validGuesses: number }>;
  persistence:
    | 'manifest-published'
    | 'manifest-already-current'
    | 'manifest-preserved-newer'
    | 'refresh-in-progress';
  activeRevision?: string;
};

export type RefreshDependencies = {
  store: WordListStore;
  fetcher?: typeof fetch;
  now?: () => Date;
  publication?: WordListPublicationStore;
  leaseId?: () => string;
};

type RefreshLease = z.infer<typeof refreshLeaseSchema>;
type AcquiredLease = { acquired: true; lease: RefreshLease; etag: string };
type BusyLease = { acquired: false; activeRevision?: string };

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

function countsFromDocuments(documents: readonly WordListDocument[]) {
  return documents
    .map((document) => ({
      length: document.metadata.length,
      answers: document.answers.length,
      validGuesses: document.validGuesses.length,
    }))
    .sort((left, right) => left.length - right.length);
}

function inProgressSummary(
  revision: string,
  generatedAt: string,
  fetchedAt: string,
  documents: readonly WordListDocument[],
  activeRevision?: string,
): RefreshSummary {
  return {
    revision,
    generatedAt,
    fetchedAt,
    counts: countsFromDocuments(documents),
    persistence: 'refresh-in-progress',
    ...(activeRevision ? { activeRevision } : {}),
  };
}

function parseManifest(
  record: PublicationRecord | null,
): { record: PublicationRecord; manifest: WordListManifest } | null {
  if (!record) return null;
  const parsed = wordListManifestSchema.safeParse(record.value);
  if (!parsed.success) {
    throw new RefreshError('persistence', 'Stored word-list metadata was invalid.');
  }
  return { record, manifest: parsed.data as WordListManifest };
}

function existingManifestResult(
  current: ReturnType<typeof parseManifest>,
  revision: string,
  generatedAt: string,
): RefreshSummary | null {
  if (!current) return null;
  if (current.manifest.revision === revision) {
    return summary(current.manifest, 'manifest-already-current');
  }
  if (Date.parse(current.manifest.generatedAt) > Date.parse(generatedAt)) {
    return summary(current.manifest, 'manifest-preserved-newer');
  }
  return null;
}

async function readPublicationRecord(
  publication: WordListPublicationStore,
  path: string,
): Promise<PublicationRecord | null> {
  try {
    return await publication.readJson(path);
  } catch (error) {
    throw new RefreshError('persistence', 'Stored word-list metadata could not be read.', {
      cause: error,
    });
  }
}

async function acquireRefreshLease(
  publication: WordListPublicationStore,
  lease: RefreshLease,
  nowMs: number,
): Promise<AcquiredLease | BusyLease> {
  let current = await readPublicationRecord(publication, REFRESH_LEASE_PATH);
  if (!current) {
    try {
      const created = await publication.createJson(REFRESH_LEASE_PATH, lease);
      return { acquired: true, lease, etag: created.etag };
    } catch (error) {
      if (!(error instanceof PublicationPreconditionError)) {
        throw new RefreshError(
          'persistence',
          'The refresh publication lease could not be acquired.',
          {
            cause: error,
          },
        );
      }
      current = await readPublicationRecord(publication, REFRESH_LEASE_PATH);
      if (!current) return { acquired: false };
    }
  }

  const parsed = refreshLeaseSchema.safeParse(current.value);
  const boundedExpiryMs = Math.min(
    parsed.success ? Date.parse(parsed.data.expiresAt) : Number.POSITIVE_INFINITY,
    current.uploadedAt.getTime() + REFRESH_LEASE_DURATION_MS,
  );
  if (boundedExpiryMs > nowMs) {
    return {
      acquired: false,
      ...(parsed.success ? { activeRevision: parsed.data.revision } : {}),
    };
  }

  try {
    const replaced = await publication.replaceJson(REFRESH_LEASE_PATH, lease, current.etag);
    return { acquired: true, lease, etag: replaced.etag };
  } catch (error) {
    if (error instanceof PublicationPreconditionError) {
      const active = await readPublicationRecord(publication, REFRESH_LEASE_PATH);
      const activeLease = refreshLeaseSchema.safeParse(active?.value);
      return {
        acquired: false,
        ...(activeLease.success ? { activeRevision: activeLease.data.revision } : {}),
      };
    }
    throw new RefreshError('persistence', 'The stale refresh publication lease was not replaced.', {
      cause: error,
    });
  }
}

async function assertLeaseOwnership(
  publication: WordListPublicationStore,
  acquired: AcquiredLease,
): Promise<void> {
  const current = await readPublicationRecord(publication, REFRESH_LEASE_PATH);
  const parsed = refreshLeaseSchema.safeParse(current?.value);
  if (
    !current ||
    current.etag !== acquired.etag ||
    !parsed.success ||
    parsed.data.leaseId !== acquired.lease.leaseId
  ) {
    throw new RefreshError(
      'persistence',
      'The refresh publication lease changed before manifest promotion.',
    );
  }
}

async function safelyReleaseLease(
  publication: WordListPublicationStore,
  acquired: AcquiredLease,
): Promise<void> {
  try {
    await publication.deleteIfMatch(REFRESH_LEASE_PATH, acquired.etag);
  } catch (error) {
    // A failed precondition proves another caller already replaced this lease.
    // Other release failures are bounded by stale-lease takeover and must not
    // turn an already-published manifest into a reported failure.
    if (!(error instanceof PublicationPreconditionError)) {
      console.warn('word-list-refresh: lease release deferred to stale takeover');
    }
  }
}

async function resultAfterPromotionRace(
  publication: WordListPublicationStore,
  revision: string,
  generatedAt: string,
): Promise<RefreshSummary> {
  const latest = parseManifest(await readPublicationRecord(publication, MANIFEST_PATH));
  const accepted = existingManifestResult(latest, revision, generatedAt);
  if (accepted) return accepted;
  throw new RefreshError(
    'persistence',
    'The word-list manifest changed during conditional promotion.',
  );
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

  const publication = dependencies.publication ?? createVercelWordListPublicationStore();
  const beforeLease = parseManifest(await readPublicationRecord(publication, MANIFEST_PATH));
  const beforeLeaseResult = existingManifestResult(beforeLease, revision, generatedAt);
  if (beforeLeaseResult) return beforeLeaseResult;

  const acquiredAt = now();
  const lease: RefreshLease = {
    version: 1,
    leaseId: (dependencies.leaseId ?? randomUUID)(),
    revision,
    acquiredAt: acquiredAt.toISOString(),
    expiresAt: new Date(acquiredAt.getTime() + REFRESH_LEASE_DURATION_MS).toISOString(),
  };
  const acquired = await acquireRefreshLease(publication, lease, acquiredAt.getTime());
  if (acquired.acquired === false) {
    const current = parseManifest(await readPublicationRecord(publication, MANIFEST_PATH));
    const currentResult = existingManifestResult(current, revision, generatedAt);
    return (
      currentResult ??
      inProgressSummary(revision, generatedAt, fetchedAt, documents, acquired.activeRevision)
    );
  }

  try {
    const entries: WordListManifestLength[] = [];
    await Promise.all(
      documents.map(async (document) => {
        const body = JSON.stringify(document);
        const path = `word-lists/${revision}/words_length_${document.metadata.length}.json`;
        const stored = await publication.putImmutable(
          path,
          body,
          'application/json; charset=utf-8',
        );
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

    await assertLeaseOwnership(publication, acquired);
    const current = parseManifest(await readPublicationRecord(publication, MANIFEST_PATH));
    const currentResult = existingManifestResult(current, revision, generatedAt);
    if (currentResult) return currentResult;

    try {
      if (current) {
        await publication.replaceJson(MANIFEST_PATH, manifest, current.record.etag);
      } else {
        await publication.createJson(MANIFEST_PATH, manifest);
      }
    } catch (error) {
      if (error instanceof PublicationPreconditionError) {
        return resultAfterPromotionRace(publication, revision, generatedAt);
      }
      throw new RefreshError('persistence', 'The word-list manifest was not promoted.', {
        cause: error,
      });
    }
    return summary(manifest, 'manifest-published');
  } finally {
    await safelyReleaseLease(publication, acquired);
  }
}

export function refreshRequestId(): string {
  return randomUUID();
}
