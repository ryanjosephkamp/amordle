import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  accountLifecycleReceiptSchema,
  dangerChallengeSchema,
} from '../../src/domain/account-lifecycle';

const migration = readFileSync(
  'supabase/migrations/20260802193000_amordle_account_lifecycle_v1.sql',
  'utf8',
);
const edgeFunction = readFileSync('supabase/functions/account-lifecycle-v1/index.ts', 'utf8');
const edgeFunctionConfig = readFileSync(
  'supabase/functions/account-lifecycle-v1/deno.json',
  'utf8',
);
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('v6.6 account lifecycle authority packet', () => {
  it('accepts the RFC 3339 UTC offsets emitted by PostgreSQL timestamptz values', () => {
    expect(
      dangerChallengeSchema.parse({
        action: 'delete-solo-history',
        confirmationToken: 'x'.repeat(32),
        expiresAt: '2026-08-03T00:55:39.247033+00:00',
      }).expiresAt,
    ).toBe('2026-08-03T00:55:39.247033+00:00');
    expect(
      accountLifecycleReceiptSchema.parse({
        action: 'restart-competitive-profile',
        operationId: '2d5adb96-08e5-490f-b2e2-74d26332dd15',
        completedAt: '2026-08-03T00:56:01.000001+00:00',
        signedOut: false,
      }).completedAt,
    ).toBe('2026-08-03T00:56:01.000001+00:00');
  });

  it('locks the reviewed migration and Edge Function artifacts to exact checksums', () => {
    expect(sha256(migration)).toBe(
      'caad339a608a0a23f5589a25bed6a1f2d415d033e04db707fce214687192c9f3',
    );
    expect(sha256(edgeFunction)).toBe(
      'fb961d9e60d39008c50492561a8fa2c04fde12e49264c0a534f3522709cb5dc1',
    );
    expect(sha256(edgeFunctionConfig)).toBe(
      'fc9fc38c21441b7f67a91280ed28b8ca4ad67fc69d713db441f5c0fd9a6abf9f',
    );
  });

  it('keeps challenges private, hashed, account-bound, short-lived, and service-only', () => {
    for (const fragment of [
      'brrrdle_private.amordle_account_lifecycle_challenges',
      "token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$')",
      "v_expires_at timestamptz := now() + interval '5 minutes'",
      "pg_catalog.hashtextextended('amordle-account:' || p_user_id::text, 0)",
      "set status = 'used', used_at = v_completed_at",
      'grant execute on function public.service_confirm_account_lifecycle_v1(uuid, text, text)',
      'to service_role',
    ]) {
      expect(migration).toContain(fragment);
    }
    expect(migration).toContain(
      'revoke all on table brrrdle_private.amordle_account_lifecycle_challenges',
    );
    expect(migration).toContain('from public, anon, authenticated');
    expect(migration).not.toContain(
      'grant execute on function public.service_confirm_account_lifecycle_v1(uuid, text, text)\n  to authenticated',
    );
    expect(migration).toContain("v_challenge.status = 'processing'");
    expect(migration).toContain("challenge.service_result <> '{}'::jsonb");
    expect(migration).toContain("challenge.status in ('processing', 'expired', 'revoked')");
  });

  it('preserves economy during Solo reset and refuses destructive competitive actions in active games', () => {
    const soloStart = migration.indexOf(
      'create or replace function public.service_delete_solo_account_data_v1',
    );
    const soloEnd = migration.indexOf(
      'create or replace function public.service_restart_competitive_profile_v1',
    );
    const soloReset = migration.slice(soloStart, soloEnd);
    expect(soloReset).toContain("history.entry ->> 'kind' in ('solo-practice', 'solo-daily')");
    expect(soloReset).toContain("'{dailyStreak}', '0'::jsonb");
    expect(soloReset).not.toContain('player_economy_state');
    expect(soloReset).not.toContain('player_economy_operations');

    expect(migration).toContain('if public.service_account_has_active_combat_v1(p_user_id) then');
    for (const bucket of [
      'async:og:amordle:v2',
      'async:go:amordle:v2',
      'async:og:timed:amordle:v2',
      'async:go:timed:amordle:v2',
      'async:og:daily:v1',
      'async:go:daily:v1',
    ]) {
      expect(migration).toContain(`'${bucket}'`);
    }
  });

  it('detaches settled participants while deleting only ephemeral queue claims', () => {
    for (const fragment of [
      "set user_id = null, player_label = 'Deleted player'",
      'on delete set null',
      'multiplayer_player_results_match_user_key_v2 unique (match_result_id, user_id)',
      'live_match_participants_match_user_key_v2 unique (match_id, user_id)',
      "where authority.status in ('completed', 'cancelled')",
      "where match_row.phase in ('finished', 'aborted', 'expired')",
      'delete from brrrdle_private.amordle_ranked_practice_reservations reservation',
      'delete from public.multiplayer_matchmaking_queue queue_row',
    ]) {
      expect(migration).toContain(fragment);
    }
  });

  it('verifies the password and claims database work before Storage or Auth deletion', () => {
    for (const fragment of [
      'const maximumBodyBytes = 4096',
      'verifier.auth.getUser(accessToken)',
      'passwordVerifier.auth.signInWithPassword',
      'crypto.getRandomValues(new Uint8Array(32))',
      "crypto.subtle.digest('SHA-256'",
      "service.rpc('service_prepare_account_lifecycle_v1'",
      "service.rpc('service_confirm_account_lifecycle_v1'",
      'service.auth.admin.deleteUser(user.id)',
    ]) {
      expect(edgeFunction).toContain(fragment);
    }

    const confirmIndex = edgeFunction.indexOf("service.rpc('service_confirm_account_lifecycle_v1'");
    const storageIndex = edgeFunction.indexOf('.storage.from(avatarBucket).remove([path])');
    const authDeleteIndex = edgeFunction.indexOf('service.auth.admin.deleteUser(user.id)');
    expect(confirmIndex).toBeGreaterThan(-1);
    expect(storageIndex).toBeGreaterThan(confirmIndex);
    expect(authDeleteIndex).toBeGreaterThan(storageIndex);
    expect(edgeFunction).not.toContain('console.');
  });
});
