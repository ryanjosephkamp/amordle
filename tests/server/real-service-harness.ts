import { appendFile, mkdir } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/types/database';

const EXPECTED_PROJECT_REF = 'squqdstdvbsvhagfuzgj';

export const PUBLIC_TABLES = [
  'async_multiplayer_games',
  'custom_game_lobbies',
  'game_history',
  'live_lobbies',
  'live_match_events',
  'live_match_participants',
  'live_match_spectators',
  'live_matches',
  'multiplayer_daily_claims',
  'multiplayer_match_results',
  'multiplayer_matchmaking_queue',
  'multiplayer_player_results',
  'multiplayer_practice_rematch_requests',
  'multiplayer_private_match_requests',
  'multiplayer_private_request_blocks',
  'multiplayer_private_request_preferences',
  'multiplayer_rating_profiles',
  'multiplayer_rating_transactions',
  'player_economy_operations',
  'player_economy_state',
  'profiles',
  'progress_snapshots',
  'public_player_profiles',
  'settings',
] as const satisfies readonly (keyof Database['public']['Tables'])[];

export type PublicTable = (typeof PUBLIC_TABLES)[number];
type MatchValue = string | number | boolean | null;

type RowResource = { kind: 'row'; table: PublicTable; match: Record<string, MatchValue> };
type StorageResource = { kind: 'storage'; bucket: string; path: string };
type UserResource = { kind: 'auth-user'; userId: string };
type Resource = RowResource | StorageResource | UserResource;

const CLEANUP_ORDER: PublicTable[] = [
  'live_match_events',
  'live_match_spectators',
  'live_match_participants',
  'live_matches',
  'live_lobbies',
  'multiplayer_rating_transactions',
  'multiplayer_player_results',
  'multiplayer_match_results',
  'multiplayer_practice_rematch_requests',
  'multiplayer_private_match_requests',
  'multiplayer_private_request_blocks',
  'multiplayer_private_request_preferences',
  'multiplayer_daily_claims',
  'multiplayer_matchmaking_queue',
  'async_multiplayer_games',
  'custom_game_lobbies',
  'player_economy_operations',
  'player_economy_state',
  'game_history',
  'progress_snapshots',
  'settings',
  'public_player_profiles',
  'multiplayer_rating_profiles',
  'profiles',
];

function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Required real-service variable ${name} is absent.`);
  return value;
}

function assertProject(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== `${EXPECTED_PROJECT_REF}.supabase.co`) {
    throw new Error('Real-service target identity did not match the dedicated Amordle project.');
  }
}

function runId(): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, '')
    .slice(0, 14);
  return `e2e_${stamp}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

async function retry(action: () => Promise<void>): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await action();
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 100));
    }
  }
  throw lastError;
}

export class RealServiceHarness {
  readonly runId: string;
  readonly admin: SupabaseClient;
  readonly url: string;
  readonly anonKey: string;
  private readonly resources: Resource[] = [];
  private readonly registryPath: string;

  private constructor(url: string, anonKey: string, serviceKey: string) {
    this.runId = runId();
    this.url = url;
    this.anonKey = anonKey;
    this.admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    this.registryPath = path.join(
      process.cwd(),
      '.codex-internal',
      'evidence',
      this.runId,
      'resources.jsonl',
    );
  }

  static async create(): Promise<RealServiceHarness> {
    if (process.env.AMORDLE_ENABLE_REAL_SERVICE_E2E !== '1') {
      throw new Error('Real-service tests require explicit AMORDLE_ENABLE_REAL_SERVICE_E2E=1.');
    }
    const url = requireEnvironment('E2E_SUPABASE_URL');
    const anonKey = requireEnvironment('E2E_SUPABASE_ANON_KEY');
    const serviceKey = requireEnvironment('E2E_SUPABASE_SERVICE_ROLE_KEY');
    assertProject(url);
    const harness = new RealServiceHarness(url, anonKey, serviceKey);
    await mkdir(path.dirname(harness.registryPath), { recursive: true, mode: 0o700 });
    return harness;
  }

  browserClient(): SupabaseClient {
    return createClient(this.url, this.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  async createTemporaryUser(
    label: string,
  ): Promise<{ userId: string; email: string; password: string }> {
    const safeLabel =
      label
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 20) || 'player';
    const email = `amordle.${this.runId}.${safeLabel}@example.com`;
    const password = `${randomBytes(18).toString('base64url')}aA1!`;
    const { data, error } = await this.admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { test_run_id: this.runId },
    });
    if (error || !data.user) throw new Error('Disposable Auth user creation failed.');
    try {
      await this.register({ kind: 'auth-user', userId: data.user.id });
      await this.registerRow('profiles', { id: data.user.id });
    } catch (registrationError) {
      await this.admin.auth.admin.deleteUser(data.user.id);
      const userResource = this.resources.findIndex(
        (resource) => resource.kind === 'auth-user' && resource.userId === data.user?.id,
      );
      if (userResource >= 0) this.resources.splice(userResource, 1);
      throw registrationError;
    }
    return { userId: data.user.id, email, password };
  }

  async registerRow(table: PublicTable, match: Record<string, MatchValue>): Promise<void> {
    if (!PUBLIC_TABLES.includes(table) || Object.keys(match).length === 0) {
      throw new Error('Cleanup registration requires an exact public table and nonempty match.');
    }
    await this.register({ kind: 'row', table, match });
  }

  async registerStorageObject(bucket: string, objectPath: string): Promise<void> {
    if (!bucket || !objectPath) throw new Error('Storage cleanup registration must be exact.');
    await this.register({ kind: 'storage', bucket, path: objectPath });
  }

  async cleanup(): Promise<void> {
    const failures: string[] = [];
    const users = this.resources.filter(
      (resource): resource is UserResource => resource.kind === 'auth-user',
    );
    if (users.length > 0) {
      try {
        const { error } = await this.admin.rpc('cleanup_ranked_daily_multiplayer_for_users', {
          p_user_ids: users.map(({ userId }) => userId),
        });
        if (error) throw error;
      } catch {
        failures.push('ranked Daily private cleanup failed');
      }
    }

    const rows = this.resources.filter(
      (resource): resource is RowResource => resource.kind === 'row',
    );
    rows.sort(
      (left, right) => CLEANUP_ORDER.indexOf(left.table) - CLEANUP_ORDER.indexOf(right.table),
    );
    for (const resource of rows) {
      try {
        await retry(async () => {
          const { error } = await this.admin.from(resource.table).delete().match(resource.match);
          if (error) throw error;
          const { count, error: probeError } = await this.admin
            .from(resource.table)
            .select('*', { count: 'exact', head: true })
            .match(resource.match);
          if (probeError || count !== 0) throw probeError ?? new Error('row residue');
        });
      } catch {
        failures.push(`${resource.table} cleanup or zero-residue probe failed`);
      }
    }

    const storage = this.resources.filter(
      (resource): resource is StorageResource => resource.kind === 'storage',
    );
    for (const resource of storage) {
      try {
        await retry(async () => {
          const { error } = await this.admin.storage.from(resource.bucket).remove([resource.path]);
          if (error) throw error;
          const parent = resource.path.includes('/')
            ? resource.path.slice(0, resource.path.lastIndexOf('/'))
            : '';
          const name = resource.path.slice(resource.path.lastIndexOf('/') + 1);
          const { data, error: listError } = await this.admin.storage
            .from(resource.bucket)
            .list(parent, {
              search: name,
              limit: 100,
            });
          if (listError || data?.some((entry) => entry.name === name))
            throw listError ?? new Error('object residue');
        });
      } catch {
        failures.push(`${resource.bucket}/${resource.path} cleanup or zero-residue probe failed`);
      }
    }

    for (const user of users) {
      try {
        await retry(async () => {
          const { error } = await this.admin.auth.admin.deleteUser(user.userId);
          if (error) throw error;
          const { data } = await this.admin.auth.admin.getUserById(user.userId);
          if (data.user) throw new Error('Auth user residue');
        });
      } catch {
        failures.push('Auth user cleanup or zero-residue probe failed');
      }
    }

    if (failures.length > 0) {
      throw new Error(`Real-service cleanup blocker: ${failures.join('; ')}`);
    }
  }

  private async register(resource: Resource): Promise<void> {
    this.resources.push(resource);
    await appendFile(this.registryPath, `${JSON.stringify(resource)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
  }
}
