import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ratingBucketLabel,
  ratingStorageBucketToAppBucket,
  resolveRatingLane,
} from '@/domain/profile';

/**
 * ANNOT-06. The rating authority is the database, so these vectors read the storage
 * buckets straight out of the migration's own check constraint. If a future migration
 * adds a lane, this fails until the label vocabulary knows about it.
 */
const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260724222000_amordle_authoritative_combat_v2.sql',
);

function ratingProfileStorageBuckets(): string[] {
  const sql = readFileSync(migrationPath, 'utf8');
  const marker = 'multiplayer_rating_profiles_bucket_check';
  const start = sql.indexOf(`add constraint ${marker}`);
  expect(start, 'rating profile bucket constraint present').toBeGreaterThan(-1);
  const block = sql.slice(start, sql.indexOf(']));', start));
  return [...block.matchAll(/'([a-z0-9:]+)'::text/g)].map((match) => match[1]!);
}

describe('ANNOT-06 ranked rating lane identity', () => {
  it('maps every durable storage bucket to a distinct, specific label', () => {
    const storageBuckets = ratingProfileStorageBuckets();
    // The `live:*` transport is not an async rating lane and never reaches Stats.
    const asyncBuckets = storageBuckets.filter((bucket) => bucket.startsWith('async:'));
    expect(asyncBuckets.length).toBeGreaterThanOrEqual(10);

    const labels = new Map<string, string>();
    for (const bucket of asyncBuckets) {
      const lane = resolveRatingLane(bucket);
      expect(lane.appBucket, `${bucket} resolves to an app bucket`).not.toBeNull();
      // The exact defect: every real lane collapsing into one generic label.
      expect(lane.label, `${bucket} is not the generic fallback`).not.toMatch(/unrecognized/);
      expect(lane.scope, `${bucket} scope`).not.toBe('unknown');
      expect(lane.mode, `${bucket} mode`).not.toBe('unknown');
      expect(lane.clock, `${bucket} clock`).not.toBe('unknown');
      labels.set(bucket, lane.label);
    }

    // v2 and pre-v2 keys intentionally share a lane label; the six current lanes must
    // still be distinguishable from one another.
    const currentLanes = asyncBuckets.filter(
      (bucket) => bucket.endsWith(':amordle:v2') || bucket.endsWith(':daily:v1'),
    );
    expect(currentLanes).toHaveLength(6);
    expect(new Set(currentLanes.map((bucket) => labels.get(bucket))).size).toBe(6);
  });

  it('distinguishes scope, mode, and clock for each current lane', () => {
    expect(resolveRatingLane('async:og:amordle:v2')).toMatchObject({
      appBucket: 'multiplayer:og',
      scope: 'practice',
      mode: 'og',
      clock: 'untimed',
    });
    expect(resolveRatingLane('async:go:timed:amordle:v2')).toMatchObject({
      appBucket: 'multiplayer:go:timed:v1',
      scope: 'practice',
      mode: 'go',
      clock: '5-minute',
    });
    expect(resolveRatingLane('async:og:daily:v1')).toMatchObject({
      appBucket: 'multiplayer:og:daily:v1',
      scope: 'daily',
      mode: 'og',
      clock: 'untimed',
    });
  });

  it('accepts app buckets as well as storage buckets', () => {
    expect(ratingBucketLabel('multiplayer:og')).toBe('Ranked Practice · OG');
    expect(ratingBucketLabel('multiplayer:go:daily:v1')).toBe('Ranked Daily · GO');
  });

  it('reports an unknown lane truthfully instead of guessing', () => {
    const lane = resolveRatingLane('async:xx:future:v9');
    expect(lane.appBucket).toBeNull();
    expect(lane.label).toContain('unrecognized lane');
    // The raw key is surfaced so the gap is diagnosable rather than silent.
    expect(lane.label).toContain('async:xx:future:v9');
  });

  it('keeps the storage map aligned with the migration authority', () => {
    for (const bucket of ratingProfileStorageBuckets()) {
      if (!bucket.startsWith('async:')) continue;
      expect(
        Object.hasOwn(ratingStorageBucketToAppBucket, bucket),
        `${bucket} is missing from the storage-to-app map`,
      ).toBe(true);
    }
  });
});
