import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ManifestService } from '../../src/services/manifest-service';
import type { WordListManifest } from '../../src/types/services';

function manifest(prefix: string): WordListManifest {
  return {
    revision: 'abcdef0123456789',
    generatedAt: '2026-07-21T00:00:00.000Z',
    fetchedAt: '2026-07-21T01:00:00.000Z',
    source: { datasetId: 'ryanjosephkamp/english-openlist' },
    entries: Array.from({ length: 34 }, (_, index) => ({
      length: index + 2,
      url: `${prefix}/words_length_${index + 2}.json`,
      answers: 1,
      validGuesses: 1,
      status: 'served',
    })),
  };
}

function document(length: number) {
  const word = 'a'.repeat(length);
  return {
    metadata: {
      length,
      source: 'fixture',
      version: 'abcdef0123456789',
      generatedAt: '2026-07-21T00:00:00.000Z',
    },
    answers: [{ word }],
    validGuesses: [word],
  };
}

describe('browser word-list service', () => {
  it('accepts the tracked bundled manifest and record-shaped length payload', async () => {
    const fetcher = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/word-lists/manifest') return Response.json({ manifest: null });
      const relative = url.replace(/^\//, '');
      const payload = JSON.parse(
        await readFile(
          path.join(process.cwd(), 'public', relative.replace('word-lists/', 'word-lists/')),
          'utf8',
        ),
      ) as unknown;
      return Response.json(payload);
    }) as typeof fetch;
    const service = new ManifestService(fetcher);
    const loaded = await service.loadLength(5);
    expect(loaded.metadata.length).toBe(5);
    expect(loaded.answers.length).toBeGreaterThan(2_000);
    expect(loaded.answers[0]?.word).toMatch(/^[a-z]{5}$/);
    expect(loaded.validGuesses.length).toBeGreaterThan(9_000);
  });

  it('uses the public remote manifest and lazily loads only one length', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/word-lists/manifest')
        return Response.json({ manifest: manifest('/remote') });
      if (url === '/remote/words_length_5.json') return Response.json(document(5));
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;
    const service = new ManifestService(fetcher);
    const loaded = await service.loadLength(5);
    expect(loaded.answers).toEqual([{ word: 'aaaaa' }]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).not.toHaveBeenCalledWith(
      '/word-lists/bundled/manifest.json',
      expect.anything(),
    );
  });

  it('falls back to the bundled manifest and record-shaped answers', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/word-lists/manifest') return new Response(null, { status: 502 });
      if (url === '/word-lists/bundled/manifest.json') {
        return Response.json(manifest('/word-lists/bundled'));
      }
      if (url === '/word-lists/bundled/words_length_8.json') return Response.json(document(8));
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;
    const service = new ManifestService(fetcher);
    const response = await service.get();
    expect(response.note).toContain('bundled');
    expect((await service.loadLength(8)).answers[0]?.word).toBe('aaaaaaaa');
  });

  it('falls back per length when the remote document is invalid', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/word-lists/manifest')
        return Response.json({ manifest: manifest('/remote') });
      if (url === '/remote/words_length_3.json') return Response.json({ answers: [] });
      if (url === '/word-lists/bundled/manifest.json') {
        return Response.json(manifest('/word-lists/bundled'));
      }
      if (url === '/word-lists/bundled/words_length_3.json') return Response.json(document(3));
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;
    const service = new ManifestService(fetcher);
    await expect(service.loadLength(3)).resolves.toMatchObject({
      answers: [{ word: 'aaa' }],
    });
  });

  it('deduplicates concurrent loads of the same length', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === '/api/word-lists/manifest')
        return Response.json({ manifest: manifest('/remote') });
      if (url === '/remote/words_length_2.json') return Response.json(document(2));
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;
    const service = new ManifestService(fetcher);
    const [first, second] = await Promise.all([service.loadLength(2), service.loadLength(2)]);
    expect(first).toBe(second);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
