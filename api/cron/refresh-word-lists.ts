import { timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { VercelBlobStore } from '../_lib/blob-store.js';
import { bearerToken, methodNotAllowed, sendJson, type SafeHttpResponse } from '../_lib/http.js';
import { RefreshError, safeRefreshFailure, writeSafeLog } from '../_lib/safe-error.js';
import { readBlobToken, readCronSecret } from '../_lib/server-env.js';
import {
  refreshAllWordLists,
  refreshRequestId,
  type RefreshSummary,
} from '../_lib/word-list-refresh.js';

export type CronRefreshDependencies = {
  secret: string | null;
  refresh: () => Promise<RefreshSummary>;
  requestId?: () => string;
  nowMs?: () => number;
};

function equalSecret(received: string, expected: string): boolean {
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function defaultDependencies(): CronRefreshDependencies {
  return {
    secret: readCronSecret(),
    refresh: () => {
      const blobToken = readBlobToken();
      if (!blobToken) throw new RefreshError('configuration', 'Refresh storage is unavailable.');
      return refreshAllWordLists({ store: new VercelBlobStore(blobToken) });
    },
  };
}

export async function handleCronRefresh(
  request: Pick<VercelRequest, 'method' | 'headers'>,
  dependencies?: CronRefreshDependencies,
): Promise<SafeHttpResponse> {
  if (request.method !== 'GET') return methodNotAllowed('GET');
  const deps = dependencies ?? defaultDependencies();
  const token = bearerToken(request);
  if (!deps?.secret || !token || !equalSecret(token, deps.secret)) {
    return {
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
      body: { error: 'Unauthorized.' },
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
  sendJson(response, await handleCronRefresh(request));
}
