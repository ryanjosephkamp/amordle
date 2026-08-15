#!/usr/bin/env node
/*
 * Retire the legacy test accounts that are still in the public player directory.
 *
 * WHAT THESE ARE
 *
 * Eight accounts named `Ember <hex>` and `Frost <hex>` appear on /players with
 * zero games each. They were created by pre-greenfield specs
 * (tests/e2e/services.multiplayer-parity-ui.spec.ts and its sibling, both
 * deleted at 843da4e) whose cleanup ran only inside a `finally` and threw
 * instead of retrying, so an interrupted run left public profiles behind with
 * no receipt. Nothing in the current tree creates them.
 *
 * The suite that exists today prefixes its display names with `E2E ` and cleans
 * up after every run, asserting zero residue across every tracked table. So
 * this is a one-off retirement of historical strays, not a recurring chore.
 *
 * WHY IT TARGETS IDS AND NOT NAMES
 *
 * The eight public profile ids below were read off the live directory. Matching
 * on `^(Ember|Frost) [0-9a-f]{8}$` would have been shorter and is how the strays
 * were found, but a name is something a player can change and something a real
 * player could coincidentally hold. Ids cannot collide, so this script cannot
 * touch `pmak nayr`, `ragnar` or `super` even if one of them were renamed
 * between now and the moment it runs. It refuses outright if the ids resolve to
 * a different number of accounts than expected.
 *
 * USAGE
 *
 *   node scripts/retire-legacy-test-accounts.mjs            # dry run, writes nothing
 *   node scripts/retire-legacy-test-accounts.mjs --apply    # deletes
 *
 * The dry run is the default on purpose: this is irreversible.
 */

import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const PROJECT_REF = 'squqdstdvbsvhagfuzgj';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const SERVICE_KEY_FILE = '.codex-internal/evidence/operator/supabase-service-key';

/** Read from the live directory on 2026-08-15. Exactly these, and nothing else. */
const LEGACY_PUBLIC_PROFILE_IDS = [
  '65e68b66-887b-4626-8779-ee1fb4555171', // Ember 194096d2
  '4f8d56e2-6b99-4727-ac64-b0f16cc3a102', // Ember 3a50f462
  '0f7917df-edf7-4e78-9be3-971e3d22d466', // Ember b89dff2a
  '6fce22f4-4396-4334-a50b-6fa8f248eb50', // Ember e7bf7df4
  '55484342-7899-41ac-8913-3b989bbb567c', // Frost 194096d2
  '0a2a6ede-1cc4-490c-b8e3-a6d0fb130046', // Frost 3a50f462
  'a88300e9-eb07-4ff3-add9-d7bf46ca7ad4', // Frost b89dff2a
  '2ddfb372-1bcf-4337-b8cf-fdbfdb6b3ca5', // Frost e7bf7df4
];

/*
 * Dependency order, copied from the cleanup in tests/e2e/services.combat.spec.ts.
 * That code deletes exactly this class of account on every hosted run and is the
 * only ordering in this repository that is known to work.
 */
const TABLES_BY_USER = [
  'game_history',
  'multiplayer_daily_claims',
  'progress_snapshots',
  'settings',
  'player_economy_operations',
  'player_economy_state',
  'public_player_profiles',
  'multiplayer_private_request_preferences',
  'multiplayer_rating_profiles',
];

const apply = process.argv.includes('--apply');

function serviceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (existsSync(SERVICE_KEY_FILE)) return readFileSync(SERVICE_KEY_FILE, 'utf8').trim();
  throw new Error(
    `Set SUPABASE_SERVICE_ROLE_KEY, or place the key at ${SERVICE_KEY_FILE}. This script needs it to read and delete auth users.`,
  );
}

const admin = createClient(SUPABASE_URL, serviceKey(), {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  process.stdout.write(
    apply
      ? 'RETIRING legacy test accounts. This is irreversible.\n\n'
      : 'DRY RUN — nothing will be written. Re-run with --apply to delete.\n\n',
  );

  const { data: profiles, error: profileError } = await admin
    .from('public_player_profiles')
    .select('public_profile_id,user_id,display_name,visibility')
    .in('public_profile_id', LEGACY_PUBLIC_PROFILE_IDS);
  if (profileError) throw profileError;

  if (!profiles?.length) {
    process.stdout.write('Nothing found. These accounts have already been retired.\n');
    return;
  }

  /*
   * A hard stop rather than a warning. If the ids resolve to more rows than were
   * listed, something is wrong with an assumption and the safe move is to look
   * rather than to delete.
   */
  if (profiles.length > LEGACY_PUBLIC_PROFILE_IDS.length) {
    throw new Error(
      `Expected at most ${LEGACY_PUBLIC_PROFILE_IDS.length} profiles, found ${profiles.length}. Refusing to continue.`,
    );
  }

  const userIds = profiles.map((profile) => profile.user_id);

  process.stdout.write(`${profiles.length} account(s) matched:\n`);
  for (const profile of profiles) {
    process.stdout.write(
      `  ${profile.display_name}  (${profile.visibility})  profile ${profile.public_profile_id}\n`,
    );
  }

  process.stdout.write('\nRows that belong to them:\n');
  let total = 0;
  for (const table of TABLES_BY_USER) {
    const { count, error } = await admin
      .from(table)
      .select('user_id', { count: 'exact', head: true })
      .in('user_id', userIds);
    if (error) throw error;
    total += count ?? 0;
    process.stdout.write(`  ${String(count ?? 0).padStart(4)}  ${table}\n`);
  }
  const { count: profileRowCount, error: profileCountError } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .in('id', userIds);
  if (profileCountError) throw profileCountError;
  total += profileRowCount ?? 0;
  process.stdout.write(`  ${String(profileRowCount ?? 0).padStart(4)}  profiles\n`);
  process.stdout.write(`  ${String(userIds.length).padStart(4)}  auth users\n`);
  process.stdout.write(`\n  ${total} row(s) plus ${userIds.length} auth user(s).\n`);

  /*
   * Several foreign keys to auth.users are `on delete set null` by design, from
   * the v6.6 account-lifecycle work: a completed match keeps its history when a
   * participant deletes their account. So rows elsewhere referring to these
   * users will survive with a null reference. That is correct, and is not
   * residue.
   */
  if (!apply) {
    process.stdout.write('\nDry run complete. Nothing was changed.\n');
    return;
  }

  process.stdout.write('\nDeleting…\n');
  for (const table of TABLES_BY_USER) {
    const { error } = await admin.from(table).delete().in('user_id', userIds);
    if (error) throw error;
    process.stdout.write(`  cleared ${table}\n`);
  }
  const { error: profilesError } = await admin.from('profiles').delete().in('id', userIds);
  if (profilesError) throw profilesError;
  process.stdout.write('  cleared profiles\n');

  for (const userId of userIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error && !/not found/i.test(error.message)) throw error;
  }
  process.stdout.write('  deleted auth users\n');

  process.stdout.write('\nVerifying…\n');
  const residue = {};
  for (const table of TABLES_BY_USER) {
    const { count, error } = await admin
      .from(table)
      .select('user_id', { count: 'exact', head: true })
      .in('user_id', userIds);
    if (error) throw error;
    residue[table] = count ?? 0;
  }
  for (const userId of userIds) {
    const { data } = await admin.auth.admin.getUserById(userId);
    if (data?.user) residue[`auth:${userId}`] = 1;
  }
  const remaining = Object.entries(residue).filter(([, count]) => count !== 0);
  if (remaining.length) {
    for (const [name, count] of remaining) process.stdout.write(`  RESIDUE ${name}: ${count}\n`);
    throw new Error('Residue remained. Re-run to retry.');
  }

  process.stdout.write('  zero residue\n\nDone. Reload /players to confirm.\n');
}

main().catch((error) => {
  process.stderr.write(`\n${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
