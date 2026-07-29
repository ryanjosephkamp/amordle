import 'server-only';

import { createHash } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';
import { accountStateEntrySchema, normalizeAccountProgress } from '@/domain/account-continuity';
import { getPublicSupabaseConfig } from './config';

export async function getOwnerNamespace(): Promise<string> {
  const config = getPublicSupabaseConfig();
  if (!config) return 'guest';
  const store = await cookies();
  const client = createServerClient<Database>(config.url, config.anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: () => {
        // Server Components cannot write cookies. Browser auth and route handlers
        // perform refresh writes; this read is only for namespaced selection.
      },
    },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return 'guest';
  const digest = createHash('sha256').update(data.user.id).digest('hex').slice(0, 24);
  return `account:${digest}`;
}

export async function canLoadDailyAnswers(localDate: string, mode: 'og' | 'go'): Promise<boolean> {
  const utcToday = new Date().toISOString().slice(0, 10);
  const distance = Math.abs(
    (Date.parse(`${localDate}T00:00:00.000Z`) - Date.parse(`${utcToday}T00:00:00.000Z`)) /
      86_400_000,
  );
  // A one-day UTC margin covers every valid local calendar day worldwide.
  if (distance <= 1) return true;
  const config = getPublicSupabaseConfig();
  if (!config) return false;
  const store = await cookies();
  const client = createServerClient<Database>(config.url, config.anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: () => {},
    },
  });
  const { data } = await client.auth.getUser();
  if (!data.user) return false;
  const [state, snapshot] = await Promise.all([
    client
      .from('game_history')
      .select('entry')
      .eq('id', `amordle-account-state-v1:${data.user.id}`)
      .eq('user_id', data.user.id)
      .maybeSingle(),
    client.from('progress_snapshots').select('progress').eq('user_id', data.user.id).maybeSingle(),
  ]);
  const current = accountStateEntrySchema.safeParse(state.data?.entry);
  const normalized = normalizeAccountProgress(snapshot.data?.progress);
  const entitlements = current.success
    ? current.data.progress.dailyEntitlements
    : normalized.kind === 'unknown'
      ? undefined
      : normalized.progress.dailyEntitlements;
  return Boolean(entitlements?.[`${localDate}:${mode}`]);
}
