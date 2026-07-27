'use client';

import type { PostgrestError } from '@supabase/supabase-js';
import type { z } from 'zod';

export class ServiceError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export function throwServiceError(error: PostgrestError | null): never {
  throw new ServiceError(
    error?.message ?? 'The service did not return data.',
    error?.code ?? 'SERVICE',
  );
}

export function parseServiceResult<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ServiceError('The service returned an unsupported response.', 'INVALID_RESPONSE');
  }
  return parsed.data;
}

export function operationId(prefix: string): string {
  return `${prefix}:${crypto.randomUUID()}`;
}
