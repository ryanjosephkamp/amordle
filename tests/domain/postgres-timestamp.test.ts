import { describe, expect, it } from 'vitest';
import {
  canonicalPostgresInstant,
  postgresTimestamptzSchema,
  sameInstant,
} from '../../src/services/postgres-timestamp';

describe('PostgreSQL timestamp boundary', () => {
  it.each([
    ['2026-07-24T12:00:00Z', '2026-07-24T12:00:00.000Z'],
    ['2026-07-24T12:00:00+00:00', '2026-07-24T12:00:00.000Z'],
    ['2026-07-24T08:00:00-04:00', '2026-07-24T12:00:00.000Z'],
    ['2026-07-24T12:00:00.123456+00:00', '2026-07-24T12:00:00.123456Z'],
    ['2026-07-24T08:00:00.123450-04:00', '2026-07-24T12:00:00.12345Z'],
    ['2026-07-24T12:00:00.100000Z', '2026-07-24T12:00:00.100Z'],
  ])('canonicalizes %s to %s', (wireValue, expected) => {
    expect(canonicalPostgresInstant(wireValue)).toBe(expected);
  });

  it('compares equivalent wire representations as the same instant', () => {
    expect(sameInstant('2026-07-24T12:00:00Z', '2026-07-24T08:00:00-04:00')).toBe(true);
    expect(sameInstant('2026-07-24T12:00:00.123456Z', '2026-07-24T08:00:00.123456-04:00')).toBe(
      true,
    );
    expect(sameInstant('2026-07-24T12:00:00.123456Z', '2026-07-24T12:00:00.123457Z')).toBe(false);
  });

  it.each(['2026-07-24T12:00:00', 'not-a-date', '2026-02-30T12:00:00Z'])(
    'rejects an invalid database timestamp: %s',
    (value) => {
      expect(postgresTimestamptzSchema.safeParse(value).success).toBe(false);
    },
  );
});
