-- Phase 40 Stage 40.3: direct private Practice match request authority.
--
-- Additive migration only. Public profile pages/cards remain source-only on
-- existing safe public profile RPCs. This migration adds authenticated-only
-- direct unranked Practice match request lifecycle RPCs and does not alter
-- ranked queues, Daily Multiplayer claims, custom-code lobbies, spectator
-- projections, public leaderboard authority, gameplay rules, or Elo math.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.multiplayer_private_match_requests (
  id text primary key default ('phase40-private-request-' || extensions.gen_random_uuid()::text),
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  opponent_user_id uuid not null references auth.users(id) on delete cascade,
  requester_public_profile_id uuid not null references public.public_player_profiles(public_profile_id) on delete restrict,
  opponent_public_profile_id uuid not null references public.public_player_profiles(public_profile_id) on delete restrict,
  mode text not null check (mode in ('og', 'go')),
  word_length integer not null check (word_length between 2 and 35),
  hard_mode boolean not null default false,
  time_limit_ms integer check (time_limit_ms is null or time_limit_ms > 0),
  go_puzzle_count integer check (go_puzzle_count is null or go_puzzle_count > 0),
  status text not null default 'requested' check (status in ('requested', 'created', 'declined', 'cancelled', 'expired')),
  created_game_id text unique references public.async_multiplayer_games(id) on delete set null,
  request_idempotency_key text not null unique,
  accept_idempotency_key text unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  check (requester_user_id <> opponent_user_id),
  check (requester_public_profile_id <> opponent_public_profile_id),
  check (
    (mode = 'og' and go_puzzle_count is null)
    or (mode = 'go' and go_puzzle_count is not null)
  )
);

create index if not exists multiplayer_private_match_requests_requester_idx
  on public.multiplayer_private_match_requests (requester_user_id, status, updated_at desc);

create index if not exists multiplayer_private_match_requests_opponent_idx
  on public.multiplayer_private_match_requests (opponent_user_id, status, updated_at desc);

create index if not exists multiplayer_private_match_requests_created_game_idx
  on public.multiplayer_private_match_requests (created_game_id)
  where created_game_id is not null;

create index if not exists multiplayer_private_match_requests_requester_recent_idx
  on public.multiplayer_private_match_requests (requester_user_id, created_at desc);

create unique index if not exists multiplayer_private_match_requests_active_pair_idx
  on public.multiplayer_private_match_requests (
    least(requester_user_id::text, opponent_user_id::text),
    greatest(requester_user_id::text, opponent_user_id::text)
  )
  where status = 'requested';

alter table public.multiplayer_private_match_requests enable row level security;

drop policy if exists "Private match request participants can read own requests"
  on public.multiplayer_private_match_requests;
create policy "Private match request participants can read own requests"
  on public.multiplayer_private_match_requests for select
  to authenticated
  using (
    (select auth.role()) = 'authenticated'
    and (select auth.uid()) in (requester_user_id, opponent_user_id)
  );

revoke all on table public.multiplayer_private_match_requests from public;
revoke all on table public.multiplayer_private_match_requests from anon;
revoke all on table public.multiplayer_private_match_requests from authenticated;

create or replace function public.phase40_expire_private_match_requests()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.multiplayer_private_match_requests as request_row
  set
    status = 'expired',
    responded_at = coalesce(request_row.responded_at, now()),
    updated_at = now()
  where request_row.status = 'requested'
    and request_row.expires_at <= now();
$$;

create or replace function public.phase40_private_match_request_response(
  p_request_id text,
  p_viewer_user_id uuid,
  p_created boolean default false,
  p_idempotent boolean default false
)
returns table (
  request_id text,
  request_status text,
  viewer_role text,
  viewer_can_accept boolean,
  viewer_can_cancel boolean,
  viewer_can_decline boolean,
  mode text,
  word_length integer,
  hard_mode boolean,
  time_limit_ms integer,
  go_puzzle_count integer,
  created_game_id text,
  created_at timestamptz,
  expires_at timestamptz,
  responded_at timestamptz,
  updated_at timestamptz,
  created boolean,
  idempotent boolean,
  requester_identity_available boolean,
  requester_public_profile_id uuid,
  requester_display_name text,
  requester_accent_color text,
  requester_flair_key text,
  requester_avatar_url text,
  requester_profile_updated_at timestamptz,
  opponent_identity_available boolean,
  opponent_public_profile_id uuid,
  opponent_display_name text,
  opponent_accent_color text,
  opponent_flair_key text,
  opponent_avatar_url text,
  opponent_profile_updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    request_row.id,
    request_row.status,
    case
      when p_viewer_user_id = request_row.requester_user_id then 'requester'
      when p_viewer_user_id = request_row.opponent_user_id then 'opponent'
      else 'participant'
    end,
    (
      p_viewer_user_id = request_row.opponent_user_id
      and request_row.status = 'requested'
      and request_row.expires_at > now()
    ),
    (
      p_viewer_user_id = request_row.requester_user_id
      and request_row.status = 'requested'
      and request_row.expires_at > now()
    ),
    (
      p_viewer_user_id = request_row.opponent_user_id
      and request_row.status = 'requested'
      and request_row.expires_at > now()
    ),
    request_row.mode,
    request_row.word_length,
    request_row.hard_mode,
    request_row.time_limit_ms,
    request_row.go_puzzle_count,
    request_row.created_game_id,
    request_row.created_at,
    request_row.expires_at,
    request_row.responded_at,
    request_row.updated_at,
    p_created,
    p_idempotent,
    requester_profile.user_id is not null,
    requester_profile.public_profile_id,
    requester_profile.display_name,
    requester_profile.accent_color,
    requester_profile.flair_key,
    requester_profile.avatar_url,
    requester_profile.updated_at,
    opponent_profile.user_id is not null,
    opponent_profile.public_profile_id,
    opponent_profile.display_name,
    opponent_profile.accent_color,
    opponent_profile.flair_key,
    opponent_profile.avatar_url,
    opponent_profile.updated_at
  from public.multiplayer_private_match_requests as request_row
  left join public.public_player_profiles as requester_profile
    on requester_profile.user_id = request_row.requester_user_id
    and requester_profile.public_profile_id = request_row.requester_public_profile_id
    and requester_profile.visibility = 'public'
    and requester_profile.moderation_status = 'active'
  left join public.public_player_profiles as opponent_profile
    on opponent_profile.user_id = request_row.opponent_user_id
    and opponent_profile.public_profile_id = request_row.opponent_public_profile_id
    and opponent_profile.visibility = 'public'
    and opponent_profile.moderation_status = 'active'
  where request_row.id = p_request_id
    and p_viewer_user_id in (request_row.requester_user_id, request_row.opponent_user_id);
$$;

create or replace function public.create_private_multiplayer_match_request(
  p_target_public_profile_id uuid,
  p_mode text,
  p_word_length integer,
  p_hard_mode boolean default false,
  p_time_limit_ms integer default null,
  p_go_puzzle_count integer default null,
  p_idempotency_key text default null,
  p_expires_at timestamptz default null
)
returns table (
  request_id text,
  request_status text,
  viewer_role text,
  viewer_can_accept boolean,
  viewer_can_cancel boolean,
  viewer_can_decline boolean,
  mode text,
  word_length integer,
  hard_mode boolean,
  time_limit_ms integer,
  go_puzzle_count integer,
  created_game_id text,
  created_at timestamptz,
  expires_at timestamptz,
  responded_at timestamptz,
  updated_at timestamptz,
  created boolean,
  idempotent boolean,
  requester_identity_available boolean,
  requester_public_profile_id uuid,
  requester_display_name text,
  requester_accent_color text,
  requester_flair_key text,
  requester_avatar_url text,
  requester_profile_updated_at timestamptz,
  opponent_identity_available boolean,
  opponent_public_profile_id uuid,
  opponent_display_name text,
  opponent_accent_color text,
  opponent_flair_key text,
  opponent_avatar_url text,
  opponent_profile_updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_requester_profile public.public_player_profiles%rowtype;
  v_opponent_profile public.public_player_profiles%rowtype;
  v_mode text := lower(nullif(btrim(p_mode), ''));
  v_word_length integer := p_word_length;
  v_hard_mode boolean := coalesce(p_hard_mode, false);
  v_time_limit_ms integer := p_time_limit_ms;
  v_go_puzzle_count integer := p_go_puzzle_count;
  v_default_expires_at timestamptz := now() + interval '10 minutes';
  v_expires_at timestamptz;
  v_request_key text;
  v_existing_id text;
  v_request_id text;
begin
  if auth.role() <> 'authenticated' or v_user_id is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  if p_target_public_profile_id is null then
    raise exception 'Target public profile id is required.' using errcode = '22023';
  end if;

  if v_mode not in ('og', 'go') then
    raise exception 'Private match requests support only OG or GO Practice games.' using errcode = '22023';
  end if;

  if v_word_length is null or v_word_length < 2 or v_word_length > 35 then
    raise exception 'Private match request word length must be between 2 and 35.' using errcode = '22023';
  end if;

  if v_time_limit_ms is not null and v_time_limit_ms <= 0 then
    raise exception 'Private match request time limit must be positive when provided.' using errcode = '22023';
  end if;

  if v_mode = 'go' and (v_go_puzzle_count is null or v_go_puzzle_count <= 0) then
    raise exception 'Private GO match requests require a positive GO puzzle count.' using errcode = '22023';
  end if;

  if v_mode = 'og' and v_go_puzzle_count is not null then
    raise exception 'Private OG match requests must not include a GO puzzle count.' using errcode = '22023';
  end if;

  perform public.phase40_expire_private_match_requests();

  select *
  into v_requester_profile
  from public.public_player_profiles as profile
  where profile.user_id = v_user_id
    and profile.visibility = 'public'
    and profile.moderation_status = 'active'
  limit 1
  for update;

  if not found then
    raise exception 'Requester must have an active public profile.' using errcode = '42501';
  end if;

  select *
  into v_opponent_profile
  from public.public_player_profiles as profile
  where profile.public_profile_id = p_target_public_profile_id
    and profile.visibility = 'public'
    and profile.moderation_status = 'active'
  limit 1
  for update;

  if not found then
    raise exception 'Target player is not available for private match requests.' using errcode = '42501';
  end if;

  if v_opponent_profile.user_id = v_user_id then
    raise exception 'Cannot request a private match with yourself.' using errcode = '22023';
  end if;

  v_expires_at := coalesce(p_expires_at, v_default_expires_at);
  if v_expires_at <= now() or v_expires_at > v_default_expires_at then
    raise exception 'Private match request expiry must be within the next 10 minutes.' using errcode = '22023';
  end if;

  v_request_key := coalesce(
    nullif(btrim(p_idempotency_key), ''),
    'phase40-private-request:create:'
      || v_user_id::text || ':'
      || v_opponent_profile.user_id::text || ':'
      || v_mode || ':'
      || v_word_length::text || ':'
      || v_hard_mode::text || ':'
      || coalesce(v_time_limit_ms::text, 'none') || ':'
      || coalesce(v_go_puzzle_count::text, 'none')
  );

  select request_row.id
  into v_existing_id
  from public.multiplayer_private_match_requests as request_row
  where request_row.request_idempotency_key = v_request_key
    and request_row.requester_user_id = v_user_id
  for update;

  if found then
    return query
    select *
    from public.phase40_private_match_request_response(v_existing_id, v_user_id, false, true);
    return;
  end if;

  select request_row.id
  into v_existing_id
  from public.multiplayer_private_match_requests as request_row
  where request_row.status = 'requested'
    and request_row.expires_at > now()
    and request_row.requester_user_id in (v_user_id, v_opponent_profile.user_id)
    and request_row.opponent_user_id in (v_user_id, v_opponent_profile.user_id)
  order by request_row.created_at desc
  limit 1
  for update;

  if found then
    return query
    select *
    from public.phase40_private_match_request_response(v_existing_id, v_user_id, false, false);
    return;
  end if;

  if (
    select count(*)
    from public.multiplayer_private_match_requests as request_row
    where request_row.requester_user_id = v_user_id
      and request_row.status = 'requested'
      and request_row.expires_at > now()
  ) >= 5 then
    raise exception 'Too many active outgoing private match requests.' using errcode = '54000';
  end if;

  if (
    select count(*)
    from public.multiplayer_private_match_requests as request_row
    where request_row.requester_user_id = v_user_id
      and request_row.created_at >= now() - interval '1 hour'
  ) >= 20 then
    raise exception 'Too many recent private match requests.' using errcode = '54000';
  end if;

  insert into public.multiplayer_private_match_requests (
    requester_user_id,
    opponent_user_id,
    requester_public_profile_id,
    opponent_public_profile_id,
    mode,
    word_length,
    hard_mode,
    time_limit_ms,
    go_puzzle_count,
    request_idempotency_key,
    expires_at
  )
  values (
    v_user_id,
    v_opponent_profile.user_id,
    v_requester_profile.public_profile_id,
    v_opponent_profile.public_profile_id,
    v_mode,
    v_word_length,
    v_hard_mode,
    v_time_limit_ms,
    v_go_puzzle_count,
    v_request_key,
    v_expires_at
  )
  returning id into v_request_id;

  return query
  select *
  from public.phase40_private_match_request_response(v_request_id, v_user_id, false, false);
end;
$$;

create or replace function public.get_private_multiplayer_match_requests(
  p_status text default null,
  p_limit integer default 50
)
returns table (
  request_id text,
  request_status text,
  viewer_role text,
  viewer_can_accept boolean,
  viewer_can_cancel boolean,
  viewer_can_decline boolean,
  mode text,
  word_length integer,
  hard_mode boolean,
  time_limit_ms integer,
  go_puzzle_count integer,
  created_game_id text,
  created_at timestamptz,
  expires_at timestamptz,
  responded_at timestamptz,
  updated_at timestamptz,
  created boolean,
  idempotent boolean,
  requester_identity_available boolean,
  requester_public_profile_id uuid,
  requester_display_name text,
  requester_accent_color text,
  requester_flair_key text,
  requester_avatar_url text,
  requester_profile_updated_at timestamptz,
  opponent_identity_available boolean,
  opponent_public_profile_id uuid,
  opponent_display_name text,
  opponent_accent_color text,
  opponent_flair_key text,
  opponent_avatar_url text,
  opponent_profile_updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status text := lower(nullif(btrim(p_status), ''));
  v_limit integer := coalesce(p_limit, 50);
begin
  if auth.role() <> 'authenticated' or v_user_id is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  if v_status is not null and v_status not in ('requested', 'created', 'declined', 'cancelled', 'expired') then
    raise exception 'Unsupported private match request status filter.' using errcode = '22023';
  end if;

  if v_limit < 1 or v_limit > 100 then
    raise exception 'Private match request limit must be between 1 and 100.' using errcode = '22023';
  end if;

  perform public.phase40_expire_private_match_requests();

  return query
  select response_row.*
  from (
    select request_row.id
    from public.multiplayer_private_match_requests as request_row
    where v_user_id in (request_row.requester_user_id, request_row.opponent_user_id)
      and (v_status is null or request_row.status = v_status)
    order by request_row.updated_at desc, request_row.created_at desc
    limit v_limit
  ) as request_ids
  cross join lateral public.phase40_private_match_request_response(
    request_ids.id,
    v_user_id,
    false,
    false
  ) as response_row;
end;
$$;

create or replace function public.cancel_private_multiplayer_match_request(p_request_id text)
returns table (
  request_id text,
  request_status text,
  viewer_role text,
  viewer_can_accept boolean,
  viewer_can_cancel boolean,
  viewer_can_decline boolean,
  mode text,
  word_length integer,
  hard_mode boolean,
  time_limit_ms integer,
  go_puzzle_count integer,
  created_game_id text,
  created_at timestamptz,
  expires_at timestamptz,
  responded_at timestamptz,
  updated_at timestamptz,
  created boolean,
  idempotent boolean,
  requester_identity_available boolean,
  requester_public_profile_id uuid,
  requester_display_name text,
  requester_accent_color text,
  requester_flair_key text,
  requester_avatar_url text,
  requester_profile_updated_at timestamptz,
  opponent_identity_available boolean,
  opponent_public_profile_id uuid,
  opponent_display_name text,
  opponent_accent_color text,
  opponent_flair_key text,
  opponent_avatar_url text,
  opponent_profile_updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request_id text;
begin
  if auth.role() <> 'authenticated' or v_user_id is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  perform public.phase40_expire_private_match_requests();

  update public.multiplayer_private_match_requests as request_row
  set
    status = 'cancelled',
    responded_at = now(),
    updated_at = now()
  where request_row.id = p_request_id
    and request_row.requester_user_id = v_user_id
    and request_row.status = 'requested'
    and request_row.expires_at > now()
  returning request_row.id into v_request_id;

  if v_request_id is null then
    raise exception 'Private match request cannot be cancelled by current user.' using errcode = '42501';
  end if;

  return query
  select *
  from public.phase40_private_match_request_response(v_request_id, v_user_id, false, false);
end;
$$;

create or replace function public.decline_private_multiplayer_match_request(p_request_id text)
returns table (
  request_id text,
  request_status text,
  viewer_role text,
  viewer_can_accept boolean,
  viewer_can_cancel boolean,
  viewer_can_decline boolean,
  mode text,
  word_length integer,
  hard_mode boolean,
  time_limit_ms integer,
  go_puzzle_count integer,
  created_game_id text,
  created_at timestamptz,
  expires_at timestamptz,
  responded_at timestamptz,
  updated_at timestamptz,
  created boolean,
  idempotent boolean,
  requester_identity_available boolean,
  requester_public_profile_id uuid,
  requester_display_name text,
  requester_accent_color text,
  requester_flair_key text,
  requester_avatar_url text,
  requester_profile_updated_at timestamptz,
  opponent_identity_available boolean,
  opponent_public_profile_id uuid,
  opponent_display_name text,
  opponent_accent_color text,
  opponent_flair_key text,
  opponent_avatar_url text,
  opponent_profile_updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request_id text;
begin
  if auth.role() <> 'authenticated' or v_user_id is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  perform public.phase40_expire_private_match_requests();

  update public.multiplayer_private_match_requests as request_row
  set
    status = 'declined',
    responded_at = now(),
    updated_at = now()
  where request_row.id = p_request_id
    and request_row.opponent_user_id = v_user_id
    and request_row.status = 'requested'
    and request_row.expires_at > now()
  returning request_row.id into v_request_id;

  if v_request_id is null then
    raise exception 'Private match request cannot be declined by current user.' using errcode = '42501';
  end if;

  return query
  select *
  from public.phase40_private_match_request_response(v_request_id, v_user_id, false, false);
end;
$$;

create or replace function public.accept_private_multiplayer_match_request(
  p_request_id text,
  p_game_projection jsonb,
  p_idempotency_key text default null
)
returns table (
  request_id text,
  request_status text,
  viewer_role text,
  viewer_can_accept boolean,
  viewer_can_cancel boolean,
  viewer_can_decline boolean,
  mode text,
  word_length integer,
  hard_mode boolean,
  time_limit_ms integer,
  go_puzzle_count integer,
  created_game_id text,
  created_at timestamptz,
  expires_at timestamptz,
  responded_at timestamptz,
  updated_at timestamptz,
  created boolean,
  idempotent boolean,
  requester_identity_available boolean,
  requester_public_profile_id uuid,
  requester_display_name text,
  requester_accent_color text,
  requester_flair_key text,
  requester_avatar_url text,
  requester_profile_updated_at timestamptz,
  opponent_identity_available boolean,
  opponent_public_profile_id uuid,
  opponent_display_name text,
  opponent_accent_color text,
  opponent_flair_key text,
  opponent_avatar_url text,
  opponent_profile_updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.multiplayer_private_match_requests%rowtype;
  v_existing_game public.async_multiplayer_games%rowtype;
  v_game_id text;
  v_current_turn text;
  v_difficulty text;
  v_word_length_text text;
  v_hard_mode_text text;
  v_hard_mode boolean;
  v_time_limit_text text;
  v_time_limit_ms integer;
  v_go_puzzle_count_text text;
  v_go_puzzle_count integer;
  v_accept_key text;
begin
  if auth.role() <> 'authenticated' or v_user_id is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  if p_game_projection is null or jsonb_typeof(p_game_projection) <> 'object' then
    raise exception 'Private match accept requires a fresh game projection object.' using errcode = '22023';
  end if;

  perform public.phase40_expire_private_match_requests();

  select *
  into v_request
  from public.multiplayer_private_match_requests as request_row
  where request_row.id = p_request_id
  for update;

  if not found or v_user_id not in (v_request.requester_user_id, v_request.opponent_user_id) then
    raise exception 'Private match request not found for current user.' using errcode = '42501';
  end if;

  if v_user_id <> v_request.opponent_user_id then
    raise exception 'Only the requested opponent can accept this private match request.' using errcode = '42501';
  end if;

  v_game_id := nullif(btrim(p_game_projection ->> 'id'), '');
  if v_game_id is null then
    raise exception 'Private match accept requires a new game id.' using errcode = '22023';
  end if;

  v_accept_key := coalesce(
    nullif(btrim(p_idempotency_key), ''),
    'phase40-private-request:accept:' || v_request.id || ':' || v_game_id
  );

  if v_request.status = 'created' and v_request.created_game_id is not null then
    if v_request.accept_idempotency_key = v_accept_key or v_request.created_game_id = v_game_id then
      return query
      select *
      from public.phase40_private_match_request_response(v_request.id, v_user_id, false, true);
      return;
    end if;
    raise exception 'Private match request already created a different game.' using errcode = '23505';
  end if;

  if v_request.status <> 'requested' or v_request.expires_at <= now() then
    raise exception 'Private match request is no longer acceptable.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.public_player_profiles as profile
    where profile.user_id = v_request.requester_user_id
      and profile.public_profile_id = v_request.requester_public_profile_id
      and profile.visibility = 'public'
      and profile.moderation_status = 'active'
  ) or not exists (
    select 1
    from public.public_player_profiles as profile
    where profile.user_id = v_request.opponent_user_id
      and profile.public_profile_id = v_request.opponent_public_profile_id
      and profile.visibility = 'public'
      and profile.moderation_status = 'active'
  ) then
    raise exception 'Both players must still have active public profiles.' using errcode = '42501';
  end if;

  if v_game_id = v_request.id then
    raise exception 'Private match accept must create a fresh game id.' using errcode = '22023';
  end if;

  if lower(coalesce(p_game_projection ->> 'scope', '')) <> 'practice'
    or lower(coalesce(p_game_projection ->> 'mode', '')) <> v_request.mode
    or coalesce(p_game_projection ->> 'ranked', 'false') <> 'false'
    or nullif(p_game_projection ->> 'ratingBucket', '') is not null
    or nullif(p_game_projection ->> 'matchmakingRequestId', '') is not null
    or nullif(p_game_projection ->> 'customGameCode', '') is not null
    or nullif(p_game_projection ->> 'dailyDateKey', '') is not null
    or p_game_projection ->> 'status' is distinct from 'playing'
    or p_game_projection #>> '{playerUserIds,player-one}' is distinct from v_request.requester_user_id::text
    or p_game_projection #>> '{playerUserIds,player-two}' is distinct from v_request.opponent_user_id::text
  then
    raise exception 'Private match game projection does not match the approved unranked Practice contract.' using errcode = '22023';
  end if;

  v_word_length_text := p_game_projection ->> 'wordLength';
  if coalesce(v_word_length_text, '') !~ '^[0-9]+$'
    or v_word_length_text::integer <> v_request.word_length
  then
    raise exception 'Private match game word length does not match the request.' using errcode = '22023';
  end if;

  v_hard_mode_text := lower(coalesce(p_game_projection ->> 'hardMode', 'false'));
  if v_hard_mode_text not in ('true', 'false') then
    raise exception 'Private match game Hard Mode setting is invalid.' using errcode = '22023';
  end if;
  v_hard_mode := v_hard_mode_text::boolean;
  if v_hard_mode is distinct from v_request.hard_mode then
    raise exception 'Private match game Hard Mode does not match the request.' using errcode = '22023';
  end if;

  v_time_limit_text := nullif(p_game_projection ->> 'timeLimitMs', '');
  if v_time_limit_text is not null and v_time_limit_text <> '0' then
    if v_time_limit_text !~ '^[0-9]+$' then
      raise exception 'Private match game time limit is invalid.' using errcode = '22023';
    end if;
    v_time_limit_ms := v_time_limit_text::integer;
    if v_time_limit_ms <= 0 then
      v_time_limit_ms := null;
    end if;
  end if;
  if v_time_limit_ms is distinct from v_request.time_limit_ms then
    raise exception 'Private match game time limit does not match the request.' using errcode = '22023';
  end if;

  v_go_puzzle_count_text := nullif(p_game_projection ->> 'goPuzzleCount', '');
  if v_go_puzzle_count_text is not null then
    if v_go_puzzle_count_text !~ '^[0-9]+$' then
      raise exception 'Private match game GO puzzle count is invalid.' using errcode = '22023';
    end if;
    v_go_puzzle_count := v_go_puzzle_count_text::integer;
  else
    v_go_puzzle_count := null;
  end if;

  if v_request.mode = 'go' and (v_go_puzzle_count is null or v_go_puzzle_count <> v_request.go_puzzle_count) then
    raise exception 'Private match GO puzzle count does not match the request.' using errcode = '22023';
  end if;

  if v_request.mode = 'og' and v_go_puzzle_count is not null then
    raise exception 'Private match OG games must not include a GO puzzle count.' using errcode = '22023';
  end if;

  v_current_turn := p_game_projection ->> 'currentTurn';
  if v_current_turn not in ('player-one', 'player-two') then
    raise exception 'Private match game current turn is invalid.' using errcode = '22023';
  end if;

  v_difficulty := coalesce(nullif(p_game_projection ->> 'difficulty', ''), 'medium');

  select *
  into v_existing_game
  from public.async_multiplayer_games as game_row
  where game_row.id = v_game_id
  for update;

  if found then
    raise exception 'Private match game id already exists.' using errcode = '23505';
  end if;

  insert into public.async_multiplayer_games (
    id,
    scope,
    mode,
    daily_date_key,
    status,
    current_turn,
    word_length,
    difficulty,
    go_puzzle_count,
    host_user_id,
    player_one_user_id,
    player_two_user_id,
    ranked,
    rating_bucket,
    matchmaking_request_id,
    custom_game_code,
    winner_player_id,
    deadline_at,
    ended_at,
    projection,
    created_at,
    updated_at
  )
  values (
    v_game_id,
    'practice',
    v_request.mode,
    null,
    'playing',
    v_current_turn,
    v_request.word_length,
    v_difficulty,
    v_go_puzzle_count,
    v_request.requester_user_id,
    v_request.requester_user_id,
    v_request.opponent_user_id,
    false,
    null,
    null,
    null,
    null,
    null,
    null,
    p_game_projection,
    now(),
    now()
  );

  update public.multiplayer_private_match_requests as request_row
  set
    status = 'created',
    created_game_id = v_game_id,
    accept_idempotency_key = v_accept_key,
    responded_at = now(),
    updated_at = now()
  where request_row.id = v_request.id
  returning request_row.id into v_request.id;

  return query
  select *
  from public.phase40_private_match_request_response(v_request.id, v_user_id, true, false);
end;
$$;

comment on table public.multiplayer_private_match_requests
  is 'Phase 40 durable authenticated-only request state for direct unranked Practice private match requests between active public profiles.';

comment on function public.create_private_multiplayer_match_request(uuid, text, integer, boolean, integer, integer, text, timestamptz)
  is 'Phase 40 authenticated RPC to create an unranked Practice private match request to an active public profile.';

comment on function public.get_private_multiplayer_match_requests(text, integer)
  is 'Phase 40 authenticated RPC returning sanitized private match request state for the current user.';

comment on function public.cancel_private_multiplayer_match_request(text)
  is 'Phase 40 authenticated requester RPC to cancel a pending private match request.';

comment on function public.decline_private_multiplayer_match_request(text)
  is 'Phase 40 authenticated opponent RPC to decline a pending private match request.';

comment on function public.accept_private_multiplayer_match_request(text, jsonb, text)
  is 'Phase 40 authenticated opponent RPC to accept a pending private match request and create one fresh unranked Practice async game.';

revoke all on function public.phase40_expire_private_match_requests() from public;
revoke all on function public.phase40_expire_private_match_requests() from anon;
revoke all on function public.phase40_expire_private_match_requests() from authenticated;

revoke all on function public.phase40_private_match_request_response(text, uuid, boolean, boolean) from public;
revoke all on function public.phase40_private_match_request_response(text, uuid, boolean, boolean) from anon;
revoke all on function public.phase40_private_match_request_response(text, uuid, boolean, boolean) from authenticated;

revoke all on function public.create_private_multiplayer_match_request(uuid, text, integer, boolean, integer, integer, text, timestamptz) from public;
revoke all on function public.create_private_multiplayer_match_request(uuid, text, integer, boolean, integer, integer, text, timestamptz) from anon;
revoke all on function public.create_private_multiplayer_match_request(uuid, text, integer, boolean, integer, integer, text, timestamptz) from authenticated;

revoke all on function public.get_private_multiplayer_match_requests(text, integer) from public;
revoke all on function public.get_private_multiplayer_match_requests(text, integer) from anon;
revoke all on function public.get_private_multiplayer_match_requests(text, integer) from authenticated;

revoke all on function public.cancel_private_multiplayer_match_request(text) from public;
revoke all on function public.cancel_private_multiplayer_match_request(text) from anon;
revoke all on function public.cancel_private_multiplayer_match_request(text) from authenticated;

revoke all on function public.decline_private_multiplayer_match_request(text) from public;
revoke all on function public.decline_private_multiplayer_match_request(text) from anon;
revoke all on function public.decline_private_multiplayer_match_request(text) from authenticated;

revoke all on function public.accept_private_multiplayer_match_request(text, jsonb, text) from public;
revoke all on function public.accept_private_multiplayer_match_request(text, jsonb, text) from anon;
revoke all on function public.accept_private_multiplayer_match_request(text, jsonb, text) from authenticated;

grant execute on function public.create_private_multiplayer_match_request(uuid, text, integer, boolean, integer, integer, text, timestamptz) to authenticated;
grant execute on function public.get_private_multiplayer_match_requests(text, integer) to authenticated;
grant execute on function public.cancel_private_multiplayer_match_request(text) to authenticated;
grant execute on function public.decline_private_multiplayer_match_request(text) to authenticated;
grant execute on function public.accept_private_multiplayer_match_request(text, jsonb, text) to authenticated;
