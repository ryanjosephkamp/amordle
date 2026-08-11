'use client';

import type { PostgrestError } from '@supabase/supabase-js';
import type { z } from 'zod';

export class ServiceError extends Error {
  constructor(
    message: string,
    readonly code: string,
    /*
     * v8.1. The authority's `detail` clause, carried through rather than discarded.
     *
     * Every RPC in this project raises with both a message and a detail — `COMBAT_LIMIT`
     * alongside `COMBAT_LIMIT_OVERALL`, say — and the detail is the half that says which
     * limit was hit. Dropping it left the client able to report only that something went
     * wrong, which is how a full account came to be told "matchmaking needs attention".
     */
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export function throwServiceError(error: PostgrestError | null): never {
  throw new ServiceError(
    error?.message ?? 'The service did not return data.',
    error?.code ?? 'SERVICE',
    error?.details ?? undefined,
  );
}

export function parseServiceResult<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ServiceError('The service returned an unsupported response.', 'INVALID_RESPONSE');
  }
  return parsed.data;
}

export interface ParsedServiceList<T> {
  items: T[];
  skipped: number;
}

export function parseServiceList<T>(schema: z.ZodType<T>, value: unknown): ParsedServiceList<T> {
  if (!Array.isArray(value)) {
    throw new ServiceError('The service returned an unsupported response.', 'INVALID_RESPONSE');
  }
  const items: T[] = [];
  let skipped = 0;
  for (const candidate of value) {
    const parsed = schema.safeParse(candidate);
    if (parsed.success) items.push(parsed.data);
    else skipped += 1;
  }
  return { items, skipped };
}

export function operationId(prefix: string): string {
  const testRunId =
    typeof window === 'undefined'
      ? null
      : (
          window as typeof window & {
            __AMORDLE_E2E_RUN_ID__?: unknown;
          }
        ).__AMORDLE_E2E_RUN_ID__;
  const correlationPrefix =
    typeof testRunId === 'string' && /^e2e_[A-Za-z0-9_]{16,120}$/.test(testRunId)
      ? `${testRunId}:`
      : '';
  return `${correlationPrefix}${prefix}:${crypto.randomUUID()}`;
}
