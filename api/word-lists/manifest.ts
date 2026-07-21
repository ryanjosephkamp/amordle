import type { VercelRequest, VercelResponse } from '@vercel/node';
import { wordListManifestSchema } from '../../src/services/manifest-service';
import { VercelBlobStore, type WordListStore } from '../_lib/blob-store';
import { methodNotAllowed, sendJson, type SafeHttpResponse } from '../_lib/http';
import { readBlobToken } from '../_lib/server-env';

const FALLBACK_NOTE =
  'Remote word-list storage is not configured; bundled word data remains available.';
const CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600';

export type ManifestDependencies = { store: WordListStore | null };

function defaultDependencies(): ManifestDependencies {
  const token = readBlobToken();
  return { store: token ? new VercelBlobStore(token) : null };
}

export async function handleManifest(
  request: Pick<VercelRequest, 'method'>,
  dependencies: ManifestDependencies = defaultDependencies(),
): Promise<SafeHttpResponse> {
  if (request.method !== 'GET') return methodNotAllowed('GET');
  if (!dependencies.store) {
    return {
      status: 200,
      headers: { 'Cache-Control': CACHE_CONTROL },
      body: { manifest: null, note: FALLBACK_NOTE },
    };
  }
  try {
    const raw = await dependencies.store.readJson('word-lists/manifest.json');
    if (raw === null) {
      return {
        status: 200,
        headers: { 'Cache-Control': CACHE_CONTROL },
        body: { manifest: null, note: FALLBACK_NOTE },
      };
    }
    const parsed = wordListManifestSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        status: 502,
        headers: { 'Cache-Control': 'no-store' },
        body: { error: 'Stored word-list metadata was invalid.' },
      };
    }
    return {
      status: 200,
      headers: { 'Cache-Control': CACHE_CONTROL },
      body: { manifest: parsed.data },
    };
  } catch {
    return {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
      body: { error: 'Stored word-list metadata could not be read.' },
    };
  }
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  sendJson(response, await handleManifest(request));
}
