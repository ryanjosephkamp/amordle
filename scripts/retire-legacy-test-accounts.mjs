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
 * Dependency order, based on the cleanup in tests/e2e/services.combat.spec.ts —
 * with one addition that cleanup did not need.
 *
 * `multiplayer_private_match_requests` points at `public_player_profiles`
 * (public_profile_id) with ON DELETE RESTRICT, while pointing at `auth.users`
 * with ON DELETE CASCADE. So a leftover private challenge blocks the profile
 * delete outright, and the database is right to refuse: the request row names
 * two profiles and would be left describing a player that no longer exists.
 *
 * The E2E suite never hit this because it deletes its private requests by run
 * id, in a separate earlier pass. Deleting by user, as this script does, has to
 * clear them explicitly and first. Found the hard way — the first --apply run
 * failed here.
 *
 * Each entry is [table, columns[]]: a row is ours if ANY of those columns names
 * one of our users.
 */
const TABLES_BY_USER = [
  ['multiplayer_private_match_requests', ['requester_user_id', 'opponent_user_id']],
  ['game_history', ['user_id']],
  ['multiplayer_daily_claims', ['user_id']],
  ['progress_snapshots', ['user_id']],
  ['settings', ['user_id']],
  ['player_economy_operations', ['user_id']],
  ['player_economy_state', ['user_id']],
  ['public_player_profiles', ['user_id']],
  ['multiplayer_private_request_preferences', ['user_id']],
  ['multiplayer_rating_profiles', ['user_id']],
];

/*
 * The legacy harness minted every account at `@example.com`, which is IANA
 * reserved and can never belong to a person, under a run-scoped local part.
 *
 * This is the second identifier this script needs, and it exists because the
 * profile rows are now gone: the first --apply run deleted them and then failed
 * on the auth users, leaving accounts that nothing in `public` points at any
 * more. Keying only on profile ids would make the script report "already
 * retired" and quietly skip the half that is left.
 *
 * It is deliberately narrow. `ryanjosephkampsapps0@gmail.com` is a real
 * account of the owner's that also has no public profile, so "an auth user with
 * no profile" would have been the wrong rule and would have deleted it.
 */
const LEGACY_EMAIL = /^amordle\.e2e_[0-9a-z]+_[0-9a-z]+\.[a-z]+@example\.com$/i;

/*
 * Supabase hands back several error shapes: plain objects from PostgREST, and
 * Error subclasses from GoTrue whose fields are non-enumerable. The first
 * failed run printed "[object Object]" and the second printed "{}", because
 * neither String() nor JSON.stringify() reaches either shape. Read every own
 * property by name instead, enumerable or not.
 */
function describeError(error) {
  if (error === null || error === undefined) return 'unknown error';
  if (typeof error !== 'object') return String(error);
  const fields = {};
  for (const key of Object.getOwnPropertyNames(error)) {
    if (key === 'stack') continue;
    const value = error[key];
    if (value === undefined || value === null || typeof value === 'function') continue;
    fields[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
  const name = error.name && error.name !== 'Error' ? `${error.name}: ` : '';
  const rendered = Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .join(' · ');
  return `${name}${rendered || '(no readable fields)'}`;
}

function fail(context, error) {
  throw new Error(`${context}: ${describeError(error)}`);
}

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
  if (profileError) fail('reading public_player_profiles', profileError);

  /*
   * A hard stop rather than a warning. If the ids resolve to more rows than were
   * listed, something is wrong with an assumption and the safe move is to look
   * rather than to delete.
   */
  if ((profiles?.length ?? 0) > LEGACY_PUBLIC_PROFILE_IDS.length) {
    throw new Error(
      `Expected at most ${LEGACY_PUBLIC_PROFILE_IDS.length} profiles, found ${profiles.length}. Refusing to continue.`,
    );
  }

  const { data: listed, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listError) fail('listing auth users', listError);
  const legacyUsers = (listed?.users ?? []).filter((user) => LEGACY_EMAIL.test(user.email ?? ''));

  const userIds = [
    ...new Set([...(profiles ?? []).map((p) => p.user_id), ...legacyUsers.map((u) => u.id)]),
  ];

  if (!userIds.length) {
    process.stdout.write('Nothing found. These accounts have already been retired.\n');
    return;
  }

  /*
   * Last gate before anything is written. Every targeted account must either
   * still carry one of the listed profile ids or hold a reserved-domain address
   * from the old harness. Anything else means a rule has drifted, and this stops
   * rather than deleting on a maybe.
   */
  const profileUserIds = new Set((profiles ?? []).map((p) => p.user_id));
  const legacyUserIds = new Set(legacyUsers.map((u) => u.id));
  const unaccounted = userIds.filter((id) => !profileUserIds.has(id) && !legacyUserIds.has(id));
  if (unaccounted.length) {
    throw new Error(`Refusing to continue: ${unaccounted.join(', ')} matched neither rule.`);
  }

  process.stdout.write(`${userIds.length} account(s) matched:\n`);
  for (const profile of profiles ?? []) {
    process.stdout.write(
      `  ${profile.display_name}  (${profile.visibility})  profile ${profile.public_profile_id}\n`,
    );
  }
  for (const user of legacyUsers) {
    const note = profileUserIds.has(user.id) ? '' : '  [no profile row — auth only]';
    process.stdout.write(`  ${user.email}${note}\n`);
  }

  process.stdout.write('\nRows that belong to them:\n');
  let total = 0;
  for (const [table, columns] of TABLES_BY_USER) {
    let subtotal = 0;
    for (const column of columns) {
      const { count, error } = await admin
        .from(table)
        .select(column, { count: 'exact', head: true })
        .in(column, userIds);
      if (error) fail(`counting ${table}.${column}`, error);
      subtotal += count ?? 0;
    }
    total += subtotal;
    process.stdout.write(`  ${String(subtotal).padStart(4)}  ${table}\n`);
  }
  const { count: profileRowCount, error: profileCountError } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .in('id', userIds);
  if (profileCountError) fail('counting profiles', profileCountError);
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
  for (const [table, columns] of TABLES_BY_USER) {
    for (const column of columns) {
      const { error } = await admin.from(table).delete().in(column, userIds);
      if (error) fail(`deleting from ${table} by ${column}`, error);
    }
    process.stdout.write(`  cleared ${table}\n`);
  }
  const { error: profilesError } = await admin.from('profiles').delete().in('id', userIds);
  if (profilesError) fail('deleting from profiles', profilesError);
  process.stdout.write('  cleared profiles\n');

  /*
   * Reported one at a time and collected, rather than thrown on the first
   * failure. The run that stopped here had already emptied every table, so
   * aborting on user one left the other nine untouched for no reason — and each
   * of these deletions is independent of the others.
   */
  const authFailures = [];
  for (const userId of userIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (!error) {
      process.stdout.write(`  deleted auth user ${userId}\n`);
      continue;
    }
    const described = describeError(error);
    if (/not found/i.test(described)) {
      process.stdout.write(`  auth user ${userId} was already gone\n`);
      continue;
    }
    process.stdout.write(`  FAILED  ${userId}: ${described}\n`);
    authFailures.push(userId);
  }

  process.stdout.write('\nVerifying…\n');
  const residue = {};
  for (const [table, columns] of TABLES_BY_USER) {
    let subtotal = 0;
    for (const column of columns) {
      const { count, error } = await admin
        .from(table)
        .select(column, { count: 'exact', head: true })
        .in(column, userIds);
      if (error) fail(`verifying ${table}.${column}`, error);
      subtotal += count ?? 0;
    }
    residue[table] = subtotal;
  }
  for (const userId of userIds) {
    const { data } = await admin.auth.admin.getUserById(userId);
    if (data?.user) residue[`auth:${userId}`] = 1;
  }
  const remaining = Object.entries(residue).filter(([, count]) => count !== 0);
  if (remaining.length) {
    for (const [name, count] of remaining) process.stdout.write(`  RESIDUE ${name}: ${count}\n`);
    /*
     * Public tables empty but auth users left is the state after the run that
     * failed here: nobody can see these accounts, since every surface reads
     * `public`, but they are still occupying the auth table. Say which of the
     * two situations this is rather than reporting an undifferentiated failure.
     */
    const tableResidue = remaining.filter(([name]) => !name.startsWith('auth:'));
    if (!tableResidue.length) {
      process.stdout.write(
        `\n  Every public table is clean, so nothing is visible to players.\n` +
          `  ${authFailures.length} auth user(s) could not be deleted; the reason is printed above.\n`,
      );
    }
    throw new Error('Residue remained. Re-run to retry.');
  }

  process.stdout.write('  zero residue\n\nDone. Reload /players to confirm.\n');
}

main().catch((error) => {
  process.stderr.write(`\n${describeError(error)}\n`);
  process.exitCode = 1;
});
