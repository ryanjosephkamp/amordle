-- Phase 42 Stage 42.4: public site stats and private admin dashboard RPCs.
--
-- Additive migration only. This creates aggregate-only projections for public
-- site stats and authenticated admin operational summaries. It does not grant
-- direct browser table access, does not expose raw auth ids/emails/private row
-- data, and does not alter spectator, Daily claim, ranked queue, trusted
-- settlement, gameplay, or Elo authority.

create or replace function public.get_public_site_stats_v1()
returns table (
  stats_key text,
  generated_at timestamptz,
  public_profiles_active bigint,
  ranked_practice_public_players bigint,
  ranked_practice_public_player_results bigint,
  ranked_practice_public_og_players bigint,
  ranked_practice_public_go_players bigint,
  leaderboard_updated_at timestamptz,
  public_profiles_updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with active_public_profiles as (
    select
      profile.user_id,
      profile.updated_at
    from public.public_player_profiles as profile
    where profile.visibility = 'public'
      and profile.moderation_status = 'active'
      and profile.display_name is not null
  ),
  eligible_ranked_profiles as (
    select
      rating_profile.user_id,
      rating_profile.bucket,
      rating_profile.games_played,
      rating_profile.updated_at
    from public.multiplayer_rating_profiles as rating_profile
    join active_public_profiles as profile
      on profile.user_id = rating_profile.user_id
    where rating_profile.bucket in ('async:og', 'async:go')
      and rating_profile.games_played > 0
  )
  select
    'site-stats-v1'::text as stats_key,
    now() as generated_at,
    (select count(*) from active_public_profiles)::bigint as public_profiles_active,
    (select count(distinct user_id) from eligible_ranked_profiles)::bigint as ranked_practice_public_players,
    coalesce((select sum(games_played)::bigint from eligible_ranked_profiles), 0::bigint) as ranked_practice_public_player_results,
    (
      select count(distinct user_id)
      from eligible_ranked_profiles
      where bucket = 'async:og'
    )::bigint as ranked_practice_public_og_players,
    (
      select count(distinct user_id)
      from eligible_ranked_profiles
      where bucket = 'async:go'
    )::bigint as ranked_practice_public_go_players,
    (select max(updated_at) from eligible_ranked_profiles) as leaderboard_updated_at,
    (select max(updated_at) from active_public_profiles) as public_profiles_updated_at;
$$;

comment on function public.get_public_site_stats_v1()
  is 'Phase 42 public aggregate site stats projection. Returns only non-identifying public aggregate counts and safe freshness timestamps.';

create or replace function public.get_admin_operational_dashboard_v1()
returns table (
  dashboard_key text,
  generated_at timestamptz,
  accounts_total bigint,
  public_profiles_total bigint,
  public_profiles_active_public bigint,
  public_profiles_hidden_or_private bigint,
  public_profiles_suspended bigint,
  ranked_profiles_total bigint,
  ranked_profiles_established bigint,
  ranked_queue_pending bigint,
  ranked_queue_stale_candidates bigint,
  async_games_active bigint,
  async_games_terminal bigint,
  private_match_requests_pending bigint,
  private_match_requests_terminal bigint,
  daily_claims_today bigint,
  latest_ranked_queue_activity_at timestamptz,
  latest_private_request_activity_at timestamptz,
  latest_async_game_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_app_roles jsonb := coalesce(auth.jwt() -> 'app_metadata' -> 'roles', '[]'::jsonb);
  v_stale_queue_cutoff timestamptz := now() - interval '15 minutes';
  v_today_key text := to_char((now() at time zone 'utc')::date, 'YYYY-MM-DD');
begin
  if auth.role() <> 'authenticated' or v_user_id is null then
    raise exception 'Admin dashboard authentication required.' using errcode = '28000';
  end if;

  v_is_admin := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
    or (
      jsonb_typeof(v_app_roles) = 'array'
      and v_app_roles ? 'admin'
    )
    or exists (
      select 1
      from public.profiles as profile
      where profile.id = v_user_id
        and profile.role = 'admin'
    );

  if not v_is_admin then
    raise exception 'Admin dashboard access denied.' using errcode = '42501';
  end if;

  return query
  select
    'admin-operational-dashboard-v1'::text as dashboard_key,
    now() as generated_at,
    (select count(*) from public.profiles)::bigint as accounts_total,
    (select count(*) from public.public_player_profiles)::bigint as public_profiles_total,
    (
      select count(*)
      from public.public_player_profiles as profile
      where profile.visibility = 'public'
        and profile.moderation_status = 'active'
        and profile.display_name is not null
    )::bigint as public_profiles_active_public,
    (
      select count(*)
      from public.public_player_profiles as profile
      where profile.visibility <> 'public'
        or profile.moderation_status = 'hidden'
    )::bigint as public_profiles_hidden_or_private,
    (
      select count(*)
      from public.public_player_profiles as profile
      where profile.moderation_status = 'suspended'
    )::bigint as public_profiles_suspended,
    (select count(*) from public.multiplayer_rating_profiles)::bigint as ranked_profiles_total,
    (
      select count(*)
      from public.multiplayer_rating_profiles as rating_profile
      where rating_profile.provisional is distinct from true
    )::bigint as ranked_profiles_established,
    (
      select count(*)
      from public.multiplayer_matchmaking_queue as queue_row
      where queue_row.status = 'queued'
        and queue_row.ranked is true
        and queue_row.transport = 'async'
        and queue_row.scope = 'practice'
    )::bigint as ranked_queue_pending,
    (
      select count(*)
      from public.multiplayer_matchmaking_queue as queue_row
      where queue_row.status = 'queued'
        and queue_row.ranked is true
        and queue_row.transport = 'async'
        and queue_row.scope = 'practice'
        and queue_row.queued_at < v_stale_queue_cutoff
    )::bigint as ranked_queue_stale_candidates,
    (
      select count(*)
      from public.async_multiplayer_games as game_row
      where game_row.status in ('waiting', 'playing')
    )::bigint as async_games_active,
    (
      select count(*)
      from public.async_multiplayer_games as game_row
      where game_row.status in ('won', 'lost', 'expired', 'cancelled')
    )::bigint as async_games_terminal,
    (
      select count(*)
      from public.multiplayer_private_match_requests as request_row
      where request_row.status = 'requested'
        and request_row.expires_at > now()
    )::bigint as private_match_requests_pending,
    (
      select count(*)
      from public.multiplayer_private_match_requests as request_row
      where request_row.status in ('created', 'declined', 'cancelled', 'expired')
    )::bigint as private_match_requests_terminal,
    (
      select count(*)
      from public.multiplayer_daily_claims as claim_row
      where claim_row.daily_date_key = v_today_key
    )::bigint as daily_claims_today,
    (
      select max(queue_row.queued_at)
      from public.multiplayer_matchmaking_queue as queue_row
      where queue_row.ranked is true
        and queue_row.transport = 'async'
        and queue_row.scope = 'practice'
    ) as latest_ranked_queue_activity_at,
    (
      select max(request_row.updated_at)
      from public.multiplayer_private_match_requests as request_row
    ) as latest_private_request_activity_at,
    (
      select max(game_row.updated_at)
      from public.async_multiplayer_games as game_row
    ) as latest_async_game_activity_at;
end;
$$;

comment on function public.get_admin_operational_dashboard_v1()
  is 'Phase 42 authenticated admin-only aggregate operational dashboard projection. Returns aggregate counts and safe freshness timestamps only.';

revoke all on function public.get_public_site_stats_v1() from public;
revoke all on function public.get_public_site_stats_v1() from anon;
revoke all on function public.get_public_site_stats_v1() from authenticated;

revoke all on function public.get_admin_operational_dashboard_v1() from public;
revoke all on function public.get_admin_operational_dashboard_v1() from anon;
revoke all on function public.get_admin_operational_dashboard_v1() from authenticated;

grant execute on function public.get_public_site_stats_v1() to anon;
grant execute on function public.get_public_site_stats_v1() to authenticated;
grant execute on function public.get_admin_operational_dashboard_v1() to authenticated;
