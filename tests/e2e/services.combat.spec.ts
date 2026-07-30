import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
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
const rankedDailyGameIds: string[] = [];
const rankedDailyRequestIds: string[] = [];
const privateRequestIds: string[] = [];
const rematchRequestIds: string[] = [];
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
  await expect(page.getByRole('heading', { name: /account status/i })).toBeVisible();
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
          p_request_ids: [...queueRequestIds, ...rankedDailyRequestIds],
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
          rankedDailyRequests: rankedDailyRequestIds.length,
          privateRequests: privateRequestIds.length,
          rematchRequests: rematchRequestIds.length,
        },
        residue,
        authResidue: 0,
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
        error: error instanceof Error ? error.message : 'unknown cleanup error',
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
    await appendJson(resourcesPath, {
      at: new Date().toISOString(),
      kind: 'preview_manifest',
      id: `word-lists/previews/${commitSha}/manifest.json`,
      owner: commitSha,
      disposable: false,
      lifecycle: 'candidate',
    });
    await createAccount(1, 'admin');
    await createAccount(2, 'player');
    await createAccount(3, 'player');
  });

  test.afterAll(async () => {
    await cleanup();
  });

  test('publishes candidate words and proves UI multiplayer recovery and privacy', async ({
    browser,
  }) => {
    test.setTimeout(600_000);
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

    const refreshResponse = await fetch(`${baseURL}/api/admin-refresh`, {
      method: 'POST',
      headers: bypassHeaders({ Authorization: `Bearer ${playerOne!.accessToken}` }),
    });
    expect(refreshResponse.status).toBe(200);
    expect(await refreshResponse.json()).toMatchObject({ objectCount: 34 });
    let manifestEntries: Array<{ length: number; url: string }> = [];
    await expect
      .poll(
        async () => {
          const manifestResponse = await fetch(
            `${baseURL}/api/word-lists/manifest?candidate=${encodeURIComponent(runId)}`,
            {
              headers: bypassHeaders(),
            },
          );
          expect(manifestResponse.status).toBe(200);
          const body = (await manifestResponse.json()) as {
            manifest: { entries: Array<{ length: number; url: string }> } | null;
          };
          manifestEntries = body.manifest?.entries ?? [];
          return manifestEntries.length;
        },
        {
          timeout: 30_000,
          intervals: [250, 500, 1_000, 2_000],
        },
      )
      .toBe(34);
    expect(manifestEntries.map((entry) => entry.length)).toEqual(
      Array.from({ length: 34 }, (_, index) => index + 2),
    );
    await event('preview_manifest_published', { objectCount: 34 });

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
    await signIn(firstPage, playerOne!);
    await signIn(secondPage, playerTwo!);
    await signIn(spectatorPage, spectator!);

    await firstPage.setViewportSize({ width: 1440, height: 1024 });
    await firstPage.emulateMedia({ colorScheme: 'light' });
    await firstPage.goto(`${baseURL}/profile`);
    await expect(firstPage.getByRole('heading', { name: 'PUBLIC PROFILE' })).toBeVisible();
    await firstPage.getByLabel('Player name').fill('E2E Operator');
    await firstPage.getByText('Violet', { exact: true }).click();
    await expect(firstPage.getByRole('radio', { name: 'Violet' })).toBeChecked();
    await firstPage.getByRole('button', { name: 'SAVE PROFILE' }).click();
    await expect(firstPage.getByText('Profile saved.')).toBeVisible();
    await firstPage.reload();
    await expect(firstPage.getByRole('radio', { name: 'Violet' })).toBeChecked();
    const { data: savedProfile, error: savedProfileError } = await admin
      .from('public_player_profiles')
      .select('accent_color,public_profile_id')
      .eq('user_id', playerOne!.id)
      .single();
    if (savedProfileError) throw savedProfileError;
    expect(savedProfile.accent_color).toBe('violet');
    await spectatorPage.goto(`${baseURL}/players/${savedProfile.public_profile_id}`);
    await expect(spectatorPage.locator('.public-profile')).toContainText('E2E Operator');
    await expect(spectatorPage.locator('.profile-avatar')).toHaveAttribute(
      'style',
      /border-color:/i,
    );
    await firstPage.screenshot({
      path: path.join(evidenceDir, 'account-profile-desktop-light.png'),
      fullPage: true,
    });
    await secondPage.goto(`${baseURL}/profile`);
    await secondPage.getByLabel('Player name').fill('E2E Player Two');
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

    await firstPage.goto(`${baseURL}/combat/lobby`);
    await firstPage.getByLabel('Public profile ID').fill(secondProfile.public_profile_id);
    await firstPage.getByRole('button', { name: 'Send private request' }).click();
    await expect(firstPage.getByText('Private request sent.')).toBeVisible();
    const { data: privateRequest, error: privateRequestError } = await admin
      .from('multiplayer_private_match_requests')
      .select('id')
      .eq('requester_user_id', playerOne!.id)
      .eq('opponent_user_id', playerTwo!.id)
      .single();
    if (privateRequestError) throw privateRequestError;
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
    await expect(firstPage.getByRole('heading', { name: 'Settings' })).toBeVisible();
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
    ) as { answers: Array<{ word: string }>; validGuesses: string[] };
    const ownerDigest = createHash('sha256').update(playerTwo!.id).digest('hex').slice(0, 24);
    const soloAnswer = selectPracticeAnswers({
      answers: publicBank.answers,
      difficulty: 'standard',
      count: 1,
      ownerNamespace: `account:${ownerDigest}`,
      mode: 'og',
      length: 5,
      generation: 91,
    })[0]!;
    const answerWords = new Set(publicBank.answers.map((entry) => entry.word));
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
    await expect(accountMenu.getByRole('menuitem', { name: /View profile/i })).toBeVisible();
    await expect(accountMenu.getByRole('menuitem', { name: /Sign out/i })).toBeVisible();
    await expect(
      accountMenu.getByRole('menuitem', { name: /Stats|History|Marketplace|Settings/i }),
    ).toHaveCount(0);
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
    await expect(notificationDialog.getByText('Match ready')).toBeVisible();
    await notificationDialog.getByRole('button', { name: 'Mark all read' }).click();
    await expect(
      firstPage.getByRole('button', { name: 'Notifications', exact: true }),
    ).toBeVisible();
    await firstPage.getByRole('button', { name: 'Notifications', exact: true }).click();
    await firstPage.reload();
    await expect(firstPage.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible(
      {
        timeout: 15_000,
      },
    );

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
      routeRailCount: document.querySelectorAll('.mobile-route-rail').length,
    }));
    expect(mobileFit.documentHeight).toBeLessThanOrEqual(mobileFit.viewportHeight + 1);
    expect(mobileFit.routeRailCount).toBe(0);
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
    ) as { answers: Array<{ word: string }>; validGuesses: string[] };
    const guesses = [...bank.validGuesses, ...bank.answers.map((entry) => entry.word)]
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
    ).toContainText(/01\s*·\s*rival/i);
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
    await expect(secondPage.locator('.combat-turn-state')).toHaveText(/you lost|match complete/i, {
      timeout: 15_000,
    });
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

    await firstPage.goto(`${baseURL}/combat/match/${gameId}`);
    await expect(
      firstPage.getByRole('button', { name: /Notifications, [1-9]\d* unread/i }),
    ).toBeVisible({ timeout: 15_000 });
    await firstPage.getByRole('button', { name: /Notifications/i }).click();
    await expect(
      firstPage.getByRole('dialog', { name: 'Notifications' }).getByText('Match result'),
    ).toBeVisible();
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
      transitions: ['match', 'turn', 'result', 'rematch'],
      rematchGameId,
      rematchAcceptedThroughUi: true,
      persistentReadState: true,
    });
  });

  test('proves ranked Practice and all four Daily lanes through player UI', async ({ browser }) => {
    test.setTimeout(300_000);
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
    await expect(firstPage.getByRole('status')).toContainText(/RATING \d+ → \d+/i);
    await secondPage.reload();
    await expect(secondPage.locator('.combat-turn-state')).toHaveText(
      /opponent won|match complete/i,
      { timeout: 15_000 },
    );
    await secondPage.getByRole('button', { name: 'UPDATE RATING' }).click();
    await expect(secondPage.getByRole('status')).toContainText(/RATING \d+ → \d+/i);
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
    await firstPage.getByLabel('Mode').selectOption('go');
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
      await firstPage.getByLabel('Mode').selectOption(mode);
      await firstPage.getByRole('button', { name: 'Create Daily lobby' }).click();
      await expect(firstPage).toHaveURL(/\/combat\/match\//);
      const unrankedDailyGameId = new URL(firstPage.url()).pathname.split('/').at(-1);
      if (!unrankedDailyGameId) throw new Error(`Unranked Daily ${mode} game ID was unavailable.`);
      await registerGame(unrankedDailyGameId, `unranked-daily-${mode}-v2`, [
        playerOne!.id,
        playerTwo!.id,
      ]);

      await secondPage.goto(`${baseURL}/combat/daily`);
      await secondPage.getByLabel('Mode').selectOption(mode);
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
    await firstPage.getByLabel('Mode').selectOption('og');
    await firstPage.getByLabel('Hard Mode').check();
    await firstPage.getByRole('button', { name: 'Find ranked Daily' }).click();
    const rankedDailyOne = await registerLatestQueueRequest(playerOne!, 'daily', 'og');
    await firstPage.reload();
    await expect(firstPage.getByText(/Restored your ranked Daily search/i)).toBeVisible({
      timeout: 15_000,
    });

    await secondPage.goto(`${baseURL}/combat/daily`);
    await secondPage.getByLabel('Mode').selectOption('og');
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
    await expect(firstPage.locator('.combat-turn-state')).toHaveText(/your turn/i, {
      timeout: 15_000,
    });
    await expect(firstPage.getByLabel(/time remaining/i)).toHaveCount(0);
    await submitOnScreenGuess(firstPage, 'crane');
    await waitForGameMoveCount(rankedDailyGameId, 1);
    if ((await firstPage.getByRole('button', { name: 'UPDATE RATING' }).count()) === 0) {
      await secondPage.reload();
      await expect(secondPage.locator('.combat-turn-state')).toHaveText(/your turn/i, {
        timeout: 15_000,
      });
      secondPage.once('dialog', (dialog) => void dialog.accept());
      await secondPage.getByRole('button', { name: 'FORFEIT MATCH' }).click();
    }
    await expect(firstPage.getByRole('button', { name: 'UPDATE RATING' })).toBeVisible({
      timeout: 15_000,
    });
    await firstPage.getByRole('button', { name: 'UPDATE RATING' }).click();
    await expect(firstPage.getByRole('status')).toContainText(/RATING \d+ → \d+/i);
    await secondPage.reload();
    await secondPage.getByRole('button', { name: 'UPDATE RATING' }).click();
    await expect(secondPage.getByRole('status')).toContainText(/RATING \d+ → \d+/i);
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
    await event('ranked_daily_og_hosted_verified', {
      gameId: rankedDailyGameId,
      requestIds: [rankedDailyOne.id, rankedDailyTwo.id],
      utcDateKey: new Date().toISOString().slice(0, 10),
      clockFree: true,
    });

    await firstPage.goto(`${baseURL}/combat/daily`);
    await firstPage.getByLabel('Mode').selectOption('go');
    await firstPage.getByLabel('Hard Mode').check();
    await firstPage.getByRole('button', { name: 'Find ranked Daily' }).click();
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
      requestId: cancelledRankedDailyGo.id,
      dailyDateKey: new Date().toISOString().slice(0, 10),
    });
  });
});
