import { z } from 'zod';

export type CanonicalInstant = string;

export const postgresTimestamptzSchema = z.iso
  .datetime({ offset: true })
  .transform((value, context): CanonicalInstant => {
    const instant = new Date(value);
    if (!Number.isFinite(instant.valueOf())) {
      context.addIssue({
        code: 'custom',
        message: 'PostgreSQL timestamp must represent a finite instant.',
      });
      return z.NEVER;
    }
    try {
      return instant.toISOString();
    } catch {
      context.addIssue({
        code: 'custom',
        message: 'PostgreSQL timestamp is outside the supported range.',
      });
      return z.NEVER;
    }
  });

export const nullablePostgresTimestamptzSchema = postgresTimestamptzSchema.nullable();

export function canonicalPostgresInstant(value: string): CanonicalInstant {
  return postgresTimestamptzSchema.parse(value);
}

export function sameInstant(left: string, right: string): boolean {
  return canonicalPostgresInstant(left) === canonicalPostgresInstant(right);
}
