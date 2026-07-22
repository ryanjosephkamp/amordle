import { beforeEach, describe, expect, it, vi } from 'vitest';

const blob = vi.hoisted(() => ({
  get: vi.fn(),
  head: vi.fn(),
}));

vi.mock('@vercel/blob', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, get: blob.get, head: blob.head };
});

import { VercelWordListPublicationStore } from '../../api/_lib/word-list-publication-store';

function metadata(etag: string) {
  return {
    pathname: 'word-lists/manifest.json',
    url: 'https://store.public.blob.vercel-storage.com/word-lists/manifest.json',
    downloadUrl: 'https://example.test/download',
    etag,
    uploadedAt: new Date('2026-07-21T00:00:00.000Z'),
    size: 20,
    contentType: 'application/json',
    contentDisposition: 'inline',
    cacheControl: 'public, max-age=300',
  };
}

function body(etag: string, value: unknown) {
  return {
    statusCode: 200 as const,
    stream: new Response(JSON.stringify(value)).body,
    headers: new Headers({ etag }),
    blob: metadata(etag),
  };
}

describe('Vercel word-list publication snapshots', () => {
  beforeEach(() => {
    blob.get.mockReset();
    blob.head.mockReset();
  });

  it('keys public reads by the control-plane ETag and retries an overwrite race', async () => {
    blob.head.mockResolvedValueOnce(metadata('etag-1')).mockResolvedValueOnce(metadata('etag-2'));
    blob.get
      .mockResolvedValueOnce(body('etag-2', { revision: 'raced' }))
      .mockResolvedValueOnce(body('etag-2', { revision: 'current' }));

    const store = new VercelWordListPublicationStore('vercel_blob_rw_test');
    await expect(store.readJson('word-lists/manifest.json')).resolves.toMatchObject({
      etag: 'etag-2',
      value: { revision: 'current' },
    });

    expect(blob.head).toHaveBeenCalledTimes(2);
    expect(blob.get).toHaveBeenCalledTimes(2);
    expect(blob.get.mock.calls[0]?.[0]).toContain('__amordle_etag=etag-1');
    expect(blob.get.mock.calls[1]?.[0]).toContain('__amordle_etag=etag-2');
    expect(blob.get.mock.calls[1]?.[1]).toMatchObject({ access: 'public' });
    expect(blob.get.mock.calls[1]?.[1]).not.toHaveProperty('useCache');
  });
});
