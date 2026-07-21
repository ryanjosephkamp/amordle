export type RefreshStage =
  'configuration' | 'source-metadata' | 'fetch' | 'validation' | 'persistence';

export class RefreshError extends Error {
  readonly cause?: unknown;

  constructor(
    readonly stage: RefreshStage,
    readonly safeDetail: string,
    options?: { cause?: unknown },
  ) {
    super(safeDetail);
    if (options?.cause !== undefined) this.cause = options.cause;
    this.name = 'RefreshError';
  }
}

export function safeRefreshFailure(error: unknown): {
  error: string;
  stage: RefreshStage;
  detail: string;
} {
  if (error instanceof RefreshError) {
    return { error: 'Refresh failed.', stage: error.stage, detail: error.safeDetail };
  }
  return {
    error: 'Refresh failed.',
    stage: 'persistence',
    detail: 'The served word list was not changed.',
  };
}

type SafeLog = {
  event: 'word-list-refresh';
  requestId: string;
  status: 'success' | 'failure';
  stage?: RefreshStage;
  durationMs: number;
};

export function writeSafeLog(log: SafeLog): void {
  // Intentionally allowlisted. Do not pass caught errors, URLs, headers, or payloads.
  console.info(JSON.stringify(log));
}
