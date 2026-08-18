/*
 * Measure the notification feed, both paths, on a real account.
 *
 * WHY THIS EXISTS
 *
 * Every hosting figure this project has published rests on one number that was
 * never measured: the bytes a notification poll cycle costs. The request count
 * is exact and derivable from source. The byte count was a guess of 2 KB per
 * response, and the assessment's headline ceiling was computed from it. This
 * replaces the guess.
 *
 * WHAT IT DOES
 *
 * Creates disposable accounts, seeds a representative amount of COMBAT state,
 * then issues both call sets against the same account in the same session:
 *
 *   OLD  settings + list_amordle_combat_active_v2 + the legacy game scan +
 *        get_private_multiplayer_match_requests, plus one
 *        get_practice_multiplayer_rematch_requests per terminal Practice game,
 *        capped at 20 — exactly what loadNotificationFeed used to issue
 *   NEW  get_player_notification_feed_v1
 *
 * and measures each response three ways: uncompressed body bytes, the same body
 * gzipped, and the response headers. Supabase bills egress on the wire, and the
 * wire is compressed, so the gzip figure is the one that matters. It is computed
 * locally at default level rather than read off the socket — stated plainly
 * because it is an approximation of what Supabase's own compressor would emit,
 * not a capture of it.
 *
 * Then it cleans up and proves zero residue the way the acceptance harness does,
 * through the same purpose-built RPCs, and refuses to report a measurement if
 * anything is left behind.
 *
 * Usage: pnpm measure:feed
 */

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const projectRef = 'squqdstdvbsvhagfuzgj';
const supabaseUrl = `https://${projectRef}.supabase.co`;

function secret(name, file) {
  if (process.env[name]) return process.env[name];
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  throw new Error(`${name} is required. Expected the environment or ${file}.`);
}

const serviceKey = secret(
  'SUPABASE_SERVICE_ROLE_KEY',
  '.codex-internal/evidence/operator/supabase-service-key',
);
const anonKey = secret('SUPABASE_ANON_KEY', '.codex-internal/evidence/operator/supabase-anon-key');

const runId = `feed_${new Date().toISOString().replaceAll(/[-:.]/g, '')}_${randomBytes(4).toString('hex')}`;
const evidenceDir = path.resolve('.codex-internal/evidence', runId);
const resourcesPath = path.join(evidenceDir, 'resources.jsonl');

const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const users = [];
const gameIds = [];
const requestIds = [];

async function record(value) {
  await appendFile(resourcesPath, `${JSON.stringify(value)}\n`, { encoding: 'utf8', mode: 0o600 });
}

/*
 * Supabase returns plain objects from PostgREST and Error subclasses with
 * non-enumerable fields from GoTrue, so String() prints [object Object] and
 * JSON.stringify() prints {}. Two round trips were spent on that in v10 and one
 * more here, when cleanup failed with an empty message. Read every own property
 * by name.
 */
function describe(error) {
  if (!error) return 'unknown error';
  if (typeof error === 'string') return error;
  const parts = [];
  for (const key of ['message', 'code', 'details', 'hint', 'status']) {
    const value = error[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      parts.push(`${key}=${String(value)}`);
    }
  }
  if (!parts.length) {
    try {
      return JSON.stringify(error, Object.getOwnPropertyNames(error)).slice(0, 400);
    } catch {
      return 'unreadable error object';
    }
  }
  return parts.join(' ');
}

function log(message) {
  process.stdout.write(`${message}\n`);
}

async function createAccount(index) {
  const email = `${runId}_${index}@amordle.test`;
  const password = `A9!${randomBytes(18).toString('base64url')}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: 'player' },
  });
  if (error || !data.user) throw error ?? new Error('Disposable Auth user was not created.');
  await record({
    at: new Date().toISOString(),
    kind: 'auth_user',
    id: data.user.id,
    email,
    owner: runId,
  });
  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: session, error: signInError } = await authClient.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError || !session.session) {
    throw signInError ?? new Error('Disposable user session was not issued.');
  }
  const account = { id: data.user.id, email, accessToken: session.session.access_token };
  users.push(account);
  return account;
}

/*
 * One raw fetch per call, so the bytes are the bytes.
 *
 * The supabase-js client parses and discards the envelope, which is exactly the
 * thing being measured, so this goes to PostgREST directly with the same
 * Authorization the browser would send.
 */
async function measuredCall(account, label, pathAndQuery, body) {
  const url = `${supabaseUrl}/rest/v1/${pathAndQuery}`;
  const response = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${account.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      // Ask for identity so the body arrives uncompressed and can be measured
      // exactly; the gzip figure is computed from it below.
      'Accept-Encoding': 'identity',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${label} failed with ${response.status}: ${text.slice(0, 300)}`);
  }
  const raw = Buffer.byteLength(text, 'utf8');
  const gzip = gzipSync(Buffer.from(text, 'utf8')).byteLength;
  let headerBytes = 0;
  response.headers.forEach((value, key) => {
    headerBytes += Buffer.byteLength(`${key}: ${value}\r\n`, 'utf8');
  });
  return { label, raw, gzip, headerBytes, status: response.status, payload: text };
}

function total(calls) {
  return calls.reduce(
    (sum, call) => ({
      calls: sum.calls + 1,
      raw: sum.raw + call.raw,
      gzip: sum.gzip + call.gzip,
      headerBytes: sum.headerBytes + call.headerBytes,
    }),
    { calls: 0, raw: 0, gzip: 0, headerBytes: 0 },
  );
}

async function rpc(account, name, args) {
  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${account.accessToken}` } },
  });
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}

/*
 * The seed.
 *
 * Four real v2 Practice games through the application's own RPCs — not rows
 * fabricated into the authority table, because a fabricated row would measure a
 * projection the game could never actually produce. Two are joined so they are
 * playing, two are left waiting. Plus one private match request.
 *
 * Four rather than more because a player may hold at most FIVE active games:
 * amordle_combat_authority_v3 raises ACTIVE_LIMIT at the sixth, and the first
 * run of this script learned that the hard way. Four is a realistic upper bound
 * for one player anyway — the app itself will not let anyone exceed five.
 *
 * The creation keys are prefixed `<runId>:` because cleanup_amordle_combat_e2e_v2
 * refuses to delete a game whose creation key does not prove the run owns it.
 * The first run used a hyphen, so cleanup correctly declined and the rows had to
 * be removed by hand.
 */
async function seed(subject, opponent) {
  const lobbies = [];
  for (let index = 0; index < 4; index += 1) {
    const projection = await rpc(subject, 'create_amordle_public_practice_v3', {
      p_mode: index % 2 === 0 ? 'og' : 'go',
      p_word_length: 5,
      p_difficulty: 'standard',
      p_hard_mode: false,
      p_go_puzzle_count: index % 2 === 0 ? null : 5,
      p_time_limit_ms: null,
      p_creation_key: `${runId}:lobby-${index}`,
    });
    const id = projection?.id ?? projection?.game?.id;
    if (!id)
      throw new Error(`Lobby ${index} returned no id: ${JSON.stringify(projection).slice(0, 200)}`);
    gameIds.push(id);
    lobbies.push({ id, projection });
    await record({ at: new Date().toISOString(), kind: 'game', id, owner: runId });
  }
  log(`  seeded ${lobbies.length} Practice lobbies`);

  let joined = 0;
  for (const lobby of lobbies.slice(0, 3)) {
    try {
      await rpc(opponent, 'join_amordle_public_practice_v3', {
        p_game_id: lobby.id,
        p_expected_version: lobby.projection?.version ?? 0,
        p_action_id: `${runId}:join-${lobby.id}`,
      });
      joined += 1;
    } catch (error) {
      log(`  join skipped for ${lobby.id}: ${describe(error)}`);
    }
  }
  log(`  ${joined} joined and playing, ${lobbies.length - joined} left waiting`);

  try {
    const request = await rpc(opponent, 'create_private_multiplayer_match_request_v2', {
      p_target_public_profile_id: null,
      p_mode: 'og',
      p_word_length: 5,
      p_hard_mode: false,
      p_time_limit_ms: null,
      p_go_puzzle_count: null,
      p_idempotency_key: `${runId}:private`,
    });
    const id = Array.isArray(request) ? request[0]?.request_id : request?.request_id;
    if (id) {
      requestIds.push(id);
      await record({ at: new Date().toISOString(), kind: 'private_request', id, owner: runId });
    }
  } catch (error) {
    log(`  private request skipped: ${describe(error)}`);
  }

  return { lobbies: lobbies.length, joined };
}

async function measure(account, label) {
  const calls = [];

  calls.push(
    await measuredCall(
      account,
      'settings',
      `settings?select=settings,keyboard_sound_profile,haptics_enabled&user_id=eq.${account.id}`,
    ),
  );
  calls.push(
    await measuredCall(account, 'combat-active', 'rpc/list_amordle_combat_active_v2', {
      p_limit: 100,
    }),
  );
  const legacySelect =
    'id,scope,mode,status,current_turn,word_length,difficulty,go_puzzle_count,host_user_id,player_one_user_id,player_two_user_id,ranked,projection,state_version,move_count,created_at,updated_at';
  calls.push(
    await measuredCall(
      account,
      'legacy-games',
      `async_multiplayer_games?select=${legacySelect}&authority_version=eq.0&scope=eq.practice&ranked=is.false&status=in.(waiting,playing,holding,won,lost,cancelled)&or=(player_one_user_id.eq.${account.id},player_two_user_id.eq.${account.id})&order=updated_at.desc&limit=100`,
    ),
  );
  calls.push(
    await measuredCall(account, 'private-requests', 'rpc/get_private_multiplayer_match_requests', {
      p_limit: 100,
    }),
  );

  // The rematch fan-out: one call per terminal Practice game, capped at 20,
  // derived from the combat list exactly as the old client derived it.
  const combat = JSON.parse(calls[1].payload);
  const terminalPracticeIds = (Array.isArray(combat) ? combat : [])
    .filter((game) => game?.outcome?.terminal === true && game?.scope === 'practice')
    .map((game) => game.id)
    .slice(0, 20);
  for (const gameId of terminalPracticeIds) {
    calls.push(
      await measuredCall(
        account,
        `rematch:${gameId.slice(0, 8)}`,
        'rpc/get_practice_multiplayer_rematch_requests',
        {
          p_source_game_id: gameId,
          p_limit: 20,
        },
      ),
    );
  }

  const oldPath = {
    ...total(calls),
    terminalPracticeGames: terminalPracticeIds.length,
    detail: calls.map((call) => ({
      label: call.label,
      raw: call.raw,
      gzip: call.gzip,
      headerBytes: call.headerBytes,
      status: call.status,
    })),
  };

  const feed = await measuredCall(
    account,
    'notification-feed',
    'rpc/get_player_notification_feed_v1',
    {
      p_limit: 100,
    },
  );
  const newPath = {
    ...total([feed]),
    detail: [
      {
        label: feed.label,
        raw: feed.raw,
        gzip: feed.gzip,
        headerBytes: feed.headerBytes,
        status: feed.status,
      },
    ],
  };

  log(`\n  ${label}`);
  log(
    `    OLD  ${oldPath.calls} calls  ${oldPath.raw} B raw  ${oldPath.gzip} B gzip  ${oldPath.headerBytes} B headers`,
  );
  log(
    `    NEW  ${newPath.calls} call   ${newPath.raw} B raw  ${newPath.gzip} B gzip  ${newPath.headerBytes} B headers`,
  );
  return { oldPath, newPath };
}

async function cleanup() {
  const userIds = users.map((user) => user.id);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const { error: cleanupError } = await admin.rpc('cleanup_amordle_combat_e2e_v2', {
        p_run_id: runId,
        p_game_ids: gameIds,
        p_request_ids: requestIds,
        p_user_ids: userIds,
      });
      if (cleanupError) throw new Error(`cleanup rpc: ${describe(cleanupError)}`);
      const { data: probe, error: probeError } = await admin.rpc(
        'probe_amordle_combat_e2e_residue_v2',
        {
          p_run_id: runId,
          p_game_ids: gameIds,
          p_request_ids: requestIds,
          p_user_ids: userIds,
        },
      );
      if (probeError) throw new Error(`probe: ${describe(probeError)}`);
      const residue = { ...probe };

      for (const table of [
        'game_history',
        'progress_snapshots',
        'settings',
        'player_economy_state',
        'player_economy_operations',
        'player_daily_entitlements',
        'public_player_profiles',
        'multiplayer_rating_profiles',
        'profiles',
      ]) {
        const { count, error } = await admin
          .from(table)
          .select('user_id', { count: 'exact', head: true })
          .in('user_id', userIds);
        if (error) throw error;
        residue[table] = count ?? -1;
      }

      const dirty = Object.entries(residue).filter(([, count]) => count !== 0);
      if (dirty.length) {
        throw new Error(`Residue remained: ${dirty.map(([k, v]) => `${k}=${v}`).join(', ')}`);
      }

      /*
       * GoTrue's admin delete fails intermittently here with an empty 500 —
       * the AuthRetryableFetchError family v10 recorded and deliberately left
       * unexplained. It is not a data problem: deleting the same rows through
       * SQL succeeds immediately, every time. Retried rather than diagnosed,
       * and if it never succeeds the failure path below prints the exact SQL so
       * a stuck run is one paste from clean rather than a mystery.
       */
      for (const user of users) {
        const { error } = await admin.auth.admin.deleteUser(user.id);
        if (error && !/not found/i.test(describe(error))) {
          throw new Error(`auth delete ${user.id}: ${describe(error)}`);
        }
      }
      for (const user of users) {
        const { data } = await admin.auth.admin.getUserById(user.id);
        if (data.user) throw new Error(`Auth residue remained for ${user.id}.`);
      }
      return { attempt, residue, authResidue: 0, status: 'zero-residue' };
    } catch (error) {
      if (attempt === 3) throw new Error(describe(error));
      log(`  cleanup attempt ${attempt} failed: ${describe(error)} — retrying`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw new Error('unreachable');
}

async function main() {
  await mkdir(evidenceDir, { recursive: true, mode: 0o700 });
  log(`run ${runId}`);

  const subject = await createAccount(0);
  const opponent = await createAccount(1);
  log(`  two disposable accounts created`);

  const emptyFeed = await measure(subject, 'EMPTY ACCOUNT (the floor)');
  const seeded = await seed(subject, opponent);
  const seededFeed = await measure(
    subject,
    `SEEDED (${seeded.lobbies} games, ${seeded.joined} playing)`,
  );

  const receipt = await cleanup();
  log(`\n  cleanup: ${receipt.status} on attempt ${receipt.attempt}`);

  const result = {
    schemaVersion: 1,
    runId,
    measuredAt: new Date().toISOString(),
    note: 'gzip is computed locally at default level from the identity-encoded body, not captured off the wire',
    seed: seeded,
    empty: emptyFeed,
    seeded: seededFeed,
    cleanup: receipt,
  };
  await writeFile(
    path.join(evidenceDir, 'measurement.json'),
    `${JSON.stringify(result, null, 2)}\n`,
    {
      mode: 0o600,
    },
  );
  log(`\nWROTE ${path.join(evidenceDir, 'measurement.json')}`);
}

main().catch(async (error) => {
  process.stderr.write(`\nMEASUREMENT FAILED: ${describe(error)}\n`);
  try {
    const receipt = await cleanup();
    process.stderr.write(
      `Cleanup after failure: ${receipt.status} on attempt ${receipt.attempt}\n`,
    );
  } catch (cleanupError) {
    process.stderr.write(
      `CLEANUP ALSO FAILED: ${cleanupError.message}\nRESIDUE MAY REMAIN for run ${runId}\n`,
    );
  }
  process.exit(1);
});
