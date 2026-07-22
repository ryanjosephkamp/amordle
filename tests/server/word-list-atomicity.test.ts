import { describe, expect, it } from 'vitest';
import type { WordListStore } from '../../api/_lib/blob-store';
import {
  PublicationPreconditionError,
  type PublicationRecord,
  type PublicationWrite,
  type WordListPublicationStore,
} from '../../api/_lib/word-list-publication-store';
import { RefreshError } from '../../api/_lib/safe-error';
import { refreshAllWordLists } from '../../api/_lib/word-list-refresh';
import type { WordListManifest } from '../../src/types/services';

const MANIFEST_PATH = 'word-lists/manifest.json';
const LEASE_PATH = 'word-lists/.refresh-lease.json';
const NOW = new Date('2026-07-21T01:00:00.000Z');

type StoredRecord = PublicationRecord & { body: string };

class MemoryPublicationStore implements WordListPublicationStore {
  readonly records = new Map<string, StoredRecord>();
  readonly events: string[] = [];
  rejectImmutablePath?: string;
  beforeImmutable?: (path: string) => Promise<void>;
  beforeReplaceJson?: (path: string) => Promise<void>;
  beforeDelete?: (path: string) => Promise<void>;
  private version = 0;

  seedJson(path: string, value: unknown, uploadedAt = NOW): StoredRecord {
    return this.write(path, JSON.stringify(value), value, uploadedAt);
  }

  async readJson<T = unknown>(path: string): Promise<PublicationRecord<T> | null> {
    const record = this.records.get(path);
    if (!record) return null;
    return {
      value: structuredClone(record.value) as T,
      etag: record.etag,
      url: record.url,
      uploadedAt: new Date(record.uploadedAt),
    };
  }

  async createJson(path: string, value: unknown): Promise<PublicationWrite> {
    if (this.records.has(path)) throw new PublicationPreconditionError();
    this.events.push(`create:${path}`);
    return this.write(path, JSON.stringify(value), structuredClone(value));
  }

  async replaceJson(path: string, value: unknown, expectedEtag: string): Promise<PublicationWrite> {
    await this.beforeReplaceJson?.(path);
    const current = this.records.get(path);
    if (!current || current.etag !== expectedEtag) throw new PublicationPreconditionError();
    this.events.push(`replace:${path}`);
    return this.write(path, JSON.stringify(value), structuredClone(value));
  }

  async deleteIfMatch(path: string, expectedEtag: string): Promise<void> {
    await this.beforeDelete?.(path);
    const current = this.records.get(path);
    if (!current || current.etag !== expectedEtag) throw new PublicationPreconditionError();
    this.events.push(`delete:${path}`);
    this.records.delete(path);
  }

  async putImmutable(path: string, body: string): Promise<PublicationWrite> {
    await this.beforeImmutable?.(path);
    if (path === this.rejectImmutablePath) {
      throw new RefreshError('persistence', 'injected immutable upload failure');
    }
    const current = this.records.get(path);
    if (current) {
      if (current.body !== body) throw new Error('immutable object conflict');
      return { etag: current.etag, url: current.url };
    }
    this.events.push(`immutable:${path}`);
    return this.write(path, body, body);
  }

  private write(path: string, body: string, value: unknown, uploadedAt = NOW): StoredRecord {
    const record: StoredRecord = {
      value,
      body,
      etag: `etag-${++this.version}`,
      url: `https://example.test/${path}`,
      uploadedAt: new Date(uploadedAt),
    };
    this.records.set(path, record);
    return record;
  }
}

function unusedLegacyStore(): WordListStore {
  return {
    async put() {
      throw new Error('Legacy unconditional storage must not publish refresh objects.');
    },
    async readJson() {
      throw new Error('Legacy unconditional storage must not read publication metadata.');
    },
  };
}

function fixtureFetch(revision = 'abcdef0123456789'): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/api/datasets/')) {
      return Response.json({ sha: revision, lastModified: '2026-07-21T00:00:00.000Z' });
    }
    const lengthMatch = /words_length_(\d+)\.json/.exec(url);
    if (!lengthMatch) return new Response(null, { status: 404 });
    const length = Number(lengthMatch[1]);
    const answer = 'a'.repeat(length);
    return Response.json({ answers: [answer], validGuesses: [answer] });
  }) as typeof fetch;
}

function manifest(
  revision: string,
  generatedAt: string,
  fetchedAt = generatedAt,
): WordListManifest {
  return {
    revision,
    generatedAt,
    fetchedAt,
    source: { datasetId: 'ryanjosephkamp/english-openlist', pathPrefix: 'latest/brrrdle' },
    entries: Array.from({ length: 34 }, (_, index) => ({
      length: index + 2,
      url: `https://example.test/word-lists/${revision}/words_length_${index + 2}.json`,
      answers: 1,
      validGuesses: 1,
      status: 'served' as const,
    })),
  };
}

function refresh(
  publication: MemoryPublicationStore,
  options: {
    fetcher?: typeof fetch;
    leaseId?: string;
    now?: Date;
  } = {},
) {
  return refreshAllWordLists({
    store: unusedLegacyStore(),
    publication,
    fetcher: options.fetcher ?? fixtureFetch(),
    now: () => options.now ?? NOW,
    leaseId: () => options.leaseId ?? '00000000-0000-4000-8000-000000000001',
  });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('leased atomic word-list refresh', () => {
  it('uploads every immutable revision object before conditional manifest promotion', async () => {
    const publication = new MemoryPublicationStore();
    const result = await refresh(publication);

    expect(result.counts).toHaveLength(34);
    expect(result.persistence).toBe('manifest-published');
    const manifestEvent = publication.events.indexOf(`create:${MANIFEST_PATH}`);
    const immutableEvents = publication.events.filter((event) => event.startsWith('immutable:'));
    expect(immutableEvents).toHaveLength(34);
    expect(
      publication.events.slice(0, manifestEvent).filter((event) => event.startsWith('immutable:')),
    ).toHaveLength(34);
    expect(publication.events.at(0)).toBe(`create:${LEASE_PATH}`);
    expect(publication.events.at(-1)).toBe(`delete:${LEASE_PATH}`);
  });

  it('lets simultaneous callers return in-progress while exactly one owner publishes', async () => {
    const publication = new MemoryPublicationStore();
    const ownerEnteredUpload = deferred();
    const releaseOwner = deferred();
    let held = false;
    publication.beforeImmutable = async () => {
      if (held) return;
      held = true;
      ownerEnteredUpload.resolve();
      await releaseOwner.promise;
    };

    const owner = refresh(publication, {
      leaseId: '00000000-0000-4000-8000-000000000001',
    });
    await ownerEnteredUpload.promise;
    const joined = await refresh(publication, {
      leaseId: '00000000-0000-4000-8000-000000000002',
    });
    expect(joined).toMatchObject({
      persistence: 'refresh-in-progress',
      activeRevision: 'abcdef0123456789',
    });

    releaseOwner.resolve();
    await expect(owner).resolves.toMatchObject({ persistence: 'manifest-published' });
    expect(publication.events.filter((event) => event === `create:${MANIFEST_PATH}`)).toHaveLength(
      1,
    );
    expect(publication.events.filter((event) => event.startsWith('immutable:'))).toHaveLength(34);
  });

  it('takes over a stale lease using its exact ETag', async () => {
    const publication = new MemoryPublicationStore();
    publication.seedJson(
      LEASE_PATH,
      {
        version: 1,
        leaseId: '00000000-0000-4000-8000-000000000099',
        revision: 'stale-revision',
        acquiredAt: '2026-07-21T00:40:00.000Z',
        expiresAt: '2026-07-21T00:45:00.000Z',
      },
      new Date('2026-07-21T00:40:00.000Z'),
    );

    await expect(refresh(publication)).resolves.toMatchObject({
      persistence: 'manifest-published',
    });
    expect(publication.events).toContain(`replace:${LEASE_PATH}`);
    expect(publication.records.has(LEASE_PATH)).toBe(false);
  });

  it('preserves the winner when manifest promotion loses its ETag precondition', async () => {
    const publication = new MemoryPublicationStore();
    publication.seedJson(MANIFEST_PATH, manifest('older-revision', '2026-07-20T00:00:00.000Z'));
    let injected = false;
    publication.beforeReplaceJson = async (path) => {
      if (path !== MANIFEST_PATH || injected) return;
      injected = true;
      publication.seedJson(MANIFEST_PATH, manifest('newer-revision', '2026-07-22T00:00:00.000Z'));
    };

    const result = await refresh(publication);
    expect(result).toMatchObject({
      persistence: 'manifest-preserved-newer',
      revision: 'newer-revision',
    });
    expect(publication.records.get(MANIFEST_PATH)?.value).toMatchObject({
      revision: 'newer-revision',
    });
  });

  it('leaves the prior pointer intact after a partial immutable upload failure', async () => {
    const publication = new MemoryPublicationStore();
    const prior = manifest('prior-revision', '2026-07-20T00:00:00.000Z');
    publication.seedJson(MANIFEST_PATH, prior);
    publication.rejectImmutablePath = 'word-lists/abcdef0123456789/words_length_17.json';

    await expect(refresh(publication)).rejects.toMatchObject({ stage: 'persistence' });
    expect(publication.records.get(MANIFEST_PATH)?.value).toEqual(prior);
    expect(publication.records.has(LEASE_PATH)).toBe(false);
    expect(publication.events.some((event) => event === `replace:${MANIFEST_PATH}`)).toBe(false);
  });

  it('never deletes a replacement lease during safe conditional release', async () => {
    const publication = new MemoryPublicationStore();
    const replacement = {
      version: 1,
      leaseId: '00000000-0000-4000-8000-000000000777',
      revision: 'future-revision',
      acquiredAt: '2026-07-21T01:00:01.000Z',
      expiresAt: '2026-07-21T01:05:01.000Z',
    };
    let replaced = false;
    publication.beforeDelete = async (path) => {
      if (path !== LEASE_PATH || replaced) return;
      replaced = true;
      publication.seedJson(LEASE_PATH, replacement, new Date('2026-07-21T01:00:01.000Z'));
    };

    await expect(refresh(publication)).resolves.toMatchObject({
      persistence: 'manifest-published',
    });
    expect(publication.records.get(LEASE_PATH)?.value).toEqual(replacement);
    expect(publication.events).not.toContain(`delete:${LEASE_PATH}`);
  });

  it('returns current without uploading when the same revision is already published', async () => {
    const publication = new MemoryPublicationStore();
    publication.seedJson(MANIFEST_PATH, manifest('abcdef0123456789', '2026-07-21T00:00:00.000Z'));
    const result = await refresh(publication);
    expect(result.persistence).toBe('manifest-already-current');
    expect(publication.events.filter((event) => event.startsWith('immutable:'))).toHaveLength(0);
  });

  it('fails all-or-nothing validation before lease acquisition or storage writes', async () => {
    const publication = new MemoryPublicationStore();
    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/api/datasets/')) return Response.json({ sha: 'abcdef0123456789' });
      const length = Number(/words_length_(\d+)\.json/.exec(url)?.[1]);
      const answer = 'a'.repeat(length);
      return Response.json(
        length === 9
          ? { answers: [], validGuesses: [answer] }
          : { answers: [answer], validGuesses: [answer] },
      );
    }) as typeof fetch;

    await expect(refresh(publication, { fetcher })).rejects.toMatchObject({
      stage: 'validation',
    });
    expect(publication.events).toEqual([]);
    expect(publication.records.size).toBe(0);
  });
});
