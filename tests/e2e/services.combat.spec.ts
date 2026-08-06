import { expect, test } from '@playwright/test';
import type { BrowserContext, Page, Route } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { selectPracticeAnswers } from '../../src/domain/selectors';
import type { Database, Json } from '../../src/types/database';

const projectRef = 'squqdstdvbsvhagfuzgj';
const supabaseUrl = `https://${projectRef}.supabase.co`;
const baseURL = required('E2E_BASE_URL').replace(/\/$/, '');
const bypassSecret = required('E2E_VERCEL_BYPASS_SECRET');
const serviceKey = required('SUPABASE_SERVICE_ROLE_KEY');
const anonKey = required('SUPABASE_ANON_KEY');
const commitSha = required('E2E_EXPECTED_COMMIT_SHA');
const utc = new Date().toISOString().replaceAll(/[-:.]/g, '');
const runId = `e2e_${utc}_${commitSha.slice(0, 8)}_${randomBytes(4).toString('hex')}`;
const evidenceDir = path.resolve('.codex-internal/evidence', runId);
const resourcesPath = path.join(evidenceDir, 'resources.jsonl');
const eventsPath = path.join(evidenceDir, 'events.jsonl');
const cleanupPath = path.join(evidenceDir, 'cleanup.json');
const bypassStorageState = '.codex-internal/evidence/operator/vercel-protection-storage-state.json';
const publicPrivateScenarioId = 'V6.1-HOSTED-PUBLIC-PRIVATE-RECOVERY';
const rankedDailyScenarioId = 'V6.1-HOSTED-RANKED-PRACTICE-DAILY';
const publicCommunityScenarioId = 'V6.2-HOSTED-PUBLIC-COMMUNITY';
const definitionScenarioId = 'V6.2-HOSTED-DEFINITION-SURFACES';
const accentPresetScenarioId = 'V6.3-HOSTED-ACCENT-PRESETS';
const feedbackScenarioId = 'V6.4-HOSTED-FEEDBACK-PREFERENCES';
const avatarScenarioId = 'V6.4-HOSTED-PUBLIC-AVATAR';
const accountLifecycleScenarioId = 'V6.6-HOSTED-ACCOUNT-LIFECYCLE';
const avatarBucket = 'amordle-public-avatars-v1';

interface Account {
  id: string;
  email: string;
  password: string;
  accessToken: string;
}

const admin = createClient<Database>(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const users: Account[] = [];
const gameIds: string[] = [];
const directCascadeGameIds: string[] = [];
const queueRequestIds: string[] = [];
const lifecycleQueueIds: string[] = [];
const rankedDailyGameIds: string[] = [];
const rankedDailyRequestIds: string[] = [];
const privateRequestIds: string[] = [];
const rematchRequestIds: string[] = [];
const accentPresetIds: string[] = [];
const avatarPaths: string[] = [];
const lifecycleResultIds: string[] = [];
const contexts: BrowserContext[] = [];
let cleanupComplete = false;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for protected service acceptance.`);
  return value;
}

async function appendJson(file: string, value: unknown) {
  await appendFile(file, `${JSON.stringify(value)}\n`, { encoding: 'utf8', mode: 0o600 });
}

async function event(kind: string, detail: Record<string, unknown> = {}) {
  await appendJson(eventsPath, { at: new Date().toISOString(), kind, ...detail });
}

function cleanupErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'Unknown cleanup error.';
}

async function createAccount(index: number, role: 'admin' | 'player'): Promise<Account> {
  const email = `${runId}_${index}@amordle.test`;
  const password = `A9!${randomBytes(18).toString('base64url')}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
  });
  if (error || !data.user) throw error ?? new Error('Disposable Auth user was not created.');
  await appendJson(resourcesPath, {
    at: new Date().toISOString(),
    kind: 'auth_user',
    id: data.user.id,
    email,
    owner: runId,
    disposable: true,
  });
  if (role === 'admin') {
    const { error: profileError } = await admin.from('profiles').upsert({
      id: data.user.id,
      email,
      display_name: 'E2E Operator',
      role: 'admin',
    });
    if (profileError) throw profileError;
  }
  const authClient = createClient<Database>(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: session, error: signInError } = await authClient.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError || !session.session) {
    throw signInError ?? new Error('Disposable user session was not issued.');
  }
  const account = {
    id: data.user.id,
    email,
    password,
    accessToken: session.session.access_token,
  };
  users.push(account);
  await event('auth_user_created', { id: account.id, role });
  return account;
}

function bypassHeaders(extra: Record<string, string> = {}) {
  return {
    'x-vercel-protection-bypass': bypassSecret,
    ...extra,
  };
}

function legacyProgressFixture() {
  return {
    schemaVersion: 11,
    completedGameIds: ['og:daily:2026-07-20'],
    progression: {
      coins: 0,
      consumables: { removeIncorrectLetters: 0, revealOneLetter: 0 },
      level: 4,
      xp: 375,
      economyOperationIds: [],
      economyRevision: 0,
    },
    settings: {},
    stats: {
      og: { daily: { currentStreak: 3 } },
      go: { daily: { currentStreak: 5 } },
    },
    unlockedDailies: ['og:2026-07-18'],
    history: [
      {
        attemptsUsed: 4,
        coinAward: 12,
        completedAt: '2026-07-20T15:00:00.000Z',
        gameId: 'og:daily:2026-07-20',
        mode: 'og',
        scope: 'daily',
        status: 'won',
        word: 'private-legacy-answer',
        wordLength: 5,
        xpAward: 42,
      },
    ],
  };
}

async function signIn(page: Page, account: Account) {
  await page.goto(`${baseURL}/auth`);
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).last().click();
  // ANNOT-10: ordinary interactive sign-in now lands on Home rather than leaving the
  // player on the account page, so this is the hosted proof of that destination.
  await expect(page).toHaveURL(new RegExp(`^${baseURL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?$`));
  await expect(page.getByRole('heading', { name: /choose your next game/i })).toBeVisible();
}

async function waitForGameMoveCount(gameId: string, count: number) {
  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from('async_multiplayer_games')
          .select('move_count')
          .eq('id', gameId)
          .single();
        if (error) throw error;
        return data.move_count;
      },
      { timeout: 15_000 },
    )
    .toBe(count);
}

async function submitOnScreenGuess(page: Page, guess: string) {
  const draft = page.locator('.board-row.is-draft');
  let prefix = '';
  for (const letter of guess) {
    await page
      .getByRole('button', {
        name: new RegExp(`^${letter.toUpperCase()},`, 'i'),
      })
      .click();
    prefix += letter.toUpperCase();
    await expect(draft).toHaveText(prefix);
  }
  const submit = page.getByRole('button', { name: /submit/i });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect
    .poll(async () => {
      if ((await draft.count()) === 0) return '';
      return (await draft.textContent())?.trim() ?? '';
    })
    .toBe('');
}

async function registerLatestQueueRequest(
  user: Account,
  scope: 'practice' | 'daily',
  mode: 'og' | 'go',
) {
  const row = await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from('multiplayer_matchmaking_queue')
          .select('id,status,scope,mode,idempotency_key')
          .eq('user_id', user.id)
          .eq('scope', scope)
          .eq('mode', mode)
          .like('idempotency_key', `${runId}:%`)
          .order('queued_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        return data;
      },
      { timeout: 15_000 },
    )
    .not.toBeNull()
    .then(async () => {
      const { data, error } = await admin
        .from('multiplayer_matchmaking_queue')
        .select('id,status,scope,mode,idempotency_key')
        .eq('user_id', user.id)
        .eq('scope', scope)
        .eq('mode', mode)
        .like('idempotency_key', `${runId}:%`)
        .order('queued_at', { ascending: false })
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    });
  if (![...queueRequestIds, ...rankedDailyRequestIds].includes(row.id)) {
    if (scope === 'daily') {
      rankedDailyRequestIds.push(row.id);
    } else {
      queueRequestIds.push(row.id);
    }
    await appendJson(resourcesPath, {
      at: new Date().toISOString(),
      kind: 'matchmaking_queue_request',
      id: row.id,
      owner: runId,
      userId: user.id,
      scope,
      mode,
      disposable: true,
    });
  }
  return row;
}

async function registerGame(
  gameId: string,
  source: string,
  participantIds: readonly string[],
  directCascade = false,
) {
  if (!gameIds.includes(gameId)) {
    gameIds.push(gameId);
    await appendJson(resourcesPath, {
      at: new Date().toISOString(),
      kind: 'async_multiplayer_game',
      id: gameId,
      owner: runId,
      source,
      participantIds,
      disposable: true,
    });
  }
  if (directCascade && !directCascadeGameIds.includes(gameId)) {
    directCascadeGameIds.push(gameId);
  }
}

async function inspectAnswer(gameId: string): Promise<string> {
  const { data, error } = await admin.rpc('inspect_amordle_combat_e2e_v2', {
    p_run_id: runId,
    p_game_id: gameId,
    p_user_ids: users.map((user) => user.id),
  });
  if (error) throw error;
  const answers = (data as { answers?: unknown }).answers;
  if (!Array.isArray(answers) || typeof answers[0] !== 'string') {
    throw new Error('Service-only answer inspection returned an invalid envelope.');
  }
  return answers[0].toLowerCase();
}

async function cleanup() {
  if (cleanupComplete) return;
  for (const context of contexts.splice(0)) {
    await context.close().catch(() => undefined);
  }
  await event('contexts_closed');
  const userIds = users.map((user) => user.id);
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      if (avatarPaths.length) {
        const { error } = await admin.storage.from(avatarBucket).remove(avatarPaths);
        if (error) throw error;
      }
      if (rematchRequestIds.length) {
        const { error } = await admin
          .from('multiplayer_practice_rematch_requests')
          .delete()
          .in('id', rematchRequestIds);
        if (error) throw error;
      }
      if (privateRequestIds.length) {
        const { error } = await admin
          .from('multiplayer_private_match_requests')
          .delete()
          .in('id', privateRequestIds);
        if (error) throw error;
      }
      if (rankedDailyGameIds.length || rankedDailyRequestIds.length) {
        const { error: rankedDailyPrivateError } = await admin.rpc(
          'cleanup_ranked_daily_multiplayer_for_users',
          {
            p_user_ids: userIds,
          },
        );
        if (rankedDailyPrivateError) throw rankedDailyPrivateError;
        const rankedDailyResults = rankedDailyGameIds.length
          ? await admin
              .from('multiplayer_match_results')
              .select('id')
              .in('source_match_id', rankedDailyGameIds)
              .then(({ data, error }) => {
                if (error) throw error;
                return data;
              })
          : [];
        const rankedDailyResultIds = rankedDailyResults.map((result) => result.id);
        if (rankedDailyResultIds.length) {
          const { error: transactionError } = await admin
            .from('multiplayer_rating_transactions')
            .delete()
            .in('match_result_id', rankedDailyResultIds);
          if (transactionError) throw transactionError;
          const { error: playerResultError } = await admin
            .from('multiplayer_player_results')
            .delete()
            .in('match_result_id', rankedDailyResultIds);
          if (playerResultError) throw playerResultError;
          const { error: resultError } = await admin
            .from('multiplayer_match_results')
            .delete()
            .in('id', rankedDailyResultIds);
          if (resultError) throw resultError;
        }
        if (rankedDailyGameIds.length) {
          const { error: gameError } = await admin
            .from('async_multiplayer_games')
            .delete()
            .in('id', rankedDailyGameIds)
            .in('host_user_id', userIds);
          if (gameError) throw gameError;
        }
        if (rankedDailyRequestIds.length) {
          const { error: requestError } = await admin
            .from('multiplayer_matchmaking_queue')
            .delete()
            .in('id', rankedDailyRequestIds)
            .in('user_id', userIds);
          if (requestError) throw requestError;
        }
      }
      if (directCascadeGameIds.length) {
        const { error } = await admin
          .from('async_multiplayer_games')
          .delete()
          .in('id', directCascadeGameIds)
          .eq('authority_version', 2)
          .in('host_user_id', userIds);
        if (error) throw error;
      }

      if (accentPresetIds.length) {
        const { error } = await admin
          .from('public_profile_accent_presets')
          .delete()
          .in('preset_id', accentPresetIds);
        if (error) throw error;
      }
      if (lifecycleQueueIds.length) {
        const { error } = await admin
          .from('multiplayer_matchmaking_queue')
          .delete()
          .in('id', lifecycleQueueIds)
          .in('user_id', userIds);
        if (error) throw error;
      }
      if (lifecycleResultIds.length) {
        const { error: transactionError } = await admin
          .from('multiplayer_rating_transactions')
          .delete()
          .in('match_result_id', lifecycleResultIds);
        if (transactionError) throw transactionError;
        const { error: playerResultError } = await admin
          .from('multiplayer_player_results')
          .delete()
          .in('match_result_id', lifecycleResultIds);
        if (playerResultError) throw playerResultError;
        const { error: resultError } = await admin
          .from('multiplayer_match_results')
          .delete()
          .in('id', lifecycleResultIds);
        if (resultError) throw resultError;
      }
      const rpcCleanupGameIds = gameIds.filter(
        (id) => !directCascadeGameIds.includes(id) && !rankedDailyGameIds.includes(id),
      );
      if (rpcCleanupGameIds.length || queueRequestIds.length) {
        const { error: combatCleanupError } = await admin.rpc('cleanup_amordle_combat_e2e_v2', {
          p_run_id: runId,
          p_game_ids: rpcCleanupGameIds,
          p_request_ids: queueRequestIds,
          p_user_ids: userIds,
        });
        if (combatCleanupError) throw combatCleanupError;
      }

      const exactDeletes: Array<
        [keyof Database['public']['Tables'], 'id' | 'user_id', readonly string[]]
      > = [
        ['game_history', 'user_id', userIds],
        ['multiplayer_daily_claims', 'user_id', userIds],
        ['progress_snapshots', 'user_id', userIds],
        ['settings', 'user_id', userIds],
        ['player_economy_operations', 'user_id', userIds],
        ['player_economy_state', 'user_id', userIds],
        ['public_player_profiles', 'user_id', userIds],
        ['multiplayer_private_request_preferences', 'user_id', userIds],
        ['multiplayer_rating_profiles', 'user_id', userIds],
        ['profiles', 'id', userIds],
      ];
      for (const [table, column, ids] of exactDeletes) {
        if (!ids.length) continue;
        const { error } = await admin
          .from(table)
          .delete()
          .in(column, [...ids]);
        if (error) throw error;
      }

      const residue: Record<string, number> = {};
      if (gameIds.length) {
        const { count, error } = await admin
          .from('async_multiplayer_games')
          .select('id', { count: 'exact', head: true })
          .in('id', gameIds);
        if (error) throw error;
        residue.games = count ?? -1;
      } else {
        residue.games = 0;
      }
      for (const [name, table, ids] of [
        ['queueRequests', 'multiplayer_matchmaking_queue', queueRequestIds],
        ['lifecycleQueueRequests', 'multiplayer_matchmaking_queue', lifecycleQueueIds],
        ['rankedDailyRequests', 'multiplayer_matchmaking_queue', rankedDailyRequestIds],
        ['privateRequests', 'multiplayer_private_match_requests', privateRequestIds],
        ['rematchRequests', 'multiplayer_practice_rematch_requests', rematchRequestIds],
      ] as const) {
        if (!ids.length) {
          residue[name] = 0;
          continue;
        }
        const { count, error } = await admin
          .from(table)
          .select('id', { count: 'exact', head: true })
          .in('id', [...ids]);
        if (error) throw error;
        residue[name] = count ?? -1;
      }
      if (accentPresetIds.length) {
        const { count: accentPresetResidue, error: accentPresetResidueError } = await admin
          .from('public_profile_accent_presets')
          .select('preset_id', { count: 'exact', head: true })
          .in('preset_id', accentPresetIds);
        if (accentPresetResidueError) throw accentPresetResidueError;
        residue.accentPresets = accentPresetResidue ?? -1;
      } else {
        residue.accentPresets = 0;
      }
      if (avatarPaths.length) {
        const avatarNames = new Set(avatarPaths.map((value) => value.split('/').at(-1)));
        const { data, error } = await admin.storage.from(avatarBucket).list('avatars', {
          limit: 100,
          search: avatarPaths[0]?.split('/').at(-1) ?? '',
        });
        if (error) throw error;
        residue.avatarObjects = (data ?? []).filter((entry) => avatarNames.has(entry.name)).length;
      } else {
        residue.avatarObjects = 0;
      }
      for (const [table, column, ids] of exactDeletes) {
        const { count, error } = await admin
          .from(table)
          .select(column, { count: 'exact', head: true })
          .in(column, [...ids]);
        if (error) throw error;
        residue[String(table)] = count ?? -1;
      }
      const { data: combatResidue, error: combatResidueError } = await admin.rpc(
        'probe_amordle_combat_e2e_residue_v2',
        {
          p_run_id: runId,
          p_game_ids: gameIds,
          p_request_ids: [...queueRequestIds, ...lifecycleQueueIds, ...rankedDailyRequestIds],
          p_user_ids: userIds,
        },
      );
      if (combatResidueError) throw combatResidueError;
      for (const [name, count] of Object.entries(combatResidue as Record<string, number>)) {
        residue[`combat.${name}`] = count;
      }
      if (Object.values(residue).some((count) => count !== 0)) {
        throw new Error(`Database residue remained after cleanup attempt ${attempt}.`);
      }

      for (const user of users) {
        const { error } = await admin.auth.admin.deleteUser(user.id);
        if (error && !/not found/i.test(error.message)) throw error;
      }
      for (const user of users) {
        const { data } = await admin.auth.admin.getUserById(user.id);
        if (data.user) throw new Error(`Auth residue remained for ${user.id}.`);
      }
      const receipt = {
        schemaVersion: 1,
        runId,
        completedAt: new Date().toISOString(),
        attempt,
        resourceCounts: {
          authUsers: users.length,
          games: gameIds.length,
          queueRequests: queueRequestIds.length,
          lifecycleQueueRequests: lifecycleQueueIds.length,
          rankedDailyRequests: rankedDailyRequestIds.length,
          privateRequests: privateRequestIds.length,
          rematchRequests: rematchRequestIds.length,
          accentPresets: accentPresetIds.length,
          avatarObjects: avatarPaths.length,
          lifecycleResults: lifecycleResultIds.length,
        },
        residue,
        authResidue: 0,
        privateAuthCascadeAuthority: {
          lifecycleChallenges: 'on delete cascade from verified-absent Auth users',
          competitiveGenerations: 'on delete cascade from verified-absent Auth users',
        },
        status: 'zero-residue',
      };
      await writeFile(cleanupPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
      await event('cleanup_complete', { attempt, status: 'zero-residue' });
      cleanupComplete = true;
      return;
    } catch (error) {
      lastError = error;
      await event('cleanup_retry', {
        attempt,
        error: cleanupErrorMessage(error),
      });
    }
  }
  throw lastError;
}

test.describe.serial('protected Preview services', () => {
  test.beforeAll(async () => {
    await mkdir(evidenceDir, { recursive: true, mode: 0o700 });
    await writeFile(resourcesPath, '', { mode: 0o600 });
    await writeFile(eventsPath, '', { mode: 0o600 });
    const manifestResponse = await fetch(`${baseURL}/api/word-lists/manifest`, {
      headers: bypassHeaders(),
    });
    const manifestBody = (await manifestResponse.json()) as {
      manifest: { revision?: string } | null;
    };
    if (!manifestResponse.ok || !manifestBody.manifest?.revision) {
      throw new Error('Deployment word manifest was unavailable during resource registration.');
    }
    await appendJson(resourcesPath, {
      at: new Date().toISOString(),
      kind: 'deployment_word_manifest',
      id: manifestBody.manifest.revision,
      owner: commitSha,
      disposable: false,
      lifecycle: 'immutable-deployment-asset',
    });
    await createAccount(1, 'admin');
    await createAccount(2, 'player');
    await createAccount(3, 'player');
  });

  test.afterAll(async () => {
    await cleanup();
  });

  test('proves deployment words, UI multiplayer recovery, and privacy', async ({ browser }) => {
    test.setTimeout(600_000);
    await event('hosted_scenario_started', { scenarioId: publicPrivateScenarioId });
    await event('hosted_scenario_started', { scenarioId: publicCommunityScenarioId });
    await event('hosted_scenario_started', { scenarioId: definitionScenarioId });
    await event('hosted_scenario_started', { scenarioId: accentPresetScenarioId });
    await event('hosted_scenario_started', { scenarioId: feedbackScenarioId });
    await event('hosted_scenario_started', { scenarioId: avatarScenarioId });
    const [playerOne, playerTwo, spectator] = users;
    expect(playerOne).toBeDefined();
    expect(playerTwo).toBeDefined();
    expect(spectator).toBeDefined();

    const protectedResponse = await fetch(`${baseURL}/`, { redirect: 'manual' });
    expect(protectedResponse.status).toBe(302);
    expect(protectedResponse.headers.get('location')).toContain('vercel.com/sso-api');

    const publicResponse = await fetch(`${baseURL}/`, {
      headers: bypassHeaders(),
    });
    expect(publicResponse.status).toBe(200);

    const methodResponse = await fetch(`${baseURL}/api/admin-refresh`, {
      headers: bypassHeaders(),
    });
    expect(methodResponse.status).toBe(405);
    const unauthorizedResponse = await fetch(`${baseURL}/api/admin-refresh`, {
      method: 'POST',
      headers: bypassHeaders(),
    });
    expect(unauthorizedResponse.status).toBe(401);
    const forbiddenResponse = await fetch(`${baseURL}/api/admin-refresh`, {
      method: 'POST',
      headers: bypassHeaders({ Authorization: `Bearer ${playerTwo!.accessToken}` }),
    });
    expect(forbiddenResponse.status).toBe(403);
    const cronResponse = await fetch(`${baseURL}/api/cron/refresh-word-lists`, {
      headers: bypassHeaders(),
    });
    expect(cronResponse.status).toBe(401);

    let freshnessReceipt: {
      status?: string;
      deployedRevision?: string;
      observedUpstreamCommit?: string;
      nextAction?: string;
    } = {};
    await expect
      .poll(
        async () => {
          const refreshResponse = await fetch(`${baseURL}/api/admin-refresh`, {
            method: 'POST',
            headers: bypassHeaders({ Authorization: `Bearer ${playerOne!.accessToken}` }),
          });
          if (refreshResponse.status === 200) {
            freshnessReceipt = (await refreshResponse.json()) as typeof freshnessReceipt;
          }
          return refreshResponse.status;
        },
        {
          timeout: 60_000,
          intervals: [1_000, 2_000, 5_000],
        },
      )
      .toBe(200);
    expect(freshnessReceipt.status).toMatch(/^(current|upstream_release_available)$/);
    expect(freshnessReceipt.deployedRevision).toMatch(/^[a-f0-9]{64}$/);
    expect(freshnessReceipt.observedUpstreamCommit).toMatch(/^[a-f0-9]{40}$/);
    const manifestResponse = await fetch(`${baseURL}/api/word-lists/manifest`, {
      headers: bypassHeaders(),
    });
    expect(manifestResponse.status).toBe(200);
    const body = (await manifestResponse.json()) as {
      manifest: {
        schemaVersion: number;
        revision: string;
        entries: Array<{
          length: number;
          bytes: number;
          sha256: string;
          url: string;
        }>;
      } | null;
    };
    expect(body.manifest).not.toBeNull();
    expect(body.manifest?.schemaVersion).toBe(2);
    const manifestEntries = body.manifest?.entries ?? [];
    expect(manifestEntries.map((entry) => entry.length)).toEqual(
      Array.from({ length: 34 }, (_, index) => index + 2),
    );
    for (const length of [2, 5, 7, 10, 35]) {
      const entry = manifestEntries.find((candidate) => candidate.length === length);
      expect(entry).toBeDefined();
      expect(entry!.url.startsWith('/')).toBe(true);
      const assetUrl = new URL(entry!.url, baseURL);
      expect(assetUrl.origin).toBe(new URL(baseURL).origin);
      expect(assetUrl.hostname).not.toContain('blob.vercel-storage.com');
      expect(assetUrl.pathname).not.toContain('/storage/v1/');
      const assetResponse = await fetch(assetUrl, { headers: bypassHeaders() });
      expect(assetResponse.status).toBe(200);
      expect(assetResponse.headers.get('cache-control')).toContain('immutable');
      const raw = Buffer.from(await assetResponse.arrayBuffer());
      expect(raw.byteLength).toBe(entry!.bytes);
      expect(createHash('sha256').update(raw).digest('hex')).toBe(entry!.sha256);
      expect(raw.toString('utf8')).not.toMatch(
        /"seed"|"activeAnswer"|"rankedAnswer"|"rawIdentity"|"userId"/,
      );
    }
    await event('deployment_word_authority_verified', {
      objectCount: 34,
      revision: body.manifest?.revision,
      representativeLengths: [2, 5, 7, 10, 35],
      freshnessStatus: freshnessReceipt.status,
    });

    const legacySnapshot = legacyProgressFixture();
    const { error: legacyError } = await admin.from('progress_snapshots').upsert({
      user_id: playerTwo!.id,
      progress: legacySnapshot as Json,
      updated_at: new Date().toISOString(),
    });
    if (legacyError) throw legacyError;
    await appendJson(resourcesPath, {
      at: new Date().toISOString(),
      kind: 'progress_snapshot',
      id: playerTwo!.id,
      owner: runId,
      disposable: true,
      fixture: 'recognized-schema-v11',
    });

    const contextOptions = {
      baseURL,
      storageState: bypassStorageState,
      serviceWorkers: 'allow' as const,
    };
    const firstContext = await browser.newContext(contextOptions);
    const secondContext = await browser.newContext(contextOptions);
    const spectatorContext = await browser.newContext(contextOptions);
    for (const context of [firstContext, secondContext, spectatorContext]) {
      await context.addInitScript((correlationId) => {
        (
          window as typeof window & {
            __AMORDLE_E2E_RUN_ID__?: string;
          }
        ).__AMORDLE_E2E_RUN_ID__ = correlationId;
      }, runId);
    }
    contexts.push(firstContext, secondContext, spectatorContext);
    const firstPage = await firstContext.newPage();
    const secondPage = await secondContext.newPage();
    const spectatorPage = await spectatorContext.newPage();
    let definitionSourceRequests = 0;
    const fulfillDefinition = async (route: Route) => {
      definitionSourceRequests += 1;
      const word = new URL(route.request().url()).pathname.split('/').at(-1) ?? 'word';
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([
          {
            meanings: [
              {
                partOfSpeech: 'verb',
                definitions: [{ definition: `A verified hosted definition for ${word}.` }],
              },
            ],
          },
        ]),
      });
    };
    await Promise.all(
      [firstContext, secondContext, spectatorContext].map((context) =>
        context.route('https://api.dictionaryapi.dev/api/v2/entries/en/**', fulfillDefinition),
      ),
    );
    await signIn(firstPage, playerOne!);
    await signIn(secondPage, playerTwo!);
    await signIn(spectatorPage, spectator!);

    await firstPage.setViewportSize({ width: 1440, height: 1024 });
    await firstPage.emulateMedia({ colorScheme: 'light' });
    await firstPage.goto(`${baseURL}/profile`);
    await expect(firstPage.getByRole('heading', { name: 'PUBLIC PROFILE' })).toBeVisible();
    await firstPage.getByLabel('Player name').fill('E2E Operator');
    await firstPage.getByLabel('Bio').fill('V6.2 public profile proof.');
    await firstPage
      .getByLabel('Profile image URL')
      .fill('https://avatars.githubusercontent.com/u/9919?s=200&v=4');
    await firstPage.getByText('Violet', { exact: true }).click();
    await expect(firstPage.getByRole('radio', { name: 'Violet' })).toBeChecked();
    await firstPage.getByLabel('Flair').selectOption('combat');
    await firstPage.getByRole('button', { name: 'SAVE PROFILE' }).click();
    await expect(firstPage.getByText('Profile saved.')).toBeVisible();
    await firstPage.reload();
    await expect(firstPage.getByRole('radio', { name: 'Violet' })).toBeChecked();
    await expect(firstPage.getByLabel('Flair')).toHaveValue('combat');
    await expect(firstPage.getByLabel('Profile image URL')).toHaveValue(
      'https://avatars.githubusercontent.com/u/9919?s=200&v=4',
    );
    const { data: savedProfile, error: savedProfileError } = await admin
      .from('public_player_profiles')
      .select('accent_color,avatar_url,bio,flair_key,public_profile_id,visibility')
      .eq('user_id', playerOne!.id)
      .single();
    if (savedProfileError) throw savedProfileError;
    expect(savedProfile).toMatchObject({
      accent_color: 'violet',
      avatar_url: 'https://avatars.githubusercontent.com/u/9919?s=200&v=4',
      bio: 'V6.2 public profile proof.',
      flair_key: 'combat',
      visibility: 'public',
    });

    const avatarPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    await firstPage.getByLabel('Upload profile image').setInputFiles({
      name: 'e2e-avatar.png',
      mimeType: 'image/png',
      buffer: avatarPng,
    });
    await firstPage.getByRole('button', { name: 'UPLOAD AND USE' }).click();
    await expect(firstPage.getByLabel('Profile image URL')).toHaveValue(
      new RegExp(`/storage/v1/object/public/${avatarBucket}/avatars/`),
    );
    const uploadedAvatarUrl = await firstPage.getByLabel('Profile image URL').inputValue();
    const avatarMarker = `/storage/v1/object/public/${avatarBucket}/`;
    const uploadedAvatarPath = decodeURIComponent(
      new URL(uploadedAvatarUrl).pathname.split(avatarMarker)[1] ?? '',
    );
    expect(uploadedAvatarPath).toMatch(
      /^avatars\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/,
    );
    avatarPaths.push(uploadedAvatarPath);
    await appendJson(resourcesPath, {
      at: new Date().toISOString(),
      kind: 'storage_object',
      bucket: avatarBucket,
      id: uploadedAvatarPath,
      owner: runId,
      userId: playerOne!.id,
      disposable: true,
    });
    const publicAvatarResponse = await fetch(uploadedAvatarUrl);
    expect(publicAvatarResponse.status).toBe(200);
    expect(publicAvatarResponse.headers.get('content-type')).toContain('image/png');
    const isolatedAvatarClient = createClient<Database>(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: isolatedAvatarSignInError } = await isolatedAvatarClient.auth.signInWithPassword(
      {
        email: playerTwo!.email,
        password: playerTwo!.password,
      },
    );
    if (isolatedAvatarSignInError) throw isolatedAvatarSignInError;
    await isolatedAvatarClient.storage.from(avatarBucket).remove([uploadedAvatarPath]);
    expect((await fetch(uploadedAvatarUrl)).status).toBe(200);
    await event('public_avatar_upload_verified', {
      scenarioId: avatarScenarioId,
      path: uploadedAvatarPath,
      publicRead: true,
      ownerUpload: true,
      crossAccountDeleteDenied: true,
    });

    await firstPage.goto(`${baseURL}/settings`);
    await firstPage.getByLabel('Keyboard sound').selectOption('mechanical');
    await expect(firstPage.getByText('Settings saved to your account.')).toBeVisible();
    const hapticsControl = firstPage.getByRole('checkbox', { name: 'Touch haptics' });
    await hapticsControl.click();
    await expect(hapticsControl).toBeChecked();
    await expect(firstPage.getByText('Settings saved to your account.')).toBeVisible();
    await firstPage.getByRole('button', { name: 'PREVIEW' }).click();
    const { data: feedbackSettings, error: feedbackSettingsError } = await admin
      .from('settings')
      .select('keyboard_sound_profile,haptics_enabled,settings')
      .eq('user_id', playerOne!.id)
      .single();
    if (feedbackSettingsError) throw feedbackSettingsError;
    expect(feedbackSettings.keyboard_sound_profile).toBe('mechanical');
    expect(feedbackSettings.haptics_enabled).toBe(true);
    expect(feedbackSettings.settings).toMatchObject({ schemaVersion: 1 });
    await event('feedback_preferences_verified', {
      scenarioId: feedbackScenarioId,
      soundProfile: feedbackSettings.keyboard_sound_profile,
      hapticsEnabled: feedbackSettings.haptics_enabled,
      legacyJsonPreserved: true,
    });

    await firstPage.goto(`${baseURL}/profile`);

    await firstPage.getByRole('button', { name: 'CREATE CUSTOM ACCENT' }).click();
    const createAccentDialog = firstPage.getByRole('dialog', {
      name: 'Create custom accent',
    });
    await createAccentDialog.getByLabel('Hex').fill('#121826');
    await createAccentDialog.getByLabel(/Name/).fill('E2E Midnight');
    await createAccentDialog.getByRole('button', { name: 'SAVE AND USE' }).click();
    await expect(createAccentDialog).toBeHidden();
    await expect(firstPage.locator('html')).toHaveAttribute('data-accent', 'custom');
    const { data: savedAccentPreset, error: savedAccentPresetError } = await admin
      .from('public_profile_accent_presets')
      .select('preset_id,name,accent_hex,user_id')
      .eq('user_id', playerOne!.id)
      .eq('name', 'E2E Midnight')
      .single();
    if (savedAccentPresetError) throw savedAccentPresetError;
    accentPresetIds.push(savedAccentPreset.preset_id);
    await appendJson(resourcesPath, {
      at: new Date().toISOString(),
      kind: 'public_profile_accent_preset',
      id: savedAccentPreset.preset_id,
      owner: runId,
      userId: playerOne!.id,
      disposable: true,
    });
    expect(savedAccentPreset).toMatchObject({
      name: 'E2E Midnight',
      accent_hex: '#121826',
      user_id: playerOne!.id,
    });
    const anonymousProfileClient = createClient<Database>(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: publicAccentProjection, error: publicAccentProjectionError } =
      await anonymousProfileClient.rpc('get_public_player_profile_v2', {
        p_public_profile_id: savedProfile.public_profile_id,
      });
    if (publicAccentProjectionError) throw publicAccentProjectionError;
    expect(publicAccentProjection[0]?.accent_hex).toBe('#121826');
    expect(JSON.stringify(publicAccentProjection)).not.toMatch(/preset|user_id|email/i);

    const isolatedAccentClient = createClient<Database>(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: isolatedAccentSignInError } = await isolatedAccentClient.auth.signInWithPassword(
      {
        email: playerTwo!.email,
        password: playerTwo!.password,
      },
    );
    if (isolatedAccentSignInError) throw isolatedAccentSignInError;
    const { data: isolatedAccentList, error: isolatedAccentListError } =
      await isolatedAccentClient.rpc('list_my_accent_presets_v2');
    if (isolatedAccentListError) throw isolatedAccentListError;
    expect(isolatedAccentList).toHaveLength(0);
    const { data: isolatedDelete, error: isolatedDeleteError } = await isolatedAccentClient.rpc(
      'delete_my_accent_preset_v2',
      { p_preset_id: savedAccentPreset.preset_id },
    );
    if (isolatedDeleteError) throw isolatedDeleteError;
    expect(isolatedDelete[0]?.deleted).toBe(false);

    const cappedAccentClient = createClient<Database>(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: cappedAccentSignInError } = await cappedAccentClient.auth.signInWithPassword({
      email: spectator!.email,
      password: spectator!.password,
    });
    if (cappedAccentSignInError) throw cappedAccentSignInError;
    const capResults = await Promise.all(
      Array.from({ length: 25 }, async (_, index) => {
        const result = await cappedAccentClient.rpc('upsert_my_accent_preset_v2', {
          p_preset_id: null as unknown as string,
          p_name: `Cap ${String(index + 1).padStart(2, '0')}`,
          p_accent_hex: '#5848D8',
          p_select: false,
        });
        const created = result.data?.[0];
        if (created && !accentPresetIds.includes(created.preset_id)) {
          accentPresetIds.push(created.preset_id);
          await appendJson(resourcesPath, {
            at: new Date().toISOString(),
            kind: 'public_profile_accent_preset',
            id: created.preset_id,
            owner: runId,
            userId: spectator!.id,
            disposable: true,
            fixture: 'concurrent-cap-proof',
          });
        }
        return result;
      }),
    );
    expect(capResults.filter((result) => result.data?.length === 1)).toHaveLength(24);
    const capErrors = capResults.filter((result) => result.error);
    expect(capErrors).toHaveLength(1);
    expect(capErrors[0]?.error?.message).toMatch(/at most 24 accent presets/i);
    await event('custom_accent_authority_verified', {
      scenarioId: accentPresetScenarioId,
      ownerIsolation: true,
      concurrentSuccesses: 24,
      capRejections: 1,
    });

    const profileSyncContext = await browser.newContext(contextOptions);
    await profileSyncContext.addInitScript((correlationId) => {
      (
        window as typeof window & {
          __AMORDLE_E2E_RUN_ID__?: string;
        }
      ).__AMORDLE_E2E_RUN_ID__ = correlationId;
    }, runId);
    contexts.push(profileSyncContext);
    const profileSyncPage = await profileSyncContext.newPage();
    await signIn(profileSyncPage, playerOne!);
    await profileSyncPage.goto(`${baseURL}/settings`);
    await expect(profileSyncPage.getByLabel('Keyboard sound')).toHaveValue('mechanical');
    await expect(profileSyncPage.getByRole('checkbox', { name: 'Touch haptics' })).toBeChecked();
    await profileSyncPage.goto(`${baseURL}/profile`);
    await expect(profileSyncPage.getByRole('radio', { name: /E2E Midnight/i })).toBeChecked();
    await expect(profileSyncPage.locator('html')).toHaveAttribute('data-accent', 'custom');

    await spectatorPage.goto(`${baseURL}/players/${savedProfile.public_profile_id}`);
    await expect(spectatorPage.locator('.public-profile')).toContainText('E2E Operator');
    await expect(spectatorPage.locator('.public-profile')).toContainText(
      'V6.2 public profile proof.',
    );
    await expect(spectatorPage.locator('.public-profile')).toContainText('COMBAT player');
    await expect(
      spectatorPage.locator('.public-stat-grid').filter({ hasText: /completed\s*0/i }),
    ).toBeVisible();
    await expect(spectatorPage.locator('.profile-avatar')).toHaveAttribute(
      'style',
      /border-color:/i,
    );
    await expect(spectatorPage.locator('.public-profile')).toContainText('#121826 custom accent');
    await firstPage.goto(`${baseURL}/play/solo/practice/og?length=5`);
    const unknownKey = firstPage.getByRole('button', { name: 'A, unknown' });
    await expect(unknownKey).toBeVisible();
    const customKeyColors = await unknownKey.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, foreground: style.color };
    });
    expect(customKeyColors.background).not.toBe(customKeyColors.foreground);
    await firstPage.screenshot({
      path: path.join(evidenceDir, 'custom-accent-gameplay-desktop-dark.png'),
      fullPage: true,
    });
    await event('custom_accent_cross_device_and_gameplay_verified', {
      scenarioId: accentPresetScenarioId,
      presetId: savedAccentPreset.preset_id,
      accentHex: savedAccentPreset.accent_hex,
      publicProjectionSanitized: true,
      crossDevice: true,
    });

    await firstPage.goto(`${baseURL}/profile`);
    await firstPage.getByRole('button', { name: 'EDIT' }).click();
    const editAccentDialog = firstPage.getByRole('dialog', { name: 'Edit custom accent' });
    await editAccentDialog.getByRole('button', { name: 'DELETE PRESET' }).click();
    await editAccentDialog.getByRole('button', { name: 'CONFIRM DELETE' }).click();
    await expect(editAccentDialog).toBeHidden();
    await expect(firstPage.getByRole('radio', { name: 'Aurora' })).toBeChecked();
    await expect(firstPage.locator('html')).toHaveAttribute('data-accent', 'aurora');
    await profileSyncPage.reload();
    await expect(profileSyncPage.getByRole('radio', { name: 'Aurora' })).toBeChecked();
    await expect(profileSyncPage.getByText('E2E Midnight', { exact: true })).toHaveCount(0);
    const { data: deletedAccentPreset, error: deletedAccentPresetError } = await admin
      .from('public_profile_accent_presets')
      .select('preset_id')
      .eq('preset_id', savedAccentPreset.preset_id)
      .maybeSingle();
    if (deletedAccentPresetError) throw deletedAccentPresetError;
    expect(deletedAccentPreset).toBeNull();
    await event('custom_accent_delete_fallback_verified', {
      scenarioId: accentPresetScenarioId,
      presetId: savedAccentPreset.preset_id,
      fallback: 'aurora',
      crossDevice: true,
    });

    await firstPage.screenshot({
      path: path.join(evidenceDir, 'account-profile-desktop-light.png'),
      fullPage: true,
    });
    await secondPage.goto(`${baseURL}/profile`);
    await expect(secondPage.getByText('E2E Midnight', { exact: true })).toHaveCount(0);
    await secondPage.getByLabel('Player name').fill('E2E Player Two');
    await secondPage.getByLabel('Flair').selectOption('daily');
    await secondPage.getByText('Cyan', { exact: true }).click();
    await expect(secondPage.getByRole('radio', { name: 'Cyan' })).toBeChecked();
    await secondPage.getByRole('button', { name: 'SAVE PROFILE' }).click();
    await expect(secondPage.getByText('Profile saved.')).toBeVisible();
    const { data: secondProfile, error: secondProfileError } = await admin
      .from('public_player_profiles')
      .select('public_profile_id')
      .eq('user_id', playerTwo!.id)
      .single();
    if (secondProfileError) throw secondProfileError;

    expect(definitionSourceRequests).toBe(0);
    await spectatorPage.goto(`${baseURL}/words?length=5&q=abuse`);
    await spectatorPage.getByRole('option', { name: /^abuse\b/i }).click();
    const wordDialog = spectatorPage.getByRole('dialog', { name: 'ABUSE' });
    await expect(wordDialog).toContainText('A verified hosted definition for abuse.');
    await expect(wordDialog).toContainText('Free Dictionary API');
    expect(definitionSourceRequests).toBe(1);
    await wordDialog.getByRole('button', { name: 'Close word details' }).click();
    const cachedDefinitionPage = await spectatorContext.newPage();
    await cachedDefinitionPage.goto(`${baseURL}/words?length=5&q=abuse`);
    await cachedDefinitionPage.getByRole('option', { name: /^abuse\b/i }).click();
    const cachedWordDialog = cachedDefinitionPage.getByRole('dialog', { name: 'ABUSE' });
    await expect(cachedWordDialog).toContainText('A verified hosted definition for abuse.');
    await expect(cachedWordDialog).toContainText('Free Dictionary API · cached');
    expect(definitionSourceRequests).toBe(1);
    await cachedDefinitionPage.close();
    await event('definition_surfaces_verified', {
      scenarioId: definitionScenarioId,
      word: 'abuse',
      userTriggered: true,
      sourceRequests: definitionSourceRequests,
      persistentCacheHit: true,
    });

    await firstPage.goto(`${baseURL}/players`);
    await event('public_directory_opened', { scenarioId: publicCommunityScenarioId });
    await firstPage
      .getByRole('searchbox', { name: 'Player name' })
      .fill('E2E Player', { timeout: 15_000 });
    await firstPage.getByRole('button', { name: 'APPLY' }).click({ timeout: 15_000 });
    await event('public_directory_filtered', { scenarioId: publicCommunityScenarioId });
    await firstPage
      .getByRole('link', { name: "Open E2E Player Two's profile", exact: true })
      .click({ timeout: 15_000 });
    await expect(firstPage).toHaveURL(`${baseURL}/players/${secondProfile.public_profile_id}`);
    await expect(firstPage.getByText('Daily player', { exact: true })).toBeVisible();
    await event('public_profile_challenge_opened', { scenarioId: publicCommunityScenarioId });
    await firstPage
      .getByRole('combobox', { name: 'Mode', exact: true })
      .selectOption('go', { timeout: 15_000 });
    await firstPage
      .getByRole('spinbutton', { name: 'Word length', exact: true })
      .fill('7', { timeout: 15_000 });
    await firstPage
      .getByRole('combobox', { name: 'Puzzles', exact: true })
      .selectOption('7', { timeout: 15_000 });
    await firstPage.getByRole('combobox', { name: 'Clock', exact: true }).selectOption('300000', {
      timeout: 15_000,
    });
    await firstPage
      .getByRole('checkbox', { name: 'Hard Mode', exact: true })
      .check({ timeout: 15_000 });
    await event('private_challenge_configured', { scenarioId: publicCommunityScenarioId });
    await firstPage
      .getByRole('button', { name: 'SEND PRIVATE REQUEST' })
      .click({ timeout: 15_000 });
    await expect(firstPage.getByText('Private request sent to E2E Player Two.')).toBeVisible({
      timeout: 15_000,
    });
    await event('private_challenge_sent', { scenarioId: publicCommunityScenarioId });
    const { data: privateRequest, error: privateRequestError } = await admin
      .from('multiplayer_private_match_requests')
      .select('id,go_puzzle_count,hard_mode,mode,time_limit_ms,word_length')
      .eq('requester_user_id', playerOne!.id)
      .eq('opponent_user_id', playerTwo!.id)
      .single();
    if (privateRequestError) throw privateRequestError;
    expect(privateRequest).toMatchObject({
      go_puzzle_count: 7,
      hard_mode: true,
      mode: 'go',
      time_limit_ms: 300_000,
      word_length: 7,
    });
    privateRequestIds.push(privateRequest.id);
    await appendJson(resourcesPath, {
      at: new Date().toISOString(),
      kind: 'private_match_request',
      id: privateRequest.id,
      owner: runId,
      participantIds: [playerOne!.id, playerTwo!.id],
      disposable: true,
    });
    await secondPage.goto(`${baseURL}/combat/lobby`);
    await expect(secondPage.locator('.request-row')).toContainText('E2E Operator', {
      timeout: 15_000,
    });
    await expect(
      secondPage.getByRole('button', { name: /Notifications, [1-9]\d* unread/i }),
    ).toBeVisible({ timeout: 15_000 });
    await secondPage.getByRole('button', { name: /Notifications/i }).click();
    await expect(
      secondPage.getByRole('dialog', { name: 'Notifications' }).getByText('Private match request'),
    ).toBeVisible();
    await secondPage
      .getByRole('dialog', { name: 'Notifications' })
      .getByRole('button', { name: 'Mark all read' })
      .click();
    await secondPage.getByRole('button', { name: 'Notifications', exact: true }).click();
    await secondPage.getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(secondPage).toHaveURL(/\/combat\/match\/amordle-private-v3-/);
    const privateGameId = new URL(secondPage.url()).pathname.split('/').at(-1);
    if (!privateGameId) throw new Error('Accepted private match ID was unavailable.');
    await registerGame(privateGameId, 'private-request-v3', [playerOne!.id, playerTwo!.id], true);
    const { data: acceptedPrivateRequest, error: acceptedPrivateRequestError } = await admin
      .from('multiplayer_private_match_requests')
      .select('status,created_game_id')
      .eq('id', privateRequest.id)
      .single();
    if (acceptedPrivateRequestError) throw acceptedPrivateRequestError;
    expect(acceptedPrivateRequest).toMatchObject({
      status: 'created',
      created_game_id: privateGameId,
    });
    await secondPage.goto(`${baseURL}/combat/match/${privateGameId}`);
    await expect(secondPage.locator('#combat-heading')).toBeVisible({ timeout: 15_000 });
    secondPage.once('dialog', (dialog) => void dialog.accept());
    await secondPage.getByRole('button', { name: 'CANCEL BEFORE PLAY' }).click();
    await expect(secondPage.locator('.combat-turn-state')).toHaveText(/match complete/i, {
      timeout: 15_000,
    });
    await event('private_request_notification_verified', {
      requestId: privateRequest.id,
      createdGameId: privateGameId,
      acceptedThroughUi: true,
      persistentReadState: true,
    });

    await firstPage.emulateMedia({ colorScheme: 'dark' });
    await firstPage.goto(`${baseURL}/settings`);
    await expect(firstPage.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await expect(firstPage.locator('.skeleton-stack')).toHaveCount(0);
    await firstPage.screenshot({
      path: path.join(evidenceDir, 'account-settings-desktop-dark.png'),
      fullPage: true,
    });
    await secondPage.setViewportSize({ width: 390, height: 844 });
    await secondPage.emulateMedia({ colorScheme: 'light' });
    await secondPage.goto(`${baseURL}/stats`);
    await expect(secondPage.getByRole('heading', { name: 'Your stats' })).toBeVisible();
    await expect(secondPage.locator('.skeleton-stack')).toHaveCount(0);
    await expect(
      secondPage.locator('.stats-metric').filter({ hasText: /^xp\s*375$/i }),
    ).toBeVisible();
    await expect(
      secondPage.locator('.stats-metric').filter({ hasText: /daily streak\s*5/i }),
    ).toBeVisible();
    await expect(secondPage.getByRole('button', { name: 'Account' })).toBeVisible();
    await secondPage.screenshot({
      path: path.join(evidenceDir, 'account-stats-mobile-light.png'),
      fullPage: true,
    });
    await secondPage.goto(`${baseURL}/history`);
    await expect(secondPage.getByRole('heading', { name: 'History' })).toBeVisible();
    await expect(secondPage.locator('.skeleton-stack')).toHaveCount(0);
    await expect(secondPage.getByText(/solo daily · OG/i)).toBeVisible();
    await secondPage.screenshot({
      path: path.join(evidenceDir, 'account-history-mobile-light.png'),
      fullPage: true,
    });
    await spectatorPage.setViewportSize({ width: 390, height: 844 });
    await spectatorPage.emulateMedia({ colorScheme: 'dark' });
    await spectatorPage.goto(`${baseURL}/stats`);
    await expect(spectatorPage.locator('.skeleton-stack')).toHaveCount(0);
    await expect(
      spectatorPage.locator('.stats-metric').filter({ hasText: /completed\s*0/i }),
    ).toBeVisible();
    await expect(spectatorPage.getByText(/No completed games yet/i)).toBeVisible();
    await spectatorPage.goto(`${baseURL}/history`);
    await expect(spectatorPage.locator('.skeleton-stack')).toHaveCount(0);
    await expect(
      spectatorPage.getByText(/Completed signed-in games will appear here/i),
    ).toBeVisible();
    await spectatorPage.goto(`${baseURL}/leaderboards`);
    await expect(spectatorPage.getByRole('heading', { name: 'Leaderboards' })).toBeVisible();
    await expect(spectatorPage.locator('.skeleton-stack')).toHaveCount(0);
    await spectatorPage.screenshot({
      path: path.join(evidenceDir, 'account-leaderboard-mobile-dark.png'),
      fullPage: true,
    });
    await event('account_visual_evidence_captured', { screenshots: 5 });

    await secondPage.goto(
      `${baseURL}/play/solo/practice/og?length=5&difficulty=standard&generation=91`,
    );
    const publicBank = JSON.parse(
      await readFile(path.resolve('data/word-lists/words_length_5.json'), 'utf8'),
    ) as { answers: string[]; validGuesses: string[] };
    const rankedAnswers = publicBank.answers.map((word) => ({ word }));
    const ownerDigest = createHash('sha256').update(playerTwo!.id).digest('hex').slice(0, 24);
    const soloAnswer = selectPracticeAnswers({
      answers: rankedAnswers,
      difficulty: 'standard',
      count: 1,
      ownerNamespace: `account:${ownerDigest}`,
      mode: 'og',
      length: 5,
      generation: 91,
    })[0]!;
    const answerWords = new Set(publicBank.answers);
    const safeWrongGuess = publicBank.validGuesses.find((word) => !answerWords.has(word));
    if (!safeWrongGuess) throw new Error('A guaranteed non-answer Solo guess was unavailable.');
    await submitOnScreenGuess(secondPage, safeWrongGuess);
    await expect(secondPage.getByText(/account backup needs attention/i)).toHaveCount(0);
    await expect
      .poll(async () => {
        const { count, error } = await admin
          .from('game_history')
          .select('id', { count: 'exact', head: true })
          .eq('id', `amordle-account-state-v1:${playerTwo!.id}`)
          .eq('user_id', playerTwo!.id);
        if (error) throw error;
        return count;
      })
      .toBe(1);
    const { data: legacyAfter, error: legacyAfterError } = await admin
      .from('progress_snapshots')
      .select('progress')
      .eq('user_id', playerTwo!.id)
      .single();
    if (legacyAfterError) throw legacyAfterError;
    expect(legacyAfter.progress).toEqual(legacySnapshot);
    await event('legacy_account_continuity_verified', {
      userId: playerTwo!.id,
      sourceSnapshotPreserved: true,
      successorStateCreated: true,
    });

    await submitOnScreenGuess(secondPage, soloAnswer);
    await expect(secondPage.getByRole('heading', { name: 'You solved it' })).toBeVisible();
    await expect(secondPage.locator('.word-definition')).toContainText(
      `A verified hosted definition for ${soloAnswer}.`,
    );
    await expect(secondPage.getByText(/History, XP, and coins are synced/i)).toBeVisible({
      timeout: 15_000,
    });
    const soloHistoryIdPrefix = 'solo:practice:og:5:standard:normal:1:91:';
    await expect
      .poll(async () => {
        const { data, error } = await admin
          .from('game_history')
          .select('id')
          .eq('user_id', playerTwo!.id)
          .like('id', `${soloHistoryIdPrefix}%`);
        if (error) throw error;
        return data.length;
      })
      .toBe(1);
    const completionState = async () => {
      const [{ data: state, error: stateError }, { data: economy, error: economyError }] =
        await Promise.all([
          admin
            .from('game_history')
            .select('entry')
            .eq('id', `amordle-account-state-v1:${playerTwo!.id}`)
            .eq('user_id', playerTwo!.id)
            .single(),
          admin.from('player_economy_state').select('coins').eq('user_id', playerTwo!.id).single(),
        ]);
      if (stateError) throw stateError;
      if (economyError) throw economyError;
      const entry = state.entry as Record<string, Json>;
      const progress = entry.progress as Record<string, Json>;
      return { xp: Number(progress.xp), coins: economy.coins };
    };
    await expect.poll(async () => (await completionState()).xp).toBeGreaterThan(375);
    const firstCompletionState = await completionState();
    expect(firstCompletionState.coins).toBeGreaterThan(0);

    await secondPage.reload();
    await secondPage.goto(`${baseURL}/history`);
    await expect(secondPage.getByText(/solo practice · OG/i)).toHaveCount(1);
    await secondPage.getByRole('button', { name: 'Definition', exact: true }).click();
    const historyDefinitionDialog = secondPage.getByRole('dialog', {
      name: 'Completed game definitions',
    });
    await expect(historyDefinitionDialog).toContainText(soloAnswer.toUpperCase());
    await expect(historyDefinitionDialog).toContainText(
      `A verified hosted definition for ${soloAnswer}.`,
    );
    await historyDefinitionDialog.getByRole('button', { name: 'Close definitions' }).click();
    await event('terminal_and_history_definitions_verified', {
      scenarioId: definitionScenarioId,
      word: soloAnswer,
      terminalResult: true,
      persistedHistoryV3: true,
    });
    await secondPage.goto(`${baseURL}/stats`);
    await expect(
      secondPage.locator('.stats-metric').filter({ hasText: /completed\s*2/i }),
    ).toBeVisible();
    const repeatedCompletionState = await completionState();
    expect(repeatedCompletionState).toEqual(firstCompletionState);
    await event('solo_completion_continuity_verified', {
      userId: playerTwo!.id,
      historyRows: 1,
      idempotentReload: true,
    });

    await firstPage.setViewportSize({ width: 1440, height: 1024 });
    await firstPage.emulateMedia({ colorScheme: 'light' });
    await secondPage.setViewportSize({ width: 1440, height: 1024 });
    await secondPage.emulateMedia({ colorScheme: 'dark' });
    await spectatorPage.setViewportSize({ width: 1440, height: 1024 });
    await spectatorPage.emulateMedia({ colorScheme: 'light' });

    await firstPage.goto(`${baseURL}/`);
    await firstPage.getByRole('button', { name: 'Account' }).click();
    const accountMenu = firstPage.getByRole('menu', { name: 'Account' });
    await expect(accountMenu.getByText('Level')).toBeVisible();
    await expect(accountMenu.getByText('XP')).toBeVisible();
    await expect(accountMenu.getByText('Coins')).toBeVisible();
    await expect(accountMenu.getByRole('menuitem')).toHaveText([
      '› View Profile',
      '› Open Settings',
      '› Sign Out',
    ]);
    await accountMenu.getByRole('menuitem', { name: 'Open Settings', exact: true }).click();
    await expect(firstPage).toHaveURL(`${baseURL}/settings`);
    await firstPage.goto(`${baseURL}/`);
    await firstPage.getByRole('button', { name: 'Account' }).click();
    await firstPage.keyboard.press('Escape');

    await firstPage.goto(`${baseURL}/combat/practice?length=5`);
    await expect(firstPage.getByRole('heading', { name: 'Create or find a match' })).toBeVisible();
    await firstPage.getByRole('button', { name: 'Create public unranked' }).click();
    await expect(firstPage).toHaveURL(/\/combat\/match\/amordle-public-practice-v3-/);
    const gameId = new URL(firstPage.url()).pathname.split('/').at(-1);
    if (!gameId) throw new Error('Created game ID was missing from the canonical route.');
    await registerGame(gameId, 'public-practice-v3', [playerOne!.id, playerTwo!.id]);
    await event('public_practice_created', { gameId });
    await expect(firstPage.locator('.combat-turn-state')).toHaveText(/waiting for another player/i);
    await firstPage.screenshot({
      path: path.join(evidenceDir, 'combat-waiting-desktop-light.png'),
      fullPage: true,
    });
    await expect(
      firstPage.getByRole('button', { name: /Notifications, [1-9]\d* unread/i }),
    ).toBeVisible({ timeout: 15_000 });
    await firstPage.getByRole('button', { name: /Notifications/i }).click();
    const notificationDialog = firstPage.getByRole('dialog', { name: 'Notifications' });
    await expect(notificationDialog.getByText('Match ready').first()).toBeVisible();
    await notificationDialog.getByRole('button', { name: 'Mark all read' }).click();
    await expect(
      firstPage.getByRole('button', { name: 'Notifications', exact: true }),
    ).toBeVisible();
    await firstPage.getByRole('button', { name: 'Notifications', exact: true }).click();
    await firstPage.reload();
    await expect(
      firstPage.getByRole('button', { name: /Notifications(?:, \d+ unread)?/i }),
    ).toBeVisible({ timeout: 15_000 });

    await secondPage.goto(`${baseURL}/combat/lobby`);
    const targetRow = secondPage.locator(`[data-game-id="${gameId}"]`);
    await expect(targetRow).toBeVisible({ timeout: 15_000 });
    await expect(targetRow).toContainText(/Practice/i);
    await expect(targetRow).toContainText(/5 letters/i);
    await targetRow.getByRole('button', { name: 'Join' }).click();
    await expect(secondPage).toHaveURL(new RegExp(`/combat/match/${gameId}$`));
    await expect(secondPage.locator('.combat-turn-state')).toHaveText(/opponent’s turn/i);
    await secondPage.setViewportSize({ width: 390, height: 844 });
    const mobileKeyboardBox = await secondPage.locator('.keyboard').boundingBox();
    expect(mobileKeyboardBox).not.toBeNull();
    expect(mobileKeyboardBox!.y + mobileKeyboardBox!.height).toBeLessThanOrEqual(844);
    const mobileFit = await secondPage.evaluate(() => ({
      documentHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      visibleRouteRailCount: [
        ...document.querySelectorAll<HTMLElement>('.mobile-route-rail'),
      ].filter((rail) => {
        const style = window.getComputedStyle(rail);
        const bounds = rail.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          bounds.width > 0 &&
          bounds.height > 0
        );
      }).length,
    }));
    expect(mobileFit.documentHeight).toBeLessThanOrEqual(mobileFit.viewportHeight + 1);
    expect(mobileFit.visibleRouteRailCount).toBe(0);
    await expect(secondPage.locator('.combat-transcript-frame')).toBeVisible();
    await expect(secondPage.locator('.combat-transcript-entry')).toHaveCount(6);
    const turnStatusGeometry = await secondPage.evaluate(() => {
      const header = document.querySelector('.combat-game-status')?.getBoundingClientRect();
      const status = document.querySelector('.combat-turn-state')?.getBoundingClientRect();
      if (!header || !status) return null;
      return {
        visible:
          status.top >= header.top - 1 &&
          status.right <= header.right + 1 &&
          status.bottom <= header.bottom + 1 &&
          status.left >= header.left - 1,
      };
    });
    expect(turnStatusGeometry?.visible).toBe(true);
    const combatAxis = await secondPage.evaluate(() => {
      const frame = document.querySelector('.combat-transcript-frame')?.getBoundingClientRect();
      const row = document
        .querySelector('.combat-transcript-empty .board-row')
        ?.getBoundingClientRect();
      if (!frame || !row) return null;
      return Math.abs(frame.left + frame.width / 2 - (row.left + row.width / 2));
    });
    expect(combatAxis).not.toBeNull();
    expect(combatAxis!).toBeLessThanOrEqual(1);
    await secondPage.screenshot({
      path: path.join(evidenceDir, 'combat-active-mobile-dark.png'),
      fullPage: true,
    });
    await secondPage.setViewportSize({ width: 1440, height: 1024 });

    const { data: rawGame, error: gameError } = await admin
      .from('async_multiplayer_games')
      .select('projection')
      .eq('id', gameId)
      .single();
    if (gameError) throw gameError;
    const serializedPublicProjection = JSON.stringify(rawGame.projection);
    expect(serializedPublicProjection).not.toMatch(/answer|seed/i);
    for (const user of users) expect(serializedPublicProjection).not.toContain(user.id);
    const answer = await inspectAnswer(gameId);
    const bank = JSON.parse(
      await readFile(path.resolve('data/word-lists/words_length_5.json'), 'utf8'),
    ) as { answers: string[]; validGuesses: string[] };
    const guesses = [...bank.validGuesses, ...bank.answers]
      .map((word) => word.toLowerCase())
      .filter(
        (word, index, all) =>
          word !== answer && new Set(word).size === word.length && all.indexOf(word) === index,
      )
      .slice(0, 2);
    expect(guesses).toHaveLength(2);

    await firstPage.reload();
    await expect(firstPage.locator('.combat-turn-state')).toHaveText(/your turn/i, {
      timeout: 15_000,
    });
    await submitOnScreenGuess(firstPage, guesses[0]!);
    await waitForGameMoveCount(gameId, 1);
    await expect(firstPage.locator('.combat-turn-state')).toHaveText(/opponent’s turn/i);

    await secondPage.reload();
    await expect(secondPage.locator('.combat-turn-state')).toHaveText(/your turn/i, {
      timeout: 15_000,
    });
    for (const letter of new Set(guesses[0])) {
      await expect(
        secondPage.getByRole('button', {
          name: new RegExp(`^${letter}, (correct|present|absent)$`, 'i'),
        }),
      ).toBeVisible();
    }
    await expect(
      secondPage.locator('.combat-transcript-entry').first().locator('.combat-transcript-meta'),
    ).toContainText(/01\s*·\s*E2E Operator/i);
    await submitOnScreenGuess(secondPage, guesses[1]!);
    await waitForGameMoveCount(gameId, 2);

    await firstPage.reload();
    await expect(firstPage.locator('.combat-turn-state')).toHaveText(/your turn/i, {
      timeout: 15_000,
    });
    for (const letter of new Set([...guesses[0]!, ...guesses[1]!])) {
      await expect(
        firstPage.getByRole('button', {
          name: new RegExp(`^${letter}, (correct|present|absent)$`, 'i'),
        }),
      ).toBeVisible();
    }
    await firstPage.screenshot({
      path: path.join(evidenceDir, 'participant-refresh-recovery.png'),
      fullPage: true,
    });
    await event('alternating_turns_recovered', { gameId, acceptedMoves: 2 });

    const anonymous = createClient<Database>(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: publicDirectoryRows, error: publicDirectoryError } = await anonymous.rpc(
      'list_public_player_directory_v1',
      {
        p_bucket: 'multiplayer:og',
        p_limit: 50,
        p_offset: 0,
        p_search: 'E2E',
        p_sort: 'name',
      },
    );
    if (publicDirectoryError) throw publicDirectoryError;
    expect(publicDirectoryRows.length).toBeGreaterThanOrEqual(2);
    const serializedDirectory = JSON.stringify(publicDirectoryRows);
    expect(serializedDirectory).not.toMatch(/email|raw.?auth|user_id|avatar_url|bio/i);
    for (const user of users) expect(serializedDirectory).not.toContain(user.id);
    expect(Object.keys(publicDirectoryRows[0]!).sort()).toEqual(
      [
        'accent_color',
        'bucket',
        'display_name',
        'draws',
        'flair_key',
        'games_played',
        'losses',
        'profile_updated_at',
        'provisional',
        'public_profile_id',
        'rating',
        'rating_updated_at',
        'total_count',
        'wins',
      ].sort(),
    );
    const anonymousRaw = await anonymous
      .from('async_multiplayer_games')
      .select('projection')
      .eq('id', gameId);
    expect(anonymousRaw.data ?? []).toHaveLength(0);

    const spectatorClient = createClient<Database>(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: spectatorSignInError } = await spectatorClient.auth.signInWithPassword({
      email: spectator!.email,
      password: spectator!.password,
    });
    if (spectatorSignInError) throw spectatorSignInError;
    const { data: projection, error: projectionError } = await spectatorClient.rpc(
      'get_amordle_public_practice_spectator_v3',
      {
        p_game_id: gameId,
        p_limit: 1,
        p_terminal_window_seconds: 15,
      },
    );
    if (projectionError) throw projectionError;
    expect(projection).toHaveLength(1);
    const serializedProjection = JSON.stringify(projection);
    expect(serializedProjection).not.toContain(answer);
    for (const user of users) expect(serializedProjection).not.toContain(user.id);

    await spectatorPage.goto(`${baseURL}/combat/live`);
    const spectatorPanel = spectatorPage.locator('.spectator-game').first();
    await expect(spectatorPanel).toBeVisible({ timeout: 15_000 });
    await expect(spectatorPanel).toContainText('Public Practice');
    await expect(spectatorPage.getByRole('button', { name: /submit/i })).toHaveCount(0);
    await spectatorPage.screenshot({
      path: path.join(evidenceDir, 'combat-spectator-desktop-light.png'),
      fullPage: true,
    });
    await spectatorPanel.screenshot({
      path: path.join(evidenceDir, 'sanitized-spectator.png'),
    });
    await event('spectator_projection_verified', { gameId, canMutate: false });

    await submitOnScreenGuess(firstPage, answer);
    await waitForGameMoveCount(gameId, 3);
    await expect(firstPage.locator('.combat-turn-state')).toHaveText(/you won|match complete/i, {
      timeout: 15_000,
    });
    await firstPage.screenshot({
      path: path.join(evidenceDir, 'combat-result-rematch-desktop-light.png'),
      fullPage: true,
    });
    await event('combat_result_visual_captured', { gameId, terminalMoveCount: 3 });

    await secondPage.reload();
    await expect(secondPage.locator('.combat-turn-state')).toHaveText(
      /opponent won|you lost|match complete/i,
      {
        timeout: 15_000,
      },
    );
    await expect
      .poll(async () => {
        const { data, error } = await admin
          .from('game_history')
          .select('id,user_id')
          .in('id', [`combat:${gameId}:player-one`, `combat:${gameId}:player-two`]);
        if (error) throw error;
        return new Set(data.map((row) => row.user_id)).size;
      })
      .toBe(2);
    await firstPage.goto(`${baseURL}/history`);
    await expect(firstPage.getByText(/combat practice · OG/i)).toHaveCount(1);
    await secondPage.goto(`${baseURL}/stats`);
    await expect(
      secondPage.locator('.stats-metric').filter({ hasText: /completed\s*3/i }),
    ).toBeVisible();
    await event('combat_completion_continuity_verified', {
      gameId,
      participantHistoryRows: 2,
    });
    await spectatorPage.goto(`${baseURL}/players/${savedProfile.public_profile_id}`);
    await expect(
      spectatorPage.locator('.public-stat-grid').filter({ hasText: /completed\s*1/i }),
    ).toBeVisible({ timeout: 15_000 });
    await event('public_community_verified', {
      scenarioId: publicCommunityScenarioId,
      directorySearch: true,
      profileChallenge: true,
      publicStatsGamesCompleted: 1,
      directoryPrivateFieldsDenied: true,
    });

    await firstPage.goto(`${baseURL}/combat/match/${gameId}`);
    await expect(
      firstPage.getByRole('button', { name: /Notifications, [1-9]\d* unread/i }),
    ).toBeVisible({ timeout: 15_000 });
    await firstPage.getByRole('button', { name: /Notifications/i }).click();
    await expect(
      firstPage
        .getByRole('dialog', { name: 'Notifications' })
        .locator(`a[href="/combat/results/${gameId}"]`),
    ).toContainText('Match result');
    await firstPage
      .getByRole('dialog', { name: 'Notifications' })
      .getByRole('button', { name: 'Mark all read' })
      .click();
    await firstPage.getByRole('button', { name: 'REQUEST REMATCH' }).click();
    await expect(firstPage.getByText(/Rematch pending/i)).toBeVisible();
    const { data: rematchRow, error: rematchError } = await admin
      .from('multiplayer_practice_rematch_requests')
      .select('id')
      .eq('source_game_id', gameId)
      .single();
    if (rematchError) throw rematchError;
    rematchRequestIds.push(rematchRow.id);
    await appendJson(resourcesPath, {
      at: new Date().toISOString(),
      kind: 'practice_rematch_request',
      id: rematchRow.id,
      owner: runId,
      sourceGameId: gameId,
      disposable: true,
    });
    await secondPage.goto(`${baseURL}/combat/match/${gameId}`);
    await expect(secondPage.getByRole('button', { name: 'ACCEPT REMATCH' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      secondPage.getByRole('button', { name: /Notifications, [1-9]\d* unread/i }),
    ).toBeVisible({ timeout: 15_000 });
    await secondPage.getByRole('button', { name: /Notifications/i }).click();
    await expect(
      secondPage.getByRole('dialog', { name: 'Notifications' }).getByText('Rematch update'),
    ).toBeVisible();
    await secondPage.getByRole('button', { name: /Notifications/i }).click();
    await secondPage.getByRole('button', { name: 'ACCEPT REMATCH' }).click();
    await expect(secondPage).toHaveURL(/\/combat\/match\/amordle-rematch-v3-/);
    const rematchGameId = new URL(secondPage.url()).pathname.split('/').at(-1);
    if (!rematchGameId) throw new Error('Accepted rematch game ID was unavailable.');
    await registerGame(rematchGameId, 'rematch-v3', [playerOne!.id, playerTwo!.id], true);
    const { data: createdRematch, error: createdRematchError } = await admin
      .from('multiplayer_practice_rematch_requests')
      .select('status,created_game_id')
      .eq('id', rematchRow.id)
      .single();
    if (createdRematchError) throw createdRematchError;
    expect(createdRematch).toMatchObject({
      status: 'created',
      created_game_id: rematchGameId,
    });
    secondPage.once('dialog', (dialog) => void dialog.accept());
    await secondPage.getByRole('button', { name: 'CANCEL BEFORE PLAY' }).click();
    await expect(secondPage.locator('.combat-turn-state')).toHaveText(/match complete/i, {
      timeout: 15_000,
    });
    await event('notification_transitions_verified', {
      scenarioId: publicPrivateScenarioId,
      transitions: ['match', 'turn', 'result', 'rematch'],
      rematchGameId,
      rematchAcceptedThroughUi: true,
      persistentReadState: true,
    });
  });

  test('proves ranked Practice and all four Daily lanes through player UI', async ({ browser }) => {
    test.setTimeout(300_000);
    await event('hosted_scenario_started', { scenarioId: rankedDailyScenarioId });
    const [playerOne, playerTwo] = users;
    expect(playerOne).toBeDefined();
    expect(playerTwo).toBeDefined();
    const contextOptions = {
      baseURL,
      storageState: bypassStorageState,
      serviceWorkers: 'allow' as const,
    };
    const firstContext = await browser.newContext(contextOptions);
    const secondContext = await browser.newContext(contextOptions);
    for (const context of [firstContext, secondContext]) {
      await context.addInitScript((correlationId) => {
        (
          window as typeof window & {
            __AMORDLE_E2E_RUN_ID__?: string;
          }
        ).__AMORDLE_E2E_RUN_ID__ = correlationId;
      }, runId);
    }
    contexts.push(firstContext, secondContext);
    const firstPage = await firstContext.newPage();
    const secondPage = await secondContext.newPage();
    await signIn(firstPage, playerOne!);
    await signIn(secondPage, playerTwo!);
    await firstPage.setViewportSize({ width: 1440, height: 1024 });
    await secondPage.setViewportSize({ width: 1440, height: 1024 });

    await firstPage.goto(`${baseURL}/combat/practice?length=35`);
    await firstPage.getByLabel('Ranked clock').selectOption('300000');
    await firstPage.getByRole('button', { name: 'Find ranked match' }).click();
    const rankedPracticeOne = await registerLatestQueueRequest(playerOne!, 'practice', 'og');
    await expect(firstPage.getByRole('status')).toContainText(/OG · 35 letters · standard · 5:00/i);
    await firstPage.reload();
    await expect(firstPage.getByText(/Restored your ranked search/i)).toBeVisible({
      timeout: 15_000,
    });

    await secondPage.goto(`${baseURL}/combat/practice?length=35`);
    await secondPage.getByLabel('Ranked clock').selectOption('300000');
    await secondPage.getByRole('button', { name: 'Find ranked match' }).click();
    const rankedPracticeTwo = await registerLatestQueueRequest(playerTwo!, 'practice', 'og');
    await expect(firstPage).toHaveURL(/\/combat\/match\//, { timeout: 30_000 });
    await expect(secondPage).toHaveURL(/\/combat\/match\//, { timeout: 30_000 });
    const rankedPracticeGameId = new URL(firstPage.url()).pathname.split('/').at(-1);
    expect(rankedPracticeGameId).toBe(new URL(secondPage.url()).pathname.split('/').at(-1));
    if (!rankedPracticeGameId) throw new Error('Ranked Practice game ID was unavailable.');
    await registerGame(rankedPracticeGameId, 'ranked-practice-v2', [playerOne!.id, playerTwo!.id]);
    await expect(firstPage.locator('.combat-turn-state')).toHaveText(/your turn/i);
    await expect(firstPage.getByLabel(/player one time remaining/i)).toBeVisible();
    await expect(firstPage.getByLabel(/player two time remaining/i)).toBeVisible();
    const rankedPracticeAnswer = await inspectAnswer(rankedPracticeGameId);
    await submitOnScreenGuess(firstPage, rankedPracticeAnswer);
    await expect(firstPage.locator('.combat-turn-state')).toHaveText(/you won|match complete/i, {
      timeout: 15_000,
    });
    await firstPage.getByRole('button', { name: 'UPDATE RATING' }).click();
    await expect(firstPage.locator('p.mono[role="status"]')).toContainText(/RATING \d+ → \d+/i);
    await secondPage.reload();
    await expect(secondPage.locator('.combat-turn-state')).toHaveText(
      /opponent won|match complete/i,
      { timeout: 15_000 },
    );
    await secondPage.getByRole('button', { name: 'UPDATE RATING' }).click();
    await expect(secondPage.locator('p.mono[role="status"]')).toContainText(/RATING \d+ → \d+/i);
    await expect
      .poll(async () => {
        const { data, error } = await admin
          .from('multiplayer_match_results')
          .select('id')
          .eq('source_match_id', rankedPracticeGameId);
        if (error) throw error;
        return data.length;
      })
      .toBe(1);
    const { data: practiceResult, error: practiceResultError } = await admin
      .from('multiplayer_match_results')
      .select('id')
      .eq('source_match_id', rankedPracticeGameId)
      .single();
    if (practiceResultError) throw practiceResultError;
    const [
      { data: practicePlayers, error: practicePlayersError },
      { data: practiceTransactions, error: practiceTransactionsError },
    ] = await Promise.all([
      admin
        .from('multiplayer_player_results')
        .select('user_id')
        .eq('match_result_id', practiceResult.id),
      admin
        .from('multiplayer_rating_transactions')
        .select('user_id,rating_delta')
        .eq('match_result_id', practiceResult.id),
    ]);
    if (practicePlayersError) throw practicePlayersError;
    if (practiceTransactionsError) throw practiceTransactionsError;
    expect(practicePlayers).toHaveLength(2);
    expect(practiceTransactions).toHaveLength(2);
    expect(practiceTransactions.reduce((sum, row) => sum + row.rating_delta, 0)).toBe(0);
    await event('ranked_practice_hosted_verified', {
      gameId: rankedPracticeGameId,
      requestIds: [rankedPracticeOne.id, rankedPracticeTwo.id],
      timed: true,
      resultCount: 1,
      playerResultCount: 2,
      ratingTransactionCount: 2,
    });

    await firstPage.goto(`${baseURL}/combat/practice?length=7`);
    await firstPage.getByLabel('Mode', { exact: true }).selectOption('go');
    await firstPage.getByLabel('Puzzles').selectOption('10');
    await firstPage.getByRole('button', { name: 'Find ranked match' }).click();
    const cancelledGoPractice = await registerLatestQueueRequest(playerOne!, 'practice', 'go');
    await expect(firstPage.getByRole('status')).toContainText(
      /GO · 7 letters · standard · untimed/i,
    );
    await firstPage.getByRole('button', { name: 'Cancel search' }).click();
    await expect(firstPage.getByText(/Ranked search cancelled/i)).toBeVisible();
    await expect
      .poll(async () => {
        const { data, error } = await admin
          .from('multiplayer_matchmaking_queue')
          .select('status')
          .eq('id', cancelledGoPractice.id)
          .single();
        if (error) throw error;
        return data.status;
      })
      .toBe('cancelled');
    await event('ranked_practice_go_cancel_verified', {
      requestId: cancelledGoPractice.id,
      puzzles: 10,
      untimed: true,
    });

    for (const mode of ['og', 'go'] as const) {
      await firstPage.goto(`${baseURL}/combat/daily`);
      await firstPage.getByLabel('Mode', { exact: true }).selectOption(mode);
      await firstPage.getByRole('button', { name: 'Create Daily lobby' }).click();
      await expect(firstPage).toHaveURL(/\/combat\/match\//);
      const unrankedDailyGameId = new URL(firstPage.url()).pathname.split('/').at(-1);
      if (!unrankedDailyGameId) throw new Error(`Unranked Daily ${mode} game ID was unavailable.`);
      await registerGame(unrankedDailyGameId, `unranked-daily-${mode}-v2`, [
        playerOne!.id,
        playerTwo!.id,
      ]);

      await secondPage.goto(`${baseURL}/combat/daily`);
      await secondPage.getByLabel('Mode', { exact: true }).selectOption(mode);
      const dailyLobbyRow = secondPage.locator('.data-row').filter({ hasText: 'E2E Operator' });
      await expect(dailyLobbyRow).toBeVisible({ timeout: 15_000 });
      await dailyLobbyRow.getByRole('button', { name: 'Join' }).click();
      await expect(secondPage).toHaveURL(new RegExp(`/combat/match/${unrankedDailyGameId}$`));
      await expect(firstPage.locator('.combat-turn-state')).toHaveText(/your turn/i, {
        timeout: 15_000,
      });
      firstPage.once('dialog', (dialog) => void dialog.accept());
      await firstPage.getByRole('button', { name: 'CANCEL BEFORE PLAY' }).click();
      await expect(firstPage.locator('.combat-turn-state')).toHaveText(/match complete/i, {
        timeout: 15_000,
      });
      await event('unranked_daily_lane_verified', {
        gameId: unrankedDailyGameId,
        mode,
        dailyDateKey: new Date().toISOString().slice(0, 10),
        clockFree: true,
      });
    }

    await firstPage.goto(`${baseURL}/combat/daily`);
    await firstPage.getByLabel('Mode', { exact: true }).selectOption('og');
    await firstPage.getByLabel('Hard Mode').check();
    await firstPage.getByRole('button', { name: 'Find ranked Daily' }).click();
    const rankedDailyOne = await registerLatestQueueRequest(playerOne!, 'daily', 'og');
    await firstPage.reload();
    await expect(firstPage.getByText(/Restored your ranked Daily search/i)).toBeVisible({
      timeout: 15_000,
    });

    await secondPage.goto(`${baseURL}/combat/daily`);
    await secondPage.getByLabel('Mode', { exact: true }).selectOption('og');
    await secondPage.getByLabel('Hard Mode').check();
    await secondPage.getByRole('button', { name: 'Find ranked Daily' }).click();
    const rankedDailyTwo = await registerLatestQueueRequest(playerTwo!, 'daily', 'og');
    await expect(firstPage).toHaveURL(/\/combat\/match\//, { timeout: 30_000 });
    await expect(secondPage).toHaveURL(/\/combat\/match\//, { timeout: 30_000 });
    const rankedDailyGameId = new URL(firstPage.url()).pathname.split('/').at(-1);
    expect(rankedDailyGameId).toBe(new URL(secondPage.url()).pathname.split('/').at(-1));
    if (!rankedDailyGameId) throw new Error('Ranked Daily game ID was unavailable.');
    await registerGame(rankedDailyGameId, 'ranked-daily-v3', [playerOne!.id, playerTwo!.id]);
    rankedDailyGameIds.push(rankedDailyGameId);
    await expect
      .poll(
        async () => {
          const states = await Promise.all(
            [firstPage, secondPage].map((page) => page.locator('.combat-turn-state').textContent()),
          );
          return states.filter((state) => /your turn/i.test(state ?? '')).length;
        },
        { timeout: 15_000 },
      )
      .toBe(1);
    const firstPlayerStarts = /your turn/i.test(
      (await firstPage.locator('.combat-turn-state').textContent()) ?? '',
    );
    const openingPage = firstPlayerStarts ? firstPage : secondPage;
    const respondingPage = firstPlayerStarts ? secondPage : firstPage;
    await expect(firstPage.getByLabel(/time remaining/i)).toHaveCount(0);
    await expect(secondPage.getByLabel(/time remaining/i)).toHaveCount(0);
    await submitOnScreenGuess(openingPage, 'crane');
    await waitForGameMoveCount(rankedDailyGameId, 1);
    if ((await openingPage.getByRole('button', { name: 'UPDATE RATING' }).count()) === 0) {
      await respondingPage.reload();
      await expect(respondingPage.locator('.combat-turn-state')).toHaveText(/your turn/i, {
        timeout: 15_000,
      });
      respondingPage.once('dialog', (dialog) => void dialog.accept());
      await respondingPage.getByRole('button', { name: 'FORFEIT MATCH' }).click();
    }
    await Promise.all([firstPage.reload(), secondPage.reload()]);
    await expect(firstPage.getByRole('button', { name: 'UPDATE RATING' })).toBeVisible({
      timeout: 15_000,
    });
    await firstPage.getByRole('button', { name: 'UPDATE RATING' }).click();
    await expect(firstPage.locator('p.mono[role="status"]')).toContainText(/RATING \d+ → \d+/i);
    await secondPage.reload();
    await secondPage.getByRole('button', { name: 'UPDATE RATING' }).click();
    await expect(secondPage.locator('p.mono[role="status"]')).toContainText(/RATING \d+ → \d+/i);
    await expect
      .poll(async () => {
        const { data, error } = await admin
          .from('multiplayer_match_results')
          .select('id')
          .eq('source_match_id', rankedDailyGameId);
        if (error) throw error;
        return data.length;
      })
      .toBe(1);
    // W-11 partial coverage — read this before trusting it.
    //
    // The defect was in the `multiplayer:og`/`multiplayer:go` -> storage mapping, which
    // pointed at the pre-v2 `async:og`/`async:go` buckets that the v3 combat authority
    // never writes. Proving that end-to-end needs a settled *untimed* ranked Practice
    // match, and this suite settles only a timed Practice match (a lane deliberately
    // excluded from the leaderboard) and a ranked Daily match (whose mapping was
    // already correct). So these assertions do NOT by themselves prove W-11 fixed.
    //
    // What they do prove: every accepted lane resolves without error, and a rating
    // that just settled is reachable through the public projection with a non-null
    // bucket. Full W-11 coverage needs an untimed ranked Practice settlement, which is
    // recorded as an open evidence gap rather than implied here.
    {
      const leaderboardClient = createClient<Database>(supabaseUrl, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${playerOne!.accessToken}` } },
      });
      const lanes = [
        'multiplayer:og',
        'multiplayer:go',
        'multiplayer:og:daily:v1',
        'multiplayer:go:daily:v1',
      ] as const;
      for (const lane of lanes) {
        const { error: laneError } = await leaderboardClient.rpc(
          'get_public_ranked_leaderboard_v2',
          { p_bucket: lane, p_limit: 50, p_offset: 0 },
        );
        if (laneError)
          throw new Error(`Leaderboard lane ${lane} was rejected: ${laneError.message}`);
      }

      // The settled ranked Daily OG rating must actually surface in its lane.
      const { data: settledProfiles, error: settledProfilesError } = await admin
        .from('multiplayer_rating_profiles')
        .select('user_id,bucket,games_played')
        .eq('user_id', playerOne!.id)
        .eq('bucket', 'async:og:daily:v1');
      if (settledProfilesError) throw settledProfilesError;
      expect(settledProfiles, 'ranked Daily OG rating profile exists').toHaveLength(1);

      const { data: dailyBoard, error: dailyBoardError } = await leaderboardClient.rpc(
        'get_public_ranked_leaderboard_v2',
        { p_bucket: 'multiplayer:og:daily:v1', p_limit: 100, p_offset: 0 },
      );
      if (dailyBoardError) throw dailyBoardError;
      // Every returned row resolves to the requested lane rather than a null bucket,
      // which is precisely what the pre-v2 mapping produced.
      expect(dailyBoard ?? []).not.toHaveLength(0);
      for (const row of dailyBoard ?? []) {
        expect(row.bucket, 'leaderboard row resolves to the requested lane').toBe(
          'multiplayer:og:daily:v1',
        );
      }
      await event('ranked_leaderboard_bucket_repair_verified', {
        lanes: [...lanes],
        dailyOgRows: (dailyBoard ?? []).length,
      });
    }

    await event('ranked_daily_og_hosted_verified', {
      gameId: rankedDailyGameId,
      requestIds: [rankedDailyOne.id, rankedDailyTwo.id],
      utcDateKey: new Date().toISOString().slice(0, 10),
      clockFree: true,
    });

    await firstPage.goto(`${baseURL}/combat/daily`);
    await firstPage.getByLabel('Mode', { exact: true }).selectOption('go');
    await firstPage.getByLabel('Hard Mode').check();
    const findRankedDailyGo = firstPage.getByRole('button', { name: 'Find ranked Daily' });
    await expect(findRankedDailyGo).toBeEnabled({ timeout: 15_000 });
    await findRankedDailyGo.click();
    const cancelledRankedDailyGo = await registerLatestQueueRequest(playerOne!, 'daily', 'go');
    await firstPage.getByRole('button', { name: 'Cancel ranked search' }).click();
    await expect(firstPage.getByText(/Ranked Daily search cancelled/i)).toBeVisible();
    await expect
      .poll(async () => {
        const { data, error } = await admin
          .from('multiplayer_matchmaking_queue')
          .select('status')
          .eq('id', cancelledRankedDailyGo.id)
          .single();
        if (error) throw error;
        return data.status;
      })
      .toBe('cancelled');
    await event('ranked_daily_go_cancel_verified', {
      scenarioId: rankedDailyScenarioId,
      requestId: cancelledRankedDailyGo.id,
      dailyDateKey: new Date().toISOString().slice(0, 10),
    });
  });

  test('proves password-gated account lifecycle actions and opponent-safe deletion', async ({
    browser,
  }) => {
    test.setTimeout(360_000);
    await event('hosted_scenario_started', { scenarioId: accountLifecycleScenarioId });

    const soloAccount = await createAccount(4, 'player');
    const competitiveAccount = await createAccount(5, 'player');
    const deletedAccount = await createAccount(6, 'player');
    const opponent = users[2]!;
    const contextOptions = {
      baseURL,
      storageState: bypassStorageState,
      serviceWorkers: 'allow' as const,
    };
    const soloContext = await browser.newContext(contextOptions);
    const competitiveContext = await browser.newContext(contextOptions);
    const deletionContext = await browser.newContext(contextOptions);
    for (const context of [soloContext, competitiveContext, deletionContext]) {
      await context.addInitScript((correlationId) => {
        (
          window as typeof window & {
            __AMORDLE_E2E_RUN_ID__?: string;
          }
        ).__AMORDLE_E2E_RUN_ID__ = correlationId;
      }, runId);
    }
    contexts.push(soloContext, competitiveContext, deletionContext);
    const soloPage = await soloContext.newPage();
    const competitivePage = await competitiveContext.newPage();
    const deletionPage = await deletionContext.newPage();

    const soloHistoryId = `${runId}:lifecycle:solo`;
    const soloCombatHistoryId = `${runId}:lifecycle:solo-control`;
    const soloStateId = `amordle-account-state-v1:${soloAccount.id}`;
    const { error: soloFixtureError } = await admin.from('game_history').insert([
      {
        id: soloHistoryId,
        user_id: soloAccount.id,
        completed_at: new Date().toISOString(),
        entry: { kind: 'solo-practice', result: 'won' },
      },
      {
        id: soloCombatHistoryId,
        user_id: soloAccount.id,
        completed_at: new Date().toISOString(),
        entry: { kind: 'combat-practice', result: 'won' },
      },
      {
        id: soloStateId,
        user_id: soloAccount.id,
        completed_at: new Date().toISOString(),
        entry: {
          kind: 'amordle-account-state-v1',
          progress: { dailyStreak: 4, revision: 7, solo: { games: 3 } },
        },
      },
    ]);
    if (soloFixtureError) throw soloFixtureError;
    const { error: soloProgressError } = await admin.from('progress_snapshots').insert({
      user_id: soloAccount.id,
      progress: { dailyStreak: 4, history: [{ id: soloHistoryId }], solo: { games: 3 } },
      updated_at: new Date().toISOString(),
    });
    if (soloProgressError) throw soloProgressError;
    const { error: soloEconomyError } = await admin.from('player_economy_state').insert({
      user_id: soloAccount.id,
      coins: 77,
      reveal_one_letter: 2,
      remove_incorrect_letters: 3,
      revision: 5,
    });
    if (soloEconomyError) throw soloEconomyError;

    await signIn(soloPage, soloAccount);
    await soloPage.goto(`${baseURL}/settings`);
    await expect(soloPage.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    const soloAction = soloPage
      .locator('.danger-action-list article')
      .filter({ hasText: 'Delete Solo history and progress' });
    await soloAction.getByRole('button', { name: 'REVIEW ACTION' }).click();
    const soloDialog = soloPage.getByRole('dialog', {
      name: 'Delete Solo history and progress',
    });
    await soloDialog.getByLabel('Current password').fill('not-the-current-password');
    await soloDialog.getByRole('button', { name: 'VERIFY PASSWORD' }).click();
    await expect(soloDialog.getByRole('alert')).toContainText(/current password is incorrect/i);
    await soloDialog.getByLabel('Current password').fill(soloAccount.password);
    await soloDialog.getByRole('button', { name: 'VERIFY PASSWORD' }).click();
    await expect(soloDialog.getByText(/Password verified/i)).toBeVisible();
    await soloDialog.getByRole('button', { name: 'DELETE SOLO DATA PERMANENTLY' }).click();
    await expect(soloPage.getByText('Solo history and progress were deleted.')).toBeVisible();

    const [{ data: soloHistory }, { data: preservedCombat }, { data: soloEconomy }] =
      await Promise.all([
        admin.from('game_history').select('id').eq('id', soloHistoryId).maybeSingle(),
        admin.from('game_history').select('id').eq('id', soloCombatHistoryId).single(),
        admin
          .from('player_economy_state')
          .select('coins,reveal_one_letter,remove_incorrect_letters,revision')
          .eq('user_id', soloAccount.id)
          .single(),
      ]);
    expect(soloHistory).toBeNull();
    expect(preservedCombat?.id).toBe(soloCombatHistoryId);
    expect(soloEconomy).toMatchObject({
      coins: 77,
      reveal_one_letter: 2,
      remove_incorrect_letters: 3,
      revision: 5,
    });
    const { data: resetSnapshot, error: resetSnapshotError } = await admin
      .from('progress_snapshots')
      .select('progress')
      .eq('user_id', soloAccount.id)
      .single();
    if (resetSnapshotError) throw resetSnapshotError;
    expect(resetSnapshot.progress).toMatchObject({ dailyStreak: 0, history: [], solo: {} });
    await event('solo_account_reset_hosted_verified', {
      scenarioId: accountLifecycleScenarioId,
      wrongPasswordRejected: true,
      soloDeleted: true,
      combatPreserved: true,
      economyPreserved: true,
    });

    const ratingBuckets = [
      'async:og:amordle:v2',
      'async:go:amordle:v2',
      'async:og:timed:amordle:v2',
      'async:go:timed:amordle:v2',
      'async:og:daily:v1',
      'async:go:daily:v1',
    ];
    const { error: ratingFixtureError } = await admin.from('multiplayer_rating_profiles').insert(
      ratingBuckets.map((bucket, index) => ({
        user_id: competitiveAccount.id,
        bucket,
        rating: 1330 + index,
        games_played: 9,
        wins: 5,
        losses: 3,
        draws: 1,
        provisional: false,
      })),
    );
    if (ratingFixtureError) throw ratingFixtureError;
    const competitiveHistoryId = `${runId}:lifecycle:competitive`;
    const { error: competitiveHistoryError } = await admin.from('game_history').insert({
      id: competitiveHistoryId,
      user_id: competitiveAccount.id,
      completed_at: new Date().toISOString(),
      entry: { kind: 'combat-practice', result: 'won' },
    });
    if (competitiveHistoryError) throw competitiveHistoryError;
    const { data: waitingQueue, error: waitingQueueError } = await admin
      .from('multiplayer_matchmaking_queue')
      .insert({
        user_id: competitiveAccount.id,
        idempotency_key: `${runId}:lifecycle:queue`,
        mode: 'og',
        ranked: true,
        rating_bucket: 'async:og:amordle:v2',
        scope: 'practice',
        status: 'queued',
        transport: 'async',
        word_length: 5,
      })
      .select('id')
      .single();
    if (waitingQueueError) throw waitingQueueError;
    lifecycleQueueIds.push(waitingQueue.id);
    await appendJson(resourcesPath, {
      at: new Date().toISOString(),
      kind: 'matchmaking_queue_request',
      id: waitingQueue.id,
      owner: runId,
      userId: competitiveAccount.id,
      disposable: true,
    });

    await signIn(competitivePage, competitiveAccount);
    await competitivePage.goto(`${baseURL}/settings`);
    const competitiveAction = competitivePage
      .locator('.danger-action-list article')
      .filter({ hasText: 'Restart competitive profile' });
    await competitiveAction.getByRole('button', { name: 'REVIEW ACTION' }).click();
    const competitiveDialog = competitivePage.getByRole('dialog', {
      name: 'Restart competitive profile',
    });
    await competitiveDialog.getByLabel('Current password').fill(competitiveAccount.password);
    await competitiveDialog.getByRole('button', { name: 'VERIFY PASSWORD' }).click();
    await competitiveDialog.getByRole('button', { name: 'RESTART COMPETITIVE PROFILE' }).click();
    await expect(competitivePage.getByText('Competitive profile restarted.')).toBeVisible();
    const { data: resetRatings, error: resetRatingsError } = await admin
      .from('multiplayer_rating_profiles')
      .select('bucket,rating,games_played,wins,losses,draws,provisional')
      .eq('user_id', competitiveAccount.id)
      .order('bucket');
    if (resetRatingsError) throw resetRatingsError;
    expect(resetRatings).toHaveLength(6);
    for (const rating of resetRatings) {
      expect(rating).toMatchObject({
        rating: 1200,
        games_played: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        provisional: true,
      });
    }
    const [{ data: competitiveHistory }, { data: cancelledQueue }] = await Promise.all([
      admin.from('game_history').select('id').eq('id', competitiveHistoryId).maybeSingle(),
      admin
        .from('multiplayer_matchmaking_queue')
        .select('status')
        .eq('id', waitingQueue.id)
        .single(),
    ]);
    expect(competitiveHistory).toBeNull();
    expect(cancelledQueue?.status).toBe('cancelled');
    await event('competitive_account_reset_hosted_verified', {
      scenarioId: accountLifecycleScenarioId,
      firstResetGenerationExpected: 2,
      generationAuthority: 'migration-backed first-reset contract',
      bucketsReset: resetRatings.length,
      queueCancelled: true,
      historyHidden: true,
    });

    await signIn(deletionPage, deletedAccount);
    await deletionPage.goto(`${baseURL}/profile`);
    await deletionPage.getByLabel('Player name').fill('Disposable Lifecycle Player');
    const avatarPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    await deletionPage.getByLabel('Upload profile image').setInputFiles({
      name: 'lifecycle-avatar.png',
      mimeType: 'image/png',
      buffer: avatarPng,
    });
    await deletionPage.getByRole('button', { name: 'UPLOAD AND USE' }).click();
    const deletionAvatarInput = deletionPage.getByLabel('Profile image URL');
    await expect(deletionAvatarInput).toHaveValue(/^https:\/\//, { timeout: 15_000 });
    const deletionAvatarUrl = await deletionAvatarInput.inputValue();
    const deletionAvatarMarker = `/storage/v1/object/public/${avatarBucket}/`;
    const deletionAvatarPath = decodeURIComponent(
      new URL(deletionAvatarUrl).pathname.split(deletionAvatarMarker)[1] ?? '',
    );
    avatarPaths.push(deletionAvatarPath);
    await appendJson(resourcesPath, {
      at: new Date().toISOString(),
      kind: 'storage_object',
      id: deletionAvatarPath,
      owner: runId,
      userId: deletedAccount.id,
      disposable: true,
    });
    await deletionPage.getByRole('button', { name: 'SAVE PROFILE' }).click();
    await expect(deletionPage.getByText('Profile saved.')).toBeVisible();

    const sharedSourceId = `${runId}:lifecycle:shared-match`;
    const { data: sharedResult, error: sharedResultError } = await admin
      .from('multiplayer_match_results')
      .insert({
        idempotency_key: `${runId}:lifecycle:shared-result`,
        mode: 'og',
        ranked: true,
        rating_bucket: 'async:og:amordle:v2',
        scope: 'practice',
        source_match_id: sharedSourceId,
        source_transport: 'async',
        terminal_status: 'completed',
      })
      .select('id')
      .single();
    if (sharedResultError) throw sharedResultError;
    lifecycleResultIds.push(sharedResult.id);
    const { error: sharedPlayersError } = await admin.from('multiplayer_player_results').insert([
      {
        match_result_id: sharedResult.id,
        player_id: 'player-one',
        user_id: deletedAccount.id,
        player_label: 'Disposable Lifecycle Player',
        outcome: 'loss',
      },
      {
        match_result_id: sharedResult.id,
        player_id: 'player-two',
        user_id: opponent.id,
        player_label: 'E2E Opponent',
        outcome: 'win',
      },
    ]);
    if (sharedPlayersError) throw sharedPlayersError;
    const { error: sharedTransactionsError } = await admin
      .from('multiplayer_rating_transactions')
      .insert([
        {
          bucket: 'async:og:amordle:v2',
          expected_score: 0.5,
          idempotency_key: `${runId}:lifecycle:rating:one`,
          match_result_id: sharedResult.id,
          new_rating: 1190,
          old_rating: 1200,
          opponent_user_id: opponent.id,
          outcome: 'loss',
          player_label: 'Disposable Lifecycle Player',
          opponent_label: 'E2E Opponent',
          rating_delta: -10,
          user_id: deletedAccount.id,
        },
        {
          bucket: 'async:og:amordle:v2',
          expected_score: 0.5,
          idempotency_key: `${runId}:lifecycle:rating:two`,
          match_result_id: sharedResult.id,
          new_rating: 1210,
          old_rating: 1200,
          opponent_user_id: deletedAccount.id,
          outcome: 'win',
          player_label: 'E2E Opponent',
          opponent_label: 'Disposable Lifecycle Player',
          rating_delta: 10,
          user_id: opponent.id,
        },
      ]);
    if (sharedTransactionsError) throw sharedTransactionsError;
    await appendJson(resourcesPath, {
      at: new Date().toISOString(),
      kind: 'shared_match_result',
      id: sharedResult.id,
      owner: runId,
      participantIds: [deletedAccount.id, opponent.id],
      disposable: true,
    });

    await deletionPage.goto(`${baseURL}/settings`);
    const deleteAction = deletionPage
      .locator('.danger-action-list article')
      .filter({ hasText: 'Delete account permanently' });
    await deleteAction.getByRole('button', { name: 'REVIEW ACTION' }).click();
    const deleteDialog = deletionPage.getByRole('dialog', {
      name: 'Delete account permanently',
    });
    await deleteDialog.getByLabel('Current password').fill(deletedAccount.password);
    await deleteDialog.getByRole('button', { name: 'VERIFY PASSWORD' }).click();
    await deleteDialog.getByRole('button', { name: 'DELETE ACCOUNT PERMANENTLY' }).click();
    await expect(deletionPage.getByRole('link', { name: /sign in/i })).toBeVisible({
      timeout: 20_000,
    });
    const { data: deletedAuth } = await admin.auth.admin.getUserById(deletedAccount.id);
    expect(deletedAuth.user).toBeNull();
    const { data: deletedProfile, error: deletedProfileError } = await admin
      .from('public_player_profiles')
      .select('user_id')
      .eq('user_id', deletedAccount.id)
      .maybeSingle();
    if (deletedProfileError) throw deletedProfileError;
    expect(deletedProfile).toBeNull();
    const { data: avatarListing, error: avatarListingError } = await admin.storage
      .from(avatarBucket)
      .list('avatars', { search: deletionAvatarPath.split('/').at(-1) ?? '' });
    if (avatarListingError) throw avatarListingError;
    expect(avatarListing).toHaveLength(0);
    const { data: preservedPlayers, error: preservedPlayersError } = await admin
      .from('multiplayer_player_results')
      .select('player_id,user_id,player_label')
      .eq('match_result_id', sharedResult.id)
      .order('player_id');
    if (preservedPlayersError) throw preservedPlayersError;
    expect(preservedPlayers).toEqual([
      { player_id: 'player-one', user_id: null, player_label: 'Deleted player' },
      { player_id: 'player-two', user_id: opponent.id, player_label: 'E2E Opponent' },
    ]);
    const { data: preservedTransactions, error: preservedTransactionsError } = await admin
      .from('multiplayer_rating_transactions')
      .select('user_id,opponent_user_id,player_label,opponent_label')
      .eq('match_result_id', sharedResult.id)
      .order('rating_delta');
    if (preservedTransactionsError) throw preservedTransactionsError;
    expect(preservedTransactions).toEqual([
      {
        user_id: null,
        opponent_user_id: opponent.id,
        player_label: 'Deleted player',
        opponent_label: 'E2E Opponent',
      },
      {
        user_id: opponent.id,
        opponent_user_id: null,
        player_label: 'E2E Opponent',
        opponent_label: 'Deleted player',
      },
    ]);
    await event('permanent_account_deletion_hosted_verified', {
      scenarioId: accountLifecycleScenarioId,
      authDeleted: true,
      avatarDeleted: true,
      publicProfileDeleted: true,
      opponentSharedFactsPreserved: true,
      deletedIdentitySanitized: true,
    });
    await event('hosted_scenario_complete', { scenarioId: accountLifecycleScenarioId });
  });
});
