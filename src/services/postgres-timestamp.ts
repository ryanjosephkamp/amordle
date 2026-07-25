import { z } from 'zod';

export type CanonicalInstant = string;

function canonicalFraction(value: string): string {
  const fraction = /^.+T\d{2}:\d{2}:\d{2}(?:\.(\d+))?(?:Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1];
  const significant = fraction?.replace(/0+$/, '') ?? '';
  return significant.length <= 3 ? significant.padEnd(3, '0') : significant;
}

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
      const utc = instant.toISOString();
      return `${utc.slice(0, 19)}.${canonicalFraction(value)}Z`;
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
