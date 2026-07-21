import { describe, expect, it } from 'vitest';
import type { WordListStore } from '../../api/_lib/blob-store';
import { RefreshError } from '../../api/_lib/safe-error';
import { refreshAllWordLists } from '../../api/_lib/word-list-refresh';

class RecordingStore implements WordListStore {
  readonly writes: Array<{ path: string; body: string }> = [];

  constructor(
    private readonly rejectPath?: string,
    private readonly currentManifest: unknown | null = null,
  ) {}

  async put(path: string, body: string): Promise<{ url: string }> {
    if (path === this.rejectPath) throw new RefreshError('persistence', 'injected failure');
    this.writes.push({ path, body });
    return { url: `https://example.test/${path}` };
  }

  async readJson(): Promise<unknown | null> {
    return this.currentManifest;
  }
}

function fixtureFetch(): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/api/datasets/')) {
      return Response.json({ sha: 'abcdef0123456789', lastModified: '2026-07-21T00:00:00.000Z' });
    }
    const lengthMatch = /words_length_(\d+)\.json/.exec(url);
    if (!lengthMatch) return new Response(null, { status: 404 });
    const length = Number(lengthMatch[1]);
    const answer = 'a'.repeat(length);
    return Response.json({ answers: [answer], validGuesses: [answer] });
  }) as typeof fetch;
}

describe('atomic word-list refresh', () => {
  it('uploads every revision object before the manifest pointer', async () => {
    const store = new RecordingStore();
    const result = await refreshAllWordLists({
      store,
      fetcher: fixtureFetch(),
      now: () => new Date('2026-07-21T01:00:00.000Z'),
    });

    expect(store.writes).toHaveLength(35);
    expect(store.writes.at(-1)?.path).toBe('word-lists/manifest.json');
    expect(
      store.writes
        .slice(0, -1)
        .every(({ path }) => path.startsWith('word-lists/abcdef0123456789/')),
    ).toBe(true);
    expect(result.counts).toHaveLength(34);
    expect(result.persistence).toBe('manifest-published');
  });

  it('never writes the manifest after a length upload failure', async () => {
    const store = new RecordingStore('word-lists/abcdef0123456789/words_length_17.json');
    await expect(refreshAllWordLists({ store, fetcher: fixtureFetch() })).rejects.toMatchObject({
      stage: 'persistence',
    });
    expect(store.writes.some(({ path }) => path === 'word-lists/manifest.json')).toBe(false);
  });

  it('does not claim success when the manifest write fails', async () => {
    const store = new RecordingStore('word-lists/manifest.json');
    await expect(refreshAllWordLists({ store, fetcher: fixtureFetch() })).rejects.toThrow(
      'injected failure',
    );
    expect(store.writes).toHaveLength(34);
  });

  it('does not regress a newer manifest during an overlapping refresh', async () => {
    const newerManifest = {
      revision: 'newer-revision',
      generatedAt: '2026-07-22T00:00:00.000Z',
      entries: Array.from({ length: 34 }, (_, index) => ({ length: index + 2 })),
    };
    const store = new RecordingStore(undefined, newerManifest);
    const result = await refreshAllWordLists({ store, fetcher: fixtureFetch() });
    expect(result.persistence).toBe('manifest-preserved-newer');
    expect(result.revision).toBe('newer-revision');
    expect(store.writes.some(({ path }) => path === 'word-lists/manifest.json')).toBe(false);
  });

  it('treats an identical published revision as idempotently current', async () => {
    const currentManifest = {
      revision: 'abcdef0123456789',
      generatedAt: '2026-07-21T00:00:00.000Z',
      entries: Array.from({ length: 34 }, (_, index) => ({ length: index + 2 })),
    };
    const store = new RecordingStore(undefined, currentManifest);
    const result = await refreshAllWordLists({ store, fetcher: fixtureFetch() });
    expect(result.persistence).toBe('manifest-already-current');
    expect(store.writes.some(({ path }) => path === 'word-lists/manifest.json')).toBe(false);
  });

  it('fails all-or-nothing validation before any storage write', async () => {
    const store = new RecordingStore();
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
    await expect(refreshAllWordLists({ store, fetcher })).rejects.toMatchObject({
      stage: 'validation',
    });
    expect(store.writes).toHaveLength(0);
  });
});
