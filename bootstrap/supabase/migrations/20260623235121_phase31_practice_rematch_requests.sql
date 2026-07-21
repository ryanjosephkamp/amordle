-- Phase 31 Stage 31.3: Practice-only rematch mutual-intent authority.
--
-- Additive migration only. This creates participant-scoped rematch request
-- state and authenticated-only RPCs for completed unranked non-custom Practice
-- Multiplayer games. Daily, ranked, and custom/private-code games are rejected.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.multiplayer_practice_rematch_requests (
  id text primary key default ('phase31-rematch-' || gen_random_uuid()::text),
  source_game_id text not null references public.async_multiplayer_games(id) on delete cascade,
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  opponent_user_id uuid not null references auth.users(id) on delete cascade,
  player_one_user_id uuid not null references auth.users(id) on delete cascade,
  player_two_user_id uuid not null references auth.users(id) on delete cascade,
  requester_seat text not null check (requester_seat in ('player-one', 'player-two')),
  opponent_seat text not null check (opponent_seat in ('player-one', 'player-two')),
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
  check (player_one_user_id <> player_two_user_id),
  check (requester_seat <> opponent_seat),
  check (
    (
      requester_seat = 'player-one'
      and opponent_seat = 'player-two'
      and requester_user_id = player_one_user_id
      and opponent_user_id = player_two_user_id
    )
    or (
      requester_seat = 'player-two'
      and opponent_seat = 'player-one'
      and requester_user_id = player_two_user_id
      and opponent_user_id = player_one_user_id
    )
  )
);

create index if not exists multiplayer_practice_rematch_requests_source_idx
  on public.multiplayer_practice_rematch_requests (source_game_id, updated_at desc);

create index if not exists multiplayer_practice_rematch_requests_requester_idx
  on public.multiplayer_practice_rematch_requests (requester_user_id, status, updated_at desc);

create index if not exists multiplayer_practice_rematch_requests_opponent_idx
  on public.multiplayer_practice_rematch_requests (opponent_user_id, status, updated_at desc);

create unique index if not exists multiplayer_practice_rematch_requests_active_pair_idx
  on public.multiplayer_practice_rematch_requests (
    source_game_id,
    least(requester_user_id::text, opponent_user_id::text),
    greatest(requester_user_id::text, opponent_user_id::text)
  )
  where status = 'requested';

alter table public.multiplayer_practice_rematch_requests enable row level security;

drop policy if exists "Participants can read practice rematch requests" on public.multiplayer_practice_rematch_requests;
create policy "Participants can read practice rematch requests"
  on public.multiplayer_practice_rematch_requests for select
  using (
    (select auth.role()) = 'authenticated'
    and (select auth.uid()) in (requester_user_id, opponent_user_id)
  );

revoke all on table public.multiplayer_practice_rematch_requests from public;
revoke all on table public.multiplayer_practice_rematch_requests from anon;
revoke all on table public.multiplayer_practice_rematch_requests from authenticated;

create or replace function public.phase31_expire_practice_rematch_requests()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.multiplayer_practice_rematch_requests as request_row
  set
    status = 'expired',
    responded_at = coalesce(request_row.responded_at, now()),
    updated_at = now()
  where request_row.status = 'requested'
    and request_row.expires_at <= now();
$$;

create or replace function public.phase31_practice_rematch_response(
  p_request_id text,
  p_viewer_user_id uuid,
  p_created boolean default false,
  p_idempotent boolean default false
)
returns table (
  request_id text,
  source_game_id text,
  request_status text,
  requester_seat text,
  opponent_seat text,
  viewer_role text,
  viewer_can_accept boolean,
  viewer_can_cancel boolean,
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
  idempotent boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    request_row.id,
    request_row.source_game_id,
    request_row.status,
    request_row.requester_seat,
    request_row.opponent_seat,
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
    p_idempotent
  from public.multiplayer_practice_rematch_requests as request_row
  where request_row.id = p_request_id
    and p_viewer_user_id in (request_row.requester_user_id, request_row.opponent_user_id);
$$;

create or replace function public.request_practice_multiplayer_rematch(
  p_source_game_id text,
  p_idempotency_key text default null,
  p_expires_at timestamptz default null
)
returns table (
  request_id text,
  source_game_id text,
  request_status text,
  requester_seat text,
  opponent_seat text,
  viewer_role text,
  viewer_can_accept boolean,
  viewer_can_cancel boolean,
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
  idempotent boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_source public.async_multiplayer_games%rowtype;
  v_existing_id text;
  v_request_id text;
  v_requester_seat text;
  v_opponent_seat text;
  v_opponent_user_id uuid;
  v_request_key text;
  v_default_expires_at timestamptz := now() + interval '10 minutes';
  v_expires_at timestamptz;
  v_hard_mode boolean := false;
  v_hard_mode_text text;
  v_time_limit_ms integer;
  v_time_limit_text text;
  v_go_puzzle_count integer;
  v_go_puzzle_count_text text;
begin
  if auth.role() <> 'authenticated' or v_user_id is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  if nullif(btrim(p_source_game_id), '') is null then
    raise exception 'Source game id is required.' using errcode = '22023';
  end if;

  perform public.phase31_expire_practice_rematch_requests();

  select *
  into v_source
  from public.async_multiplayer_games as game_row
  where game_row.id = p_source_game_id
  for update;

  if not found then
    raise exception 'Source game not found.' using errcode = '22023';
  end if;

  if v_source.scope <> 'practice'
    or v_source.daily_date_key is not null
    or v_source.status not in ('won', 'lost', 'expired')
    or v_source.ranked is distinct from false
    or v_source.rating_bucket is not null
    or v_source.matchmaking_request_id is not null
    or v_source.custom_game_code is not null
    or nullif(v_source.projection ->> 'dailyDateKey', '') is not null
    or nullif(v_source.projection ->> 'customGameCode', '') is not null
    or v_source.player_one_user_id is null
    or v_source.player_two_user_id is null
    or v_source.player_one_user_id = v_source.player_two_user_id
  then
    raise exception 'Source game is not eligible for direct Practice rematch.' using errcode = '22023';
  end if;

  if v_user_id = v_source.player_one_user_id then
    v_requester_seat := 'player-one';
    v_opponent_seat := 'player-two';
    v_opponent_user_id := v_source.player_two_user_id;
  elsif v_user_id = v_source.player_two_user_id then
    v_requester_seat := 'player-two';
    v_opponent_seat := 'player-one';
    v_opponent_user_id := v_source.player_one_user_id;
  else
    raise exception 'Only source game participants can request a rematch.' using errcode = '42501';
  end if;

  if v_source.word_length < 2 or v_source.word_length > 35 then
    raise exception 'Source game word length is not eligible for rematch.' using errcode = '22023';
  end if;

  v_hard_mode_text := lower(nullif(v_source.projection ->> 'hardMode', ''));
  if v_hard_mode_text is not null then
    if v_hard_mode_text not in ('true', 'false') then
      raise exception 'Source game Hard Mode setting is invalid.' using errcode = '22023';
    end if;
    v_hard_mode := v_hard_mode_text::boolean;
  end if;

  v_time_limit_text := nullif(v_source.projection ->> 'timeLimitMs', '');
  if v_time_limit_text is not null and v_time_limit_text <> '0' then
    if v_time_limit_text !~ '^[0-9]+$' then
      raise exception 'Source game time-limit setting is invalid.' using errcode = '22023';
    end if;
    v_time_limit_ms := v_time_limit_text::integer;
    if v_time_limit_ms <= 0 then
      v_time_limit_ms := null;
    end if;
  end if;

  v_go_puzzle_count := v_source.go_puzzle_count;
  if v_go_puzzle_count is null then
    v_go_puzzle_count_text := nullif(v_source.projection ->> 'goPuzzleCount', '');
    if v_go_puzzle_count_text is not null then
      if v_go_puzzle_count_text !~ '^[0-9]+$' then
        raise exception 'Source game GO puzzle count is invalid.' using errcode = '22023';
      end if;
      v_go_puzzle_count := v_go_puzzle_count_text::integer;
    end if;
  end if;

  if v_source.mode = 'go' and (v_go_puzzle_count is null or v_go_puzzle_count < 1) then
    raise exception 'GO rematches require a source puzzle count.' using errcode = '22023';
  end if;

  if v_source.mode = 'og' then
    v_go_puzzle_count := null;
  end if;

  v_expires_at := coalesce(p_expires_at, v_default_expires_at);
  if v_expires_at <= now() or v_expires_at > v_default_expires_at then
    raise exception 'Rematch expiry must be within the next 10 minutes.' using errcode = '22023';
  end if;

  v_request_key := coalesce(
    nullif(btrim(p_idempotency_key), ''),
    'phase31-rematch:request:' || p_source_game_id || ':' || v_user_id::text || ':' || v_opponent_user_id::text
  );

  select request_row.id
  into v_existing_id
  from public.multiplayer_practice_rematch_requests as request_row
  where request_row.request_idempotency_key = v_request_key
  for update;

  if found then
    return query
    select *
    from public.phase31_practice_rematch_response(v_existing_id, v_user_id, false, true);
    return;
  end if;

  select request_row.id
  into v_existing_id
  from public.multiplayer_practice_rematch_requests as request_row
  where request_row.source_game_id = p_source_game_id
    and request_row.status = 'requested'
    and request_row.expires_at > now()
    and request_row.requester_user_id in (v_user_id, v_opponent_user_id)
    and request_row.opponent_user_id in (v_user_id, v_opponent_user_id)
  order by request_row.created_at desc
  limit 1
  for update;

  if found then
    return query
    select *
    from public.phase31_practice_rematch_response(v_existing_id, v_user_id, false, false);
    return;
  end if;

  insert into public.multiplayer_practice_rematch_requests (
    source_game_id,
    requester_user_id,
    opponent_user_id,
    player_one_user_id,
    player_two_user_id,
    requester_seat,
    opponent_seat,
    mode,
    word_length,
    hard_mode,
    time_limit_ms,
    go_puzzle_count,
    request_idempotency_key,
    expires_at
  )
  values (
    v_source.id,
    v_user_id,
    v_opponent_user_id,
    v_source.player_one_user_id,
    v_source.player_two_user_id,
    v_requester_seat,
    v_opponent_seat,
    v_source.mode,
    v_source.word_length,
    v_hard_mode,
    v_time_limit_ms,
    v_go_puzzle_count,
    v_request_key,
    v_expires_at
  )
  returning id into v_request_id;

  return query
  select *
  from public.phase31_practice_rematch_response(v_request_id, v_user_id, false, false);
end;
$$;

create or replace function public.get_practice_multiplayer_rematch_requests(
  p_source_game_id text default null,
  p_limit integer default 50
)
returns table (
  request_id text,
  source_game_id text,
  request_status text,
  requester_seat text,
  opponent_seat text,
  viewer_role text,
  viewer_can_accept boolean,
  viewer_can_cancel boolean,
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
  idempotent boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := coalesce(p_limit, 50);
begin
  if auth.role() <> 'authenticated' or v_user_id is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  if v_limit < 1 or v_limit > 100 then
    raise exception 'Rematch request limit must be between 1 and 100.' using errcode = '22023';
  end if;

  perform public.phase31_expire_practice_rematch_requests();

  return query
  select
    request_row.id,
    request_row.source_game_id,
    request_row.status,
    request_row.requester_seat,
    request_row.opponent_seat,
    case
      when v_user_id = request_row.requester_user_id then 'requester'
      when v_user_id = request_row.opponent_user_id then 'opponent'
      else 'participant'
    end,
    (
      v_user_id = request_row.opponent_user_id
      and request_row.status = 'requested'
      and request_row.expires_at > now()
    ),
    (
      v_user_id = request_row.requester_user_id
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
    false,
    false
  from public.multiplayer_practice_rematch_requests as request_row
  where v_user_id in (request_row.requester_user_id, request_row.opponent_user_id)
    and (p_source_game_id is null or request_row.source_game_id = p_source_game_id)
  order by request_row.updated_at desc, request_row.created_at desc
  limit v_limit;
end;
$$;

create or replace function public.cancel_practice_multiplayer_rematch(p_request_id text)
returns table (
  request_id text,
  source_game_id text,
  request_status text,
  requester_seat text,
  opponent_seat text,
  viewer_role text,
  viewer_can_accept boolean,
  viewer_can_cancel boolean,
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
  idempotent boolean
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

  perform public.phase31_expire_practice_rematch_requests();

  update public.multiplayer_practice_rematch_requests as request_row
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
    raise exception 'Rematch request cannot be cancelled by current user.' using errcode = '42501';
  end if;

  return query
  select *
  from public.phase31_practice_rematch_response(v_request_id, v_user_id, false, false);
end;
$$;

create or replace function public.decline_practice_multiplayer_rematch(p_request_id text)
returns table (
  request_id text,
  source_game_id text,
  request_status text,
  requester_seat text,
  opponent_seat text,
  viewer_role text,
  viewer_can_accept boolean,
  viewer_can_cancel boolean,
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
  idempotent boolean
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

  perform public.phase31_expire_practice_rematch_requests();

  update public.multiplayer_practice_rematch_requests as request_row
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
    raise exception 'Rematch request cannot be declined by current user.' using errcode = '42501';
  end if;

  return query
  select *
  from public.phase31_practice_rematch_response(v_request_id, v_user_id, false, false);
end;
$$;

create or replace function public.accept_practice_multiplayer_rematch(
  p_request_id text,
  p_game_projection jsonb,
  p_idempotency_key text default null
)
returns table (
  request_id text,
  source_game_id text,
  request_status text,
  requester_seat text,
  opponent_seat text,
  viewer_role text,
  viewer_can_accept boolean,
  viewer_can_cancel boolean,
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
  idempotent boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.multiplayer_practice_rematch_requests%rowtype;
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
    raise exception 'Rematch accept requires a fresh game projection object.' using errcode = '22023';
  end if;

  perform public.phase31_expire_practice_rematch_requests();

  select *
  into v_request
  from public.multiplayer_practice_rematch_requests as request_row
  where request_row.id = p_request_id
  for update;

  if not found or v_user_id not in (v_request.requester_user_id, v_request.opponent_user_id) then
    raise exception 'Rematch request not found for current user.' using errcode = '42501';
  end if;

  if v_user_id <> v_request.opponent_user_id then
    raise exception 'Only the rematch opponent can accept this request.' using errcode = '42501';
  end if;

  v_game_id := nullif(btrim(p_game_projection ->> 'id'), '');
  if v_game_id is null then
    raise exception 'Rematch accept requires a new game id.' using errcode = '22023';
  end if;

  v_accept_key := coalesce(nullif(btrim(p_idempotency_key), ''), 'phase31-rematch:accept:' || v_request.id || ':' || v_game_id);

  if v_request.status = 'created' and v_request.created_game_id is not null then
    if v_request.accept_idempotency_key = v_accept_key or v_request.created_game_id = v_game_id then
      return query
      select *
      from public.phase31_practice_rematch_response(v_request.id, v_user_id, false, true);
      return;
    end if;
    raise exception 'Rematch request already created a different game.' using errcode = '23505';
  end if;

  if v_request.status <> 'requested' or v_request.expires_at <= now() then
    raise exception 'Rematch request is no longer acceptable.' using errcode = '22023';
  end if;

  if v_game_id = v_request.source_game_id then
    raise exception 'Rematch must create a fresh game id.' using errcode = '22023';
  end if;

  if lower(coalesce(p_game_projection ->> 'scope', '')) <> 'practice'
    or lower(coalesce(p_game_projection ->> 'mode', '')) <> v_request.mode
    or coalesce(p_game_projection ->> 'ranked', 'false') <> 'false'
    or nullif(p_game_projection ->> 'ratingBucket', '') is not null
    or nullif(p_game_projection ->> 'matchmakingRequestId', '') is not null
    or nullif(p_game_projection ->> 'customGameCode', '') is not null
    or nullif(p_game_projection ->> 'dailyDateKey', '') is not null
    or p_game_projection ->> 'status' is distinct from 'playing'
    or p_game_projection #>> '{playerUserIds,player-one}' is distinct from v_request.player_one_user_id::text
    or p_game_projection #>> '{playerUserIds,player-two}' is distinct from v_request.player_two_user_id::text
  then
    raise exception 'Rematch game projection does not match the approved unranked Practice contract.' using errcode = '22023';
  end if;

  v_word_length_text := p_game_projection ->> 'wordLength';
  if coalesce(v_word_length_text, '') !~ '^[0-9]+$'
    or v_word_length_text::integer <> v_request.word_length
  then
    raise exception 'Rematch game word length does not match the request.' using errcode = '22023';
  end if;

  v_hard_mode_text := lower(coalesce(p_game_projection ->> 'hardMode', 'false'));
  if v_hard_mode_text not in ('true', 'false') then
    raise exception 'Rematch game Hard Mode setting is invalid.' using errcode = '22023';
  end if;
  v_hard_mode := v_hard_mode_text::boolean;
  if v_hard_mode is distinct from v_request.hard_mode then
    raise exception 'Rematch game Hard Mode does not match the request.' using errcode = '22023';
  end if;

  v_time_limit_text := nullif(p_game_projection ->> 'timeLimitMs', '');
  if v_time_limit_text is not null and v_time_limit_text <> '0' then
    if v_time_limit_text !~ '^[0-9]+$' then
      raise exception 'Rematch game time limit is invalid.' using errcode = '22023';
    end if;
    v_time_limit_ms := v_time_limit_text::integer;
    if v_time_limit_ms <= 0 then
      v_time_limit_ms := null;
    end if;
  end if;
  if v_time_limit_ms is distinct from v_request.time_limit_ms then
    raise exception 'Rematch game time limit does not match the request.' using errcode = '22023';
  end if;

  v_go_puzzle_count_text := nullif(p_game_projection ->> 'goPuzzleCount', '');
  if v_go_puzzle_count_text is not null then
    if v_go_puzzle_count_text !~ '^[0-9]+$' then
      raise exception 'Rematch game GO puzzle count is invalid.' using errcode = '22023';
    end if;
    v_go_puzzle_count := v_go_puzzle_count_text::integer;
  else
    v_go_puzzle_count := null;
  end if;

  if v_request.mode = 'go' and (v_go_puzzle_count is null or v_go_puzzle_count <> v_request.go_puzzle_count) then
    raise exception 'Rematch GO puzzle count does not match the request.' using errcode = '22023';
  end if;

  if v_request.mode = 'og' and v_go_puzzle_count is not null then
    raise exception 'Rematch OG games must not include a GO puzzle count.' using errcode = '22023';
  end if;

  v_current_turn := p_game_projection ->> 'currentTurn';
  if v_current_turn not in ('player-one', 'player-two') then
    raise exception 'Rematch game current turn is invalid.' using errcode = '22023';
  end if;

  v_difficulty := coalesce(nullif(p_game_projection ->> 'difficulty', ''), 'medium');

  select *
  into v_existing_game
  from public.async_multiplayer_games as game_row
  where game_row.id = v_game_id
  for update;

  if found then
    raise exception 'Rematch game id already exists.' using errcode = '23505';
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
    v_request.player_one_user_id,
    v_request.player_one_user_id,
    v_request.player_two_user_id,
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

  update public.multiplayer_practice_rematch_requests as request_row
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
  from public.phase31_practice_rematch_response(v_request.id, v_user_id, true, false);
end;
$$;

comment on table public.multiplayer_practice_rematch_requests
  is 'Phase 31 durable mutual-intent state for completed unranked non-custom Practice Multiplayer rematches.';

comment on function public.request_practice_multiplayer_rematch(text, text, timestamptz)
  is 'Phase 31 authenticated participant RPC to request a direct Practice rematch from an eligible completed unranked non-custom source game.';

comment on function public.get_practice_multiplayer_rematch_requests(text, integer)
  is 'Phase 31 authenticated participant RPC returning sanitized rematch request state for the current user.';

comment on function public.cancel_practice_multiplayer_rematch(text)
  is 'Phase 31 authenticated requester RPC to cancel a pending Practice rematch request.';

comment on function public.decline_practice_multiplayer_rematch(text)
  is 'Phase 31 authenticated opponent RPC to decline a pending Practice rematch request.';

comment on function public.accept_practice_multiplayer_rematch(text, jsonb, text)
  is 'Phase 31 authenticated opponent RPC to accept a pending Practice rematch request and create one fresh unranked Practice async game.';

revoke all on function public.phase31_expire_practice_rematch_requests() from public;
revoke all on function public.phase31_expire_practice_rematch_requests() from anon;
revoke all on function public.phase31_expire_practice_rematch_requests() from authenticated;

revoke all on function public.phase31_practice_rematch_response(text, uuid, boolean, boolean) from public;
revoke all on function public.phase31_practice_rematch_response(text, uuid, boolean, boolean) from anon;
revoke all on function public.phase31_practice_rematch_response(text, uuid, boolean, boolean) from authenticated;

revoke all on function public.request_practice_multiplayer_rematch(text, text, timestamptz) from public;
revoke all on function public.request_practice_multiplayer_rematch(text, text, timestamptz) from anon;
revoke all on function public.request_practice_multiplayer_rematch(text, text, timestamptz) from authenticated;

revoke all on function public.get_practice_multiplayer_rematch_requests(text, integer) from public;
revoke all on function public.get_practice_multiplayer_rematch_requests(text, integer) from anon;
revoke all on function public.get_practice_multiplayer_rematch_requests(text, integer) from authenticated;

revoke all on function public.cancel_practice_multiplayer_rematch(text) from public;
revoke all on function public.cancel_practice_multiplayer_rematch(text) from anon;
revoke all on function public.cancel_practice_multiplayer_rematch(text) from authenticated;

revoke all on function public.decline_practice_multiplayer_rematch(text) from public;
revoke all on function public.decline_practice_multiplayer_rematch(text) from anon;
revoke all on function public.decline_practice_multiplayer_rematch(text) from authenticated;

revoke all on function public.accept_practice_multiplayer_rematch(text, jsonb, text) from public;
revoke all on function public.accept_practice_multiplayer_rematch(text, jsonb, text) from anon;
revoke all on function public.accept_practice_multiplayer_rematch(text, jsonb, text) from authenticated;

grant execute on function public.request_practice_multiplayer_rematch(text, text, timestamptz) to authenticated;
grant execute on function public.get_practice_multiplayer_rematch_requests(text, integer) to authenticated;
grant execute on function public.cancel_practice_multiplayer_rematch(text) to authenticated;
grant execute on function public.decline_practice_multiplayer_rematch(text) to authenticated;
grant execute on function public.accept_practice_multiplayer_rematch(text, jsonb, text) to authenticated;
