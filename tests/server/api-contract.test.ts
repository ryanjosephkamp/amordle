import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleAdminRefresh } from '../../api/admin-refresh';
import type { AdminVerifier } from '../../api/_lib/admin-auth';
import type { WordListStore } from '../../api/_lib/blob-store';
import { RefreshError } from '../../api/_lib/safe-error';
import type { RefreshSummary } from '../../api/_lib/word-list-refresh';
import { handleCronRefresh } from '../../api/cron/refresh-word-lists';
import { handleManifest } from '../../api/word-lists/manifest';
import type { WordListManifest } from '../../src/types/services';

const success: RefreshSummary = {
  revision: 'abcdef0123456789',
  generatedAt: '2026-07-21T00:00:00.000Z',
  fetchedAt: '2026-07-21T01:00:00.000Z',
  counts: Array.from({ length: 34 }, (_, index) => ({
    length: index + 2,
    answers: 1,
    validGuesses: 2,
  })),
  persistence: 'manifest-published',
};

const request = (method: string, token?: string) => ({
  method,
  headers: token ? { authorization: `Bearer ${token}` } : {},
});

function verifier(result: Awaited<ReturnType<AdminVerifier['verify']>>): AdminVerifier {
  return { verify: vi.fn().mockResolvedValue(result) };
}

afterEach(() => vi.restoreAllMocks());

describe('Admin refresh API', () => {
  it('enforces method and bearer authorization before refreshing', async () => {
    const refresh = vi.fn().mockResolvedValue(success);
    expect(
      (await handleAdminRefresh(request('GET'), { verifier: verifier('admin'), refresh })).status,
    ).toBe(405);
    expect(
      (await handleAdminRefresh(request('POST'), { verifier: verifier('admin'), refresh })).status,
    ).toBe(401);
    expect(refresh).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid', 401],
    ['non-admin', 403],
    ['unavailable', 502],
  ] as const)('maps %s verification to %s', async (verification, status) => {
    const refresh = vi.fn().mockResolvedValue(success);
    expect(
      (
        await handleAdminRefresh(request('POST', 'opaque-token'), {
          verifier: verifier(verification),
          refresh,
        })
      ).status,
    ).toBe(status);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('returns a bounded success without echoing the bearer', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const response = await handleAdminRefresh(request('POST', 'top-secret'), {
      verifier: verifier('admin'),
      refresh: vi.fn().mockResolvedValue(success),
      requestId: () => 'safe-request-id',
      nowMs: () => 100,
    });
    expect(response.status).toBe(200);
    expect(JSON.stringify(response)).not.toContain('top-secret');
  });

  it('returns a safe staged 502 without raw error detail', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const response = await handleAdminRefresh(request('POST', 'opaque-token'), {
      verifier: verifier('admin'),
      refresh: vi
        .fn()
        .mockRejectedValue(new RefreshError('validation', 'Length 8 failed normalization.')),
    });
    expect(response).toMatchObject({
      status: 502,
      body: {
        error: 'Refresh failed.',
        stage: 'validation',
        detail: 'Length 8 failed normalization.',
      },
    });
  });
});

describe('cron refresh API', () => {
  it('uses GET and exact bearer authorization', async () => {
    const refresh = vi.fn().mockResolvedValue(success);
    expect(
      (await handleCronRefresh(request('POST'), { secret: 'correct-secret', refresh })).status,
    ).toBe(405);
    expect(
      (
        await handleCronRefresh(request('GET', 'wrong-secret'), {
          secret: 'correct-secret',
          refresh,
        })
      ).status,
    ).toBe(401);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('runs the authorized refresh', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const response = await handleCronRefresh(request('GET', 'correct-secret'), {
      secret: 'correct-secret',
      refresh: vi.fn().mockResolvedValue(success),
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual(success);
  });
});

function manifest(): WordListManifest {
  return {
    revision: 'abcdef0123456789',
    generatedAt: '2026-07-21T00:00:00.000Z',
    fetchedAt: '2026-07-21T01:00:00.000Z',
    source: {
      datasetId: 'ryanjosephkamp/english-openlist',
      pathPrefix: 'latest/brrrdle',
    },
    entries: Array.from({ length: 34 }, (_, index) => ({
      length: index + 2,
      url: `https://example.test/word-lists/abcdef0123456789/words_length_${index + 2}.json`,
      answers: 1,
      validGuesses: 2,
      status: 'served',
    })),
  };
}

describe('public manifest API', () => {
  it('returns a cacheable null fallback when storage is unconfigured', async () => {
    const response = await handleManifest({ method: 'GET' }, { store: null });
    expect(response).toMatchObject({ status: 200, body: { manifest: null } });
    expect(response.headers?.['Cache-Control']).toContain('s-maxage=300');
  });

  it('returns only a validated public manifest', async () => {
    const store: WordListStore = { put: vi.fn(), readJson: vi.fn().mockResolvedValue(manifest()) };
    const response = await handleManifest({ method: 'GET' }, { store });
    expect(response).toMatchObject({
      status: 200,
      body: { manifest: { revision: 'abcdef0123456789' } },
    });
  });

  it('maps storage and schema failures to 502', async () => {
    const invalid: WordListStore = {
      put: vi.fn(),
      readJson: vi.fn().mockResolvedValue({ secret: 'no' }),
    };
    const failed: WordListStore = {
      put: vi.fn(),
      readJson: vi.fn().mockRejectedValue(new Error('raw token')),
    };
    expect((await handleManifest({ method: 'GET' }, { store: invalid })).status).toBe(502);
    const response = await handleManifest({ method: 'GET' }, { store: failed });
    expect(response.status).toBe(502);
    expect(JSON.stringify(response)).not.toContain('raw token');
  });
});
