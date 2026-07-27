import 'server-only';

import { createHash } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { z } from 'zod';
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

const serverProgressSchema = z
  .object({
    schemaVersion: z.literal(1),
    xp: z.number().int().nonnegative(),
    level: z.number().int().positive(),
    dailyStreak: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
    solo: z.record(z.string(), z.unknown()).optional(),
    appliedRewards: z.record(z.string(), z.number()).optional(),
    dailyEntitlements: z.record(z.string(), z.enum(['pending', 'unlocked'])).optional(),
  })
  .strict();

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
  const snapshot = await client
    .from('progress_snapshots')
    .select('progress')
    .eq('user_id', data.user.id)
    .maybeSingle();
  const parsed = serverProgressSchema.safeParse(snapshot.data?.progress);
  return Boolean(parsed.success && parsed.data.dailyEntitlements?.[`${localDate}:${mode}`]);
}
