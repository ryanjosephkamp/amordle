'use client';

import { z } from 'zod';
import { getBrowserSupabase } from './browser';
import { parseServiceResult, ServiceError, throwServiceError } from './shared';

const roleSchema = z.object({ role: z.string() }).strict();

export const dashboardSchema = z
  .object({
    accounts_total: z.number().int(),
    async_games_active: z.number().int(),
    async_games_terminal: z.number().int(),
    daily_claims_today: z.number().int(),
    dashboard_key: z.string(),
    generated_at: z.string(),
    latest_async_game_activity_at: z.string().nullable(),
    latest_private_request_activity_at: z.string().nullable(),
    latest_ranked_queue_activity_at: z.string().nullable(),
    private_match_requests_pending: z.number().int(),
    private_match_requests_terminal: z.number().int(),
    public_profiles_active_public: z.number().int(),
    public_profiles_hidden_or_private: z.number().int(),
    public_profiles_suspended: z.number().int(),
    public_profiles_total: z.number().int(),
    ranked_profiles_established: z.number().int(),
    ranked_profiles_total: z.number().int(),
    ranked_queue_pending: z.number().int(),
    ranked_queue_stale_candidates: z.number().int(),
  })
  .strict();

function client() {
  const value = getBrowserSupabase();
  if (!value) throw new ServiceError('Admin services are unavailable.', 'UNAVAILABLE');
  return value;
}

export async function getMyRole(userId: string) {
  const { data, error } = await client()
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (error) throwServiceError(error);
  return parseServiceResult(roleSchema.nullable(), data)?.role ?? 'player';
}

export async function getAdminDashboard() {
  const { data, error } = await client().rpc('get_admin_operational_dashboard_v1');
  if (error) throwServiceError(error);
  return parseServiceResult(dashboardSchema, data?.[0]);
}

const refreshSchema = z
  .object({
    status: z.enum(['current', 'upstream_release_available']),
    deployedRevision: z.string().regex(/^[a-f0-9]{64}$/),
    deployedUpstreamCommit: z.string().regex(/^[a-f0-9]{40}$/),
    observedUpstreamCommit: z.string().regex(/^[a-f0-9]{40}$/),
    observedReleaseDate: z.iso.date(),
    checkedAt: z.iso.datetime(),
    nextAction: z.enum(['none', 'repository_refresh_required']),
  })
  .strict();

export async function requestWordFreshness() {
  const { data } = await client().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ServiceError('Your session needs to be restored.', 'UNAUTHORIZED');
  const response = await fetch('/api/admin-refresh', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok)
    throw new ServiceError('Word-list freshness could not be checked.', String(response.status));
  return parseServiceResult(refreshSchema, await response.json());
}
