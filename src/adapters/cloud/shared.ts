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
  return `${prefix}:${crypto.randomUUID()}`;
}
