import type { ServiceFailure, ServiceFailureCode } from '../types/services';

const RETRYABLE_CODES = new Set(['network', 'conflict']);

export class ServiceError extends Error {
  readonly failure: ServiceFailure;

  constructor(
    code: ServiceFailureCode,
    message: string,
    options?: { cause?: unknown; retryable?: boolean },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'ServiceError';
    this.failure = {
      code,
      message,
      retryable: options?.retryable ?? RETRYABLE_CODES.has(code),
    };
  }
}

export function throwIfServiceError(
  error: { message: string; code?: string | undefined } | null,
  operation: string,
): void {
  if (!error) return;
  const conflict = error.code === '40001' || error.code === '409' || error.code === 'PGRST116';
  throw new ServiceError(conflict ? 'conflict' : 'persistence', `${operation} failed.`, {
    cause: error,
    retryable: conflict,
  });
}
