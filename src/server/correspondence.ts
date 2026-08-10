import 'server-only';

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { getPublicSupabaseConfig } from './config';

export interface CorrespondenceSweepResult {
  ran: boolean;
  examined: number;
  settled: number;
  reason?: string;
}

/*
 * v8-D. The correspondence backstop.
 *
 * A correspondence deadline is enforced the instant either player opens the game, so
 * this only matters for the one case nothing else can reach: a match both players have
 * walked away from. It is called from the daily cron rather than from a route of its
 * own, which keeps the project's sanctioned HTTP interface count at three.
 *
 * The service-role key lives only here and in the route that calls it — both under
 * `src/server/`, which the boundary scanner permits and forbids to any client file.
 *
 * A missing key is reported rather than thrown. The cron's other job is word-list
 * freshness, and a sweep that cannot run must not take that down with it.
 */
export async function sweepExpiredCorrespondence(): Promise<CorrespondenceSweepResult> {
  const config = getPublicSupabaseConfig();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!config || !serviceKey || serviceKey.length < 20) {
    return { ran: false, examined: 0, settled: 0, reason: 'service_credentials_unavailable' };
  }
  const client = createClient<Database>(config.url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.rpc('settle_amordle_expired_correspondence_v1', {
    p_limit: 200,
  });
  if (error) {
    return { ran: false, examined: 0, settled: 0, reason: 'sweep_failed' };
  }
  const result = (data ?? {}) as { examined?: number; settled?: number };
  return {
    ran: true,
    examined: Number(result.examined ?? 0),
    settled: Number(result.settled ?? 0),
  };
}
