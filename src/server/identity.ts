import 'server-only';

import { createHash } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database';
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
  /*
   * This is the gate that decides whether the server ships a past Daily's
   * answers to the browser, so it is the one place where the entitlement is
   * load-bearing rather than cosmetic. It used to read the account-state row
   * and the progress snapshot — both owner-writable — which meant a player
   * could grant themselves the answers by writing a key into their own
   * progress. It now asks the table only the server can write. See
   * supabase/migrations/20260818121000_amordle_daily_entitlement_authority_v1.sql.
   *
   * A failed read denies rather than allows. The answers are the thing being
   * protected, and the cost of a false denial is that a player who paid has to
   * reload; the cost of a false grant is the puzzle.
   */
  const { data: entitlements, error } = await client.rpc('list_my_daily_entitlements_v1');
  if (error || !Array.isArray(entitlements)) return false;
  return entitlements.some(
    (row) =>
      row.local_date === localDate &&
      row.mode === mode &&
      (row.state === 'pending' || row.state === 'unlocked'),
  );
}
