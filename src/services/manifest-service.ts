import { z } from 'zod';
import type { Json } from '../types/database.js';
import type {
  PublicManifestResponse,
  WordListDocument,
  WordListManifest,
} from '../types/services.js';
import { ServiceError } from './service-error.js';

const answerSchema = z.object({ word: z.string() }).catchall(z.json());
const wordListDocumentSchema = z.object({
  metadata: z
    .object({
      length: z.number().int().min(2).max(35),
      source: z.string().min(1).max(240),
      version: z.string().min(1).max(160),
      generatedAt: z.string().datetime(),
      curation: z.json().optional(),
    })
    .passthrough(),
  answers: z.array(answerSchema).min(1),
  validGuesses: z.array(z.string()).min(1),
});

const manifestEntrySchema = z.object({
  length: z.number().int().min(2).max(35),
  url: z
    .string()
    .min(1)
    .max(2048)
    .refine((value) => {
      if (value.startsWith('/') && !value.startsWith('//')) return true;
      try {
        return new URL(value).protocol === 'https:';
      } catch {
        return false;
      }
    }),
  answers: z.number().int().positive(),
  validGuesses: z.number().int().positive(),
  status: z.literal('served'),
});

export const wordListManifestSchema = z
  .object({
    revision: z.string().regex(/^[a-zA-Z0-9._-]{7,128}$/),
    generatedAt: z.string().datetime(),
    fetchedAt: z.string().datetime(),
    source: z.object({
      datasetId: z.literal('ryanjosephkamp/english-openlist'),
      pathPrefix: z.literal('latest/brrrdle').optional(),
      bundledFrom: z.string().url().optional(),
    }),
    entries: z.array(manifestEntrySchema).length(34),
  })
  .superRefine((manifest, context) => {
    const lengths = manifest.entries.map(({ length }) => length);
    if (new Set(lengths).size !== 34) {
      context.addIssue({ code: 'custom', message: 'Manifest lengths were not unique.' });
    }
    for (let length = 2; length <= 35; length += 1) {
      if (!lengths.includes(length)) {
        context.addIssue({ code: 'custom', message: `Manifest omitted length ${length}.` });
      }
    }
  });

type ManifestSource = 'remote' | 'bundled';
type ManifestRecord = { manifest: WordListManifest; source: ManifestSource };

function normalizeDocument(payload: unknown, length: number): WordListDocument {
  const parsed = wordListDocumentSchema.safeParse(payload);
  if (!parsed.success || parsed.data.metadata.length !== length) {
    throw new ServiceError('validation', `Word list for length ${length} was invalid.`);
  }
  const answers = parsed.data.answers.map((record) => ({
    ...record,
    word: record.word.normalize('NFKC').trim().toLowerCase(),
  }));
  const validGuesses = parsed.data.validGuesses.map((word) =>
    word.normalize('NFKC').trim().toLowerCase(),
  );
  const answerWords = answers.map(({ word }) => word);
  const validSet = new Set(validGuesses);
  const invalid = [...answerWords, ...validGuesses].some(
    (word) => !/^[a-z]+$/.test(word) || word.length !== length,
  );
  if (
    invalid ||
    new Set(answerWords).size !== answerWords.length ||
    new Set(validGuesses).size !== validGuesses.length ||
    answerWords.some((word) => !validSet.has(word))
  ) {
    throw new ServiceError('validation', `Word list for length ${length} failed normalization.`);
  }
  return {
    metadata: {
      length: parsed.data.metadata.length,
      source: parsed.data.metadata.source,
      version: parsed.data.metadata.version,
      generatedAt: parsed.data.metadata.generatedAt,
      ...(parsed.data.metadata.curation === undefined
        ? {}
        : { curation: parsed.data.metadata.curation as Json }),
    },
    answers,
    validGuesses,
  };
}

export class ManifestService {
  private manifestCache: { value: ManifestRecord; expiresAt: number } | null = null;
  private manifestInFlight: Promise<ManifestRecord> | null = null;
  private bundledManifest: WordListManifest | null = null;
  private readonly documents = new Map<number, WordListDocument>();
  private readonly documentRequests = new Map<number, Promise<WordListDocument>>();

  constructor(
    private readonly fetcher: typeof fetch = (input, init) => globalThis.fetch(input, init),
  ) {}

  async get(options: { force?: boolean } = {}): Promise<PublicManifestResponse> {
    const record = await this.resolveManifest(Boolean(options.force));
    return {
      manifest: record.manifest,
      ...(record.source === 'bundled'
        ? { note: 'Remote word-list metadata was unavailable; bundled word data is active.' }
        : {}),
    };
  }

  async loadLength(length: number, options: { force?: boolean } = {}): Promise<WordListDocument> {
    if (!Number.isInteger(length) || length < 2 || length > 35) {
      throw new ServiceError('validation', 'The requested word length is unsupported.');
    }
    if (!options.force) {
      const cached = this.documents.get(length);
      if (cached) return cached;
      const running = this.documentRequests.get(length);
      if (running) return running;
    }
    const request = this.loadLengthWithFallback(length).finally(() => {
      this.documentRequests.delete(length);
    });
    this.documentRequests.set(length, request);
    const document = await request;
    this.documents.set(length, document);
    return document;
  }

  private async loadLengthWithFallback(length: number): Promise<WordListDocument> {
    const primary = await this.resolveManifest(false);
    try {
      return await this.fetchDocument(primary.manifest, length);
    } catch (error) {
      if (primary.source === 'bundled') throw error;
      const bundled = await this.fetchBundledManifest();
      return this.fetchDocument(bundled, length);
    }
  }

  private async resolveManifest(force: boolean): Promise<ManifestRecord> {
    if (!force && this.manifestCache && this.manifestCache.expiresAt > Date.now()) {
      return this.manifestCache.value;
    }
    if (this.manifestInFlight) return this.manifestInFlight;
    this.manifestInFlight = this.fetchRemoteOrBundled().finally(() => {
      this.manifestInFlight = null;
    });
    const value = await this.manifestInFlight;
    this.manifestCache = { value, expiresAt: Date.now() + 5 * 60_000 };
    return value;
  }

  private async fetchRemoteOrBundled(): Promise<ManifestRecord> {
    try {
      const response = await this.fetcher('/api/word-lists/manifest', {
        headers: { Accept: 'application/json' },
      });
      if (response.ok) {
        const payload: unknown = await response.json();
        const envelope = z
          .object({ manifest: wordListManifestSchema.nullable() })
          .safeParse(payload);
        if (envelope.success && envelope.data.manifest) {
          return { manifest: envelope.data.manifest as WordListManifest, source: 'remote' };
        }
      }
    } catch {
      // The bundled manifest below is the deliberate local-play fallback.
    }
    return { manifest: await this.fetchBundledManifest(), source: 'bundled' };
  }

  private async fetchBundledManifest(): Promise<WordListManifest> {
    if (this.bundledManifest) return this.bundledManifest;
    const response = await this.fetcher('/word-lists/bundled/manifest.json', {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok)
      throw new ServiceError('network', 'Bundled word-list metadata is unavailable.');
    const parsed = wordListManifestSchema.safeParse(await response.json());
    if (!parsed.success)
      throw new ServiceError('validation', 'Bundled word-list metadata was invalid.');
    this.bundledManifest = parsed.data as WordListManifest;
    return parsed.data as WordListManifest;
  }

  private async fetchDocument(
    manifest: WordListManifest,
    length: number,
  ): Promise<WordListDocument> {
    const entry = manifest.entries.find((candidate) => candidate.length === length);
    if (!entry)
      throw new ServiceError('validation', `Word list for length ${length} was not served.`);
    const response = await this.fetcher(entry.url, { headers: { Accept: 'application/json' } });
    if (!response.ok)
      throw new ServiceError('network', `Word list for length ${length} is unavailable.`);
    return normalizeDocument(await response.json(), length);
  }
}
