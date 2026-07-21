import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SupabaseAdminVerifier, type AdminVerifier } from './_lib/admin-auth';
import { VercelBlobStore } from './_lib/blob-store';
import { bearerToken, methodNotAllowed, sendJson, type SafeHttpResponse } from './_lib/http';
import { RefreshError, safeRefreshFailure, writeSafeLog } from './_lib/safe-error';
import { readBlobToken } from './_lib/server-env';
import {
  refreshAllWordLists,
  refreshRequestId,
  type RefreshSummary,
} from './_lib/word-list-refresh';

export type AdminRefreshDependencies = {
  verifier: AdminVerifier;
  refresh: () => Promise<RefreshSummary>;
  requestId?: () => string;
  nowMs?: () => number;
};

function defaultDependencies(): AdminRefreshDependencies {
  return {
    verifier: new SupabaseAdminVerifier(),
    refresh: () => {
      const blobToken = readBlobToken();
      if (!blobToken) {
        throw new RefreshError('configuration', 'Refresh storage is unavailable.');
      }
      return refreshAllWordLists({ store: new VercelBlobStore(blobToken) });
    },
  };
}

export async function handleAdminRefresh(
  request: Pick<VercelRequest, 'method' | 'headers'>,
  dependencies?: AdminRefreshDependencies,
): Promise<SafeHttpResponse> {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  const token = bearerToken(request);
  if (!token)
    return {
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
      body: { error: 'Unauthorized.' },
    };

  const deps = dependencies ?? defaultDependencies();
  const verification = await deps.verifier.verify(token);
  if (verification === 'invalid') {
    return {
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
      body: { error: 'Unauthorized.' },
    };
  }
  if (verification === 'non-admin') {
    return { status: 403, headers: { 'Cache-Control': 'no-store' }, body: { error: 'Forbidden.' } };
  }
  if (verification === 'unavailable') {
    return {
      status: 502,
      headers: { 'Cache-Control': 'no-store' },
      body: {
        error: 'Refresh failed.',
        stage: 'configuration',
        detail: 'Refresh service is unavailable.',
      },
    };
  }

  const requestId = (deps.requestId ?? refreshRequestId)();
  const nowMs = deps.nowMs ?? Date.now;
  const startedAt = nowMs();
  try {
    const summary = await deps.refresh();
    writeSafeLog({
      event: 'word-list-refresh',
      requestId,
      status: 'success',
      durationMs: Math.max(0, nowMs() - startedAt),
    });
    return { status: 200, headers: { 'Cache-Control': 'no-store' }, body: summary };
  } catch (error) {
    const failure = safeRefreshFailure(error);
    writeSafeLog({
      event: 'word-list-refresh',
      requestId,
      status: 'failure',
      stage: failure.stage,
      durationMs: Math.max(0, nowMs() - startedAt),
    });
    return { status: 502, headers: { 'Cache-Control': 'no-store' }, body: failure };
  }
}

export default async function handler(
  request: VercelRequest,
  response: VercelResponse,
): Promise<void> {
  sendJson(response, await handleAdminRefresh(request));
}
