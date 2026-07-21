-- Phase 33 Stage 33.3: timed Practice ranked queue/RLS foundations.
--
-- This migration is additive. It preserves untimed ranked Practice v1, adds
-- separate timed ranked Practice buckets for the canonical five-minute clock,
-- and keeps public leaderboards limited to untimed ranked Practice buckets.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.phase33_ranked_timed_practice_time_limit_ms()
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select 300000
$$;

create or replace function public.phase33_is_ranked_practice_time_limit_supported(p_time_limit_ms integer)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_time_limit_ms is null
    or p_time_limit_ms = public.phase33_ranked_timed_practice_time_limit_ms()
$$;

create or replace function public.phase33_ranked_practice_storage_bucket_for_mode_and_time_limit(
  p_mode text,
  p_time_limit_ms integer
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when not public.phase33_is_ranked_practice_time_limit_supported(p_time_limit_ms) then null
    when lower(coalesce(p_mode, '')) = 'og' and p_time_limit_ms is null then 'async:og'
    when lower(coalesce(p_mode, '')) = 'go' and p_time_limit_ms is null then 'async:go'
    when lower(coalesce(p_mode, '')) = 'og' and p_time_limit_ms = public.phase33_ranked_timed_practice_time_limit_ms() then 'async:og:timed:v1'
    when lower(coalesce(p_mode, '')) = 'go' and p_time_limit_ms = public.phase33_ranked_timed_practice_time_limit_ms() then 'async:go:timed:v1'
    else null
  end
$$;

create or replace function public.phase33_ranked_practice_app_bucket_for_storage_bucket(p_bucket text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case coalesce(p_bucket, '')
    when 'async:og' then 'multiplayer:og'
    when 'async:go' then 'multiplayer:go'
    when 'async:og:timed:v1' then 'multiplayer:og:timed:v1'
    when 'async:go:timed:v1' then 'multiplayer:go:timed:v1'
    else null
  end
$$;

create or replace function public.phase33_is_timed_ranked_practice_storage_bucket(p_bucket text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(p_bucket, '') in ('async:og:timed:v1', 'async:go:timed:v1')
$$;

do $$
begin
  alter table public.async_multiplayer_games
    drop constraint if exists async_multiplayer_games_rating_bucket_check;
  alter table public.async_multiplayer_games
    add constraint async_multiplayer_games_rating_bucket_check
    check (rating_bucket = any (array[
      'async:og'::text,
      'async:go'::text,
      'live:og'::text,
      'live:go'::text,
      'async:og:timed:v1'::text,
      'async:go:timed:v1'::text
    ]));

  alter table public.multiplayer_matchmaking_queue
    drop constraint if exists multiplayer_matchmaking_queue_rating_bucket_check;
  alter table public.multiplayer_matchmaking_queue
    add constraint multiplayer_matchmaking_queue_rating_bucket_check
    check (rating_bucket = any (array[
      'async:og'::text,
      'async:go'::text,
      'live:og'::text,
      'live:go'::text,
      'async:og:timed:v1'::text,
      'async:go:timed:v1'::text
    ]));

  alter table public.multiplayer_rating_profiles
    drop constraint if exists multiplayer_rating_profiles_bucket_check;
  alter table public.multiplayer_rating_profiles
    add constraint multiplayer_rating_profiles_bucket_check
    check (bucket = any (array[
      'async:og'::text,
      'async:go'::text,
      'live:og'::text,
      'live:go'::text,
      'async:og:timed:v1'::text,
      'async:go:timed:v1'::text
    ]));

  alter table public.multiplayer_match_results
    drop constraint if exists multiplayer_match_results_rating_bucket_check;
  alter table public.multiplayer_match_results
    add constraint multiplayer_match_results_rating_bucket_check
    check (rating_bucket = any (array[
      'async:og'::text,
      'async:go'::text,
      'live:og'::text,
      'live:go'::text,
      'async:og:timed:v1'::text,
      'async:go:timed:v1'::text
    ]));

  alter table public.multiplayer_rating_transactions
    drop constraint if exists multiplayer_rating_transactions_bucket_check;
  alter table public.multiplayer_rating_transactions
    add constraint multiplayer_rating_transactions_bucket_check
    check (bucket = any (array[
      'async:og'::text,
      'async:go'::text,
      'live:og'::text,
      'live:go'::text,
      'async:og:timed:v1'::text,
      'async:go:timed:v1'::text
    ]));
end $$;

create index if not exists multiplayer_matchmaking_queue_ranked_practice_time_lookup_idx
  on public.multiplayer_matchmaking_queue (
    transport,
    mode,
    scope,
    ranked,
    status,
    rating_bucket,
    hard_mode,
    word_length,
    time_limit_ms,
    queued_at
  )
  where status = 'queued'
    and ranked = true
    and transport = 'async'
    and scope = 'practice';

create or replace function public.create_ranked_async_matchmaking_request(
  p_mode text,
  p_word_length integer,
  p_hard_mode boolean default false,
  p_idempotency_key text default null,
  p_scope text default 'practice',
  p_time_limit_ms integer default null,
  p_expires_at timestamptz default null
)
returns table (
  request_id text,
  request_status text,
  rating_bucket text,
  rating_snapshot integer,
  hard_mode boolean,
  word_length integer,
  queued_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_bucket text;
  v_existing public.multiplayer_matchmaking_queue%rowtype;
  v_key text;
  v_matchmaking_version text;
  v_mode text := lower(coalesce(p_mode, ''));
  v_rating_snapshot integer;
  v_request_id text;
  v_time_limit_ms integer := p_time_limit_ms;
  v_time_label text;
begin
  if auth.role() <> 'authenticated' or v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if lower(coalesce(p_scope, '')) <> 'practice' then
    raise exception 'Daily ranked matchmaking is deferred.' using errcode = '22023';
  end if;

  if not public.phase33_is_ranked_practice_time_limit_supported(v_time_limit_ms) then
    raise exception 'Timed Practice ranked supports only the canonical five-minute clock.' using errcode = '22023';
  end if;

  v_bucket := public.phase33_ranked_practice_storage_bucket_for_mode_and_time_limit(v_mode, v_time_limit_ms);
  if v_bucket is null then
    raise exception 'Unsupported ranked mode.' using errcode = '22023';
  end if;

  if p_word_length is null or p_word_length < 2 or p_word_length > 35 then
    raise exception 'Practice ranked matchmaking requires a word length from 2 through 35.' using errcode = '22023';
  end if;

  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Ranked queue expiry must be in the future.' using errcode = '22023';
  end if;

  update public.multiplayer_matchmaking_queue queue_row
  set status = 'expired'
  where queue_row.user_id = v_user_id
    and queue_row.status = 'queued'
    and queue_row.expires_at is not null
    and queue_row.expires_at <= now();

  select profile.rating
  into v_rating_snapshot
  from public.multiplayer_rating_profiles profile
  where profile.user_id = v_user_id
    and profile.bucket = v_bucket;

  v_rating_snapshot := coalesce(v_rating_snapshot, 1200);
  v_time_label := coalesce(v_time_limit_ms::text, 'untimed');
  v_matchmaking_version := case
    when v_time_limit_ms is null then 'phase27-ranked-v1'
    else 'phase33-ranked-timed-v1'
  end;
  v_key := coalesce(
    nullif(p_idempotency_key, ''),
    v_matchmaking_version || ':queue:' || v_user_id::text || ':' || v_mode || ':' || p_word_length::text || ':' || coalesce(p_hard_mode, false)::text || ':' || v_time_label || ':' || gen_random_uuid()::text
  );

  select *
  into v_existing
  from public.multiplayer_matchmaking_queue queue_row
  where queue_row.idempotency_key = v_key;

  if found then
    if v_existing.user_id <> v_user_id then
      raise exception 'Ranked queue idempotency key belongs to another user.' using errcode = '42501';
    end if;

    if v_existing.transport <> 'async'
      or v_existing.scope <> 'practice'
      or v_existing.ranked is distinct from true
      or v_existing.mode <> v_mode
      or v_existing.word_length is distinct from p_word_length
      or v_existing.hard_mode is distinct from coalesce(p_hard_mode, false)
      or v_existing.rating_bucket <> v_bucket
      or v_existing.time_limit_ms is distinct from v_time_limit_ms
    then
      raise exception 'Ranked queue idempotency key belongs to different settings.' using errcode = '22023';
    end if;

    v_request_id := v_existing.id;
  else
    insert into public.multiplayer_matchmaking_queue (
      user_id,
      transport,
      mode,
      scope,
      daily_date_key,
      word_length,
      rating_bucket,
      rating_snapshot,
      ranked,
      status,
      idempotency_key,
      expires_at,
      hard_mode,
      time_limit_ms,
      matchmaking_version
    )
    values (
      v_user_id,
      'async',
      v_mode,
      'practice',
      null,
      p_word_length,
      v_bucket,
      v_rating_snapshot,
      true,
      'queued',
      v_key,
      p_expires_at,
      coalesce(p_hard_mode, false),
      v_time_limit_ms,
      v_matchmaking_version
    )
    returning multiplayer_matchmaking_queue.id into v_request_id;
  end if;

  return query
  select
    queue_row.id,
    queue_row.status,
    queue_row.rating_bucket,
    queue_row.rating_snapshot,
    queue_row.hard_mode,
    queue_row.word_length,
    queue_row.queued_at,
    queue_row.expires_at
  from public.multiplayer_matchmaking_queue queue_row
  where queue_row.id = v_request_id;
end;
$$;

create or replace function public.claim_ranked_async_matchmaking_pair(
  p_request_id text,
  p_matched_game_id text default null
)
returns table (
  request_id text,
  opponent_request_id text,
  matched_game_id text,
  request_status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.multiplayer_matchmaking_queue%rowtype;
  v_opponent public.multiplayer_matchmaking_queue%rowtype;
  v_matched_game_id text;
begin
  if auth.role() <> 'authenticated' or v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  update public.multiplayer_matchmaking_queue queue_row
  set status = 'expired'
  where queue_row.status = 'queued'
    and queue_row.expires_at is not null
    and queue_row.expires_at <= now();

  select *
  into v_request
  from public.multiplayer_matchmaking_queue queue_row
  where queue_row.id = p_request_id
  for update;

  if not found or v_request.user_id <> v_user_id then
    raise exception 'Ranked queue request is not owned by current user.' using errcode = '42501';
  end if;

  if v_request.status <> 'queued' then
    raise exception 'Ranked queue request is not queued.' using errcode = '22023';
  end if;

  if v_request.transport <> 'async'
    or v_request.scope <> 'practice'
    or v_request.ranked is distinct from true
    or not public.phase33_is_ranked_practice_time_limit_supported(v_request.time_limit_ms)
    or v_request.rating_bucket <> public.phase33_ranked_practice_storage_bucket_for_mode_and_time_limit(v_request.mode, v_request.time_limit_ms)
    or v_request.word_length is null
    or v_request.word_length < 2
    or v_request.word_length > 35
  then
    raise exception 'Ranked queue request is not eligible for ranked Practice pairing.' using errcode = '22023';
  end if;

  select candidate.*
  into v_opponent
  from public.multiplayer_matchmaking_queue candidate
  where candidate.status = 'queued'
    and candidate.id <> v_request.id
    and candidate.user_id <> v_request.user_id
    and candidate.transport = 'async'
    and candidate.scope = 'practice'
    and candidate.ranked = true
    and candidate.mode = v_request.mode
    and candidate.rating_bucket = v_request.rating_bucket
    and candidate.hard_mode = v_request.hard_mode
    and candidate.word_length = v_request.word_length
    and candidate.time_limit_ms is not distinct from v_request.time_limit_ms
    and public.phase33_is_ranked_practice_time_limit_supported(candidate.time_limit_ms)
    and candidate.rating_bucket = public.phase33_ranked_practice_storage_bucket_for_mode_and_time_limit(candidate.mode, candidate.time_limit_ms)
    and (candidate.expires_at is null or candidate.expires_at > now())
    and abs(candidate.rating_snapshot - v_request.rating_snapshot) <= greatest(
      public.phase27_ranked_search_band(candidate.rating_snapshot, candidate.queued_at, now()),
      public.phase27_ranked_search_band(v_request.rating_snapshot, v_request.queued_at, now())
    )
  order by
    abs(candidate.rating_snapshot - v_request.rating_snapshot),
    candidate.queued_at,
    candidate.id
  for update skip locked
  limit 1;

  if not found then
    request_id := v_request.id;
    opponent_request_id := null;
    matched_game_id := null;
    request_status := 'queued';
    return next;
    return;
  end if;

  v_matched_game_id := coalesce(nullif(p_matched_game_id, ''), 'ranked-async-game-' || gen_random_uuid()::text);

  update public.multiplayer_matchmaking_queue queue_row
  set
    status = 'matched',
    matched_match_id = v_matched_game_id,
    matched_game_id = v_matched_game_id
  where queue_row.id in (v_request.id, v_opponent.id);

  request_id := v_request.id;
  opponent_request_id := v_opponent.id;
  matched_game_id := v_matched_game_id;
  request_status := 'matched';
  return next;
end;
$$;

create or replace function public.get_ranked_async_matchmaking_status(p_request_id text)
returns table (
  request_id text,
  request_status text,
  matched_game_id text,
  opponent_request_id text,
  viewer_seat text,
  player_one_user_id uuid,
  player_two_user_id uuid,
  mode text,
  scope text,
  rating_bucket text,
  word_length integer,
  hard_mode boolean,
  time_limit_ms integer,
  queued_at timestamptz,
  matched_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.multiplayer_matchmaking_queue%rowtype;
  v_first public.multiplayer_matchmaking_queue%rowtype;
  v_second public.multiplayer_matchmaking_queue%rowtype;
  v_matched_game_id text;
  v_pair_rows integer;
  v_pair_users integer;
begin
  if auth.role() <> 'authenticated' or v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select *
  into v_request
  from public.multiplayer_matchmaking_queue queue_row
  where queue_row.id = p_request_id;

  if not found or v_request.user_id <> v_user_id then
    raise exception 'Ranked queue request is not owned by current user.' using errcode = '42501';
  end if;

  if v_request.transport <> 'async'
    or v_request.scope <> 'practice'
    or v_request.ranked is distinct from true
    or not public.phase33_is_ranked_practice_time_limit_supported(v_request.time_limit_ms)
    or v_request.rating_bucket <> public.phase33_ranked_practice_storage_bucket_for_mode_and_time_limit(v_request.mode, v_request.time_limit_ms)
    or v_request.word_length is null
    or v_request.word_length < 2
    or v_request.word_length > 35
  then
    raise exception 'Ranked queue request is not eligible for ranked Practice status.' using errcode = '22023';
  end if;

  if v_request.status <> 'matched' then
    return query
    select
      v_request.id,
      v_request.status,
      null::text,
      null::text,
      null::text,
      null::uuid,
      null::uuid,
      v_request.mode,
      v_request.scope,
      v_request.rating_bucket,
      v_request.word_length,
      v_request.hard_mode,
      v_request.time_limit_ms,
      v_request.queued_at,
      null::timestamptz;
    return;
  end if;

  v_matched_game_id := coalesce(v_request.matched_game_id, v_request.matched_match_id);

  if v_matched_game_id is null or v_matched_game_id = '' then
    raise exception 'Matched ranked queue request is missing a game id.' using errcode = '22023';
  end if;

  select count(*)::integer, count(distinct queue_row.user_id)::integer
  into v_pair_rows, v_pair_users
  from public.multiplayer_matchmaking_queue queue_row
  where coalesce(queue_row.matched_game_id, queue_row.matched_match_id) = v_matched_game_id
    and queue_row.status = 'matched';

  if v_pair_rows <> 2 or v_pair_users <> 2 then
    raise exception 'Matched ranked queue reservation must contain exactly two distinct users.' using errcode = '22023';
  end if;

  select *
  into v_first
  from public.multiplayer_matchmaking_queue queue_row
  where coalesce(queue_row.matched_game_id, queue_row.matched_match_id) = v_matched_game_id
    and queue_row.status = 'matched'
  order by queue_row.queued_at, queue_row.id
  limit 1;

  select *
  into v_second
  from public.multiplayer_matchmaking_queue queue_row
  where coalesce(queue_row.matched_game_id, queue_row.matched_match_id) = v_matched_game_id
    and queue_row.status = 'matched'
    and queue_row.id <> v_first.id
  order by queue_row.queued_at, queue_row.id
  limit 1;

  if v_first.transport <> 'async'
    or v_second.transport <> 'async'
    or v_first.scope <> 'practice'
    or v_second.scope <> 'practice'
    or v_first.ranked is distinct from true
    or v_second.ranked is distinct from true
    or v_first.mode <> v_second.mode
    or v_first.rating_bucket <> v_second.rating_bucket
    or v_first.word_length is distinct from v_second.word_length
    or v_first.hard_mode is distinct from v_second.hard_mode
    or v_first.time_limit_ms is distinct from v_second.time_limit_ms
    or not public.phase33_is_ranked_practice_time_limit_supported(v_first.time_limit_ms)
    or v_first.rating_bucket <> public.phase33_ranked_practice_storage_bucket_for_mode_and_time_limit(v_first.mode, v_first.time_limit_ms)
  then
    raise exception 'Matched ranked queue reservation contains incompatible settings.' using errcode = '22023';
  end if;

  return query
  select
    v_request.id,
    v_request.status,
    v_matched_game_id,
    case when v_request.id = v_first.id then v_second.id else v_first.id end,
    case when v_request.id = v_first.id then 'player-one' else 'player-two' end,
    v_first.user_id,
    v_second.user_id,
    v_first.mode,
    v_first.scope,
    v_first.rating_bucket,
    v_first.word_length,
    v_first.hard_mode,
    v_first.time_limit_ms,
    v_request.queued_at,
    greatest(v_first.queued_at, v_second.queued_at);
end;
$$;

create or replace function public.finalize_ranked_async_matchmaking_game(
  p_request_id text,
  p_matched_game_id text,
  p_game_projection jsonb,
  p_idempotency_key text default null
)
returns table (
  game_id text,
  request_id text,
  opponent_request_id text,
  request_status text,
  created boolean,
  idempotent boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.multiplayer_matchmaking_queue%rowtype;
  v_first public.multiplayer_matchmaking_queue%rowtype;
  v_second public.multiplayer_matchmaking_queue%rowtype;
  v_existing_game public.async_multiplayer_games%rowtype;
  v_pair_rows integer;
  v_pair_users integer;
  v_app_rating_bucket text;
  v_current_turn text;
  v_difficulty text;
  v_go_puzzle_count integer;
  v_go_puzzle_count_text text;
  v_idempotency_key text;
  v_is_timed boolean;
  v_left_remaining_text text;
  v_projection_word_length text;
  v_right_remaining_text text;
  v_time_limit_text text;
  v_time_limit_ms integer;
  v_turn_started_at text;
begin
  if auth.role() <> 'authenticated' or v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_request_id is null or p_request_id = '' then
    raise exception 'Ranked finalization requires a queue request id.' using errcode = '22023';
  end if;

  if p_matched_game_id is null or p_matched_game_id = '' then
    raise exception 'Ranked finalization requires a matched game id.' using errcode = '22023';
  end if;

  if p_game_projection is null or jsonb_typeof(p_game_projection) <> 'object' then
    raise exception 'Ranked finalization requires a game projection object.' using errcode = '22023';
  end if;

  select *
  into v_request
  from public.multiplayer_matchmaking_queue queue_row
  where queue_row.id = p_request_id
  for update;

  if not found or v_request.user_id <> v_user_id then
    raise exception 'Ranked queue request is not owned by current user.' using errcode = '42501';
  end if;

  if v_request.status <> 'matched'
    or coalesce(v_request.matched_game_id, v_request.matched_match_id) <> p_matched_game_id
  then
    raise exception 'Ranked queue request is not matched to this game id.' using errcode = '22023';
  end if;

  perform 1
  from public.multiplayer_matchmaking_queue queue_row
  where coalesce(queue_row.matched_game_id, queue_row.matched_match_id) = p_matched_game_id
  for update;

  select count(*)::integer, count(distinct queue_row.user_id)::integer
  into v_pair_rows, v_pair_users
  from public.multiplayer_matchmaking_queue queue_row
  where coalesce(queue_row.matched_game_id, queue_row.matched_match_id) = p_matched_game_id
    and queue_row.status = 'matched';

  if v_pair_rows <> 2 or v_pair_users <> 2 then
    raise exception 'Ranked finalization requires exactly two matched queue users.' using errcode = '22023';
  end if;

  select *
  into v_first
  from public.multiplayer_matchmaking_queue queue_row
  where coalesce(queue_row.matched_game_id, queue_row.matched_match_id) = p_matched_game_id
    and queue_row.status = 'matched'
  order by queue_row.queued_at, queue_row.id
  limit 1;

  select *
  into v_second
  from public.multiplayer_matchmaking_queue queue_row
  where coalesce(queue_row.matched_game_id, queue_row.matched_match_id) = p_matched_game_id
    and queue_row.status = 'matched'
    and queue_row.id <> v_first.id
  order by queue_row.queued_at, queue_row.id
  limit 1;

  if v_first.transport <> 'async'
    or v_second.transport <> 'async'
    or v_first.scope <> 'practice'
    or v_second.scope <> 'practice'
    or v_first.ranked is distinct from true
    or v_second.ranked is distinct from true
    or v_first.mode <> v_second.mode
    or v_first.rating_bucket <> v_second.rating_bucket
    or v_first.word_length is null
    or v_first.word_length is distinct from v_second.word_length
    or v_first.hard_mode is distinct from v_second.hard_mode
    or v_first.time_limit_ms is distinct from v_second.time_limit_ms
    or not public.phase33_is_ranked_practice_time_limit_supported(v_first.time_limit_ms)
    or v_first.rating_bucket <> public.phase33_ranked_practice_storage_bucket_for_mode_and_time_limit(v_first.mode, v_first.time_limit_ms)
    or v_first.user_id = v_second.user_id
  then
    raise exception 'Matched ranked queue reservation contains incompatible settings.' using errcode = '22023';
  end if;

  v_time_limit_ms := v_first.time_limit_ms;
  v_is_timed := v_time_limit_ms = public.phase33_ranked_timed_practice_time_limit_ms();
  v_app_rating_bucket := public.phase33_ranked_practice_app_bucket_for_storage_bucket(v_first.rating_bucket);

  if v_app_rating_bucket is null then
    raise exception 'Unsupported ranked rating bucket.' using errcode = '22023';
  end if;

  if p_game_projection ->> 'id' is distinct from p_matched_game_id then
    raise exception 'Ranked game projection id does not match reservation.' using errcode = '22023';
  end if;

  if lower(coalesce(p_game_projection ->> 'mode', '')) <> v_first.mode then
    raise exception 'Ranked game projection mode does not match reservation.' using errcode = '22023';
  end if;

  if lower(coalesce(p_game_projection ->> 'scope', '')) <> 'practice' then
    raise exception 'Ranked game projection scope must be Practice.' using errcode = '22023';
  end if;

  if p_game_projection ->> 'ranked' is distinct from 'true' then
    raise exception 'Ranked game projection must be ranked.' using errcode = '22023';
  end if;

  if p_game_projection ->> 'ratingBucket' is distinct from v_app_rating_bucket then
    raise exception 'Ranked game projection rating bucket does not match reservation.' using errcode = '22023';
  end if;

  v_projection_word_length := p_game_projection ->> 'wordLength';
  if coalesce(v_projection_word_length, '') !~ '^[0-9]+$'
    or v_projection_word_length::integer <> v_first.word_length
  then
    raise exception 'Ranked game projection word length does not match reservation.' using errcode = '22023';
  end if;

  if p_game_projection ->> 'hardMode' is distinct from v_first.hard_mode::text then
    raise exception 'Ranked game projection Hard Mode does not match reservation.' using errcode = '22023';
  end if;

  v_time_limit_text := nullif(p_game_projection ->> 'timeLimitMs', '');
  if v_is_timed then
    if v_time_limit_text is null
      or v_time_limit_text !~ '^[0-9]+$'
      or v_time_limit_text::integer <> v_time_limit_ms
    then
      raise exception 'Timed ranked game projection must use the canonical five-minute clock.' using errcode = '22023';
    end if;

    v_left_remaining_text := p_game_projection #>> '{timeRemainingMs,player-one}';
    v_right_remaining_text := p_game_projection #>> '{timeRemainingMs,player-two}';
    if coalesce(v_left_remaining_text, '') !~ '^[0-9]+$'
      or coalesce(v_right_remaining_text, '') !~ '^[0-9]+$'
      or v_left_remaining_text::integer <> v_time_limit_ms
      or v_right_remaining_text::integer <> v_time_limit_ms
    then
      raise exception 'Timed ranked game projection must start both clocks at five minutes.' using errcode = '22023';
    end if;

    v_turn_started_at := nullif(p_game_projection ->> 'turnStartedAt', '');
    if v_turn_started_at is null then
      raise exception 'Timed ranked game projection requires turn-start evidence.' using errcode = '22023';
    end if;
    begin
      perform v_turn_started_at::timestamptz;
    exception when others then
      raise exception 'Timed ranked turn-start evidence is invalid.' using errcode = '22023';
    end;
  else
    if v_time_limit_text is not null and v_time_limit_text <> '0' then
      raise exception 'Untimed ranked game projection cannot carry a time limit.' using errcode = '22023';
    end if;
  end if;

  if nullif(p_game_projection ->> 'dailyDateKey', '') is not null then
    raise exception 'Daily ranked game finalization is deferred.' using errcode = '22023';
  end if;

  if nullif(p_game_projection ->> 'customGameCode', '') is not null then
    raise exception 'Ranked custom game finalization is deferred.' using errcode = '22023';
  end if;

  if p_game_projection ->> 'matchmakingRequestId' not in (v_first.id, v_second.id) then
    raise exception 'Ranked game projection must reference one matched queue request.' using errcode = '22023';
  end if;

  if p_game_projection #>> '{playerUserIds,player-one}' is distinct from v_first.user_id::text
    or p_game_projection #>> '{playerUserIds,player-two}' is distinct from v_second.user_id::text
  then
    raise exception 'Ranked game projection participant ids do not match reservation.' using errcode = '22023';
  end if;

  if p_game_projection ->> 'status' is distinct from 'playing' then
    raise exception 'Ranked finalized games must start in playing status.' using errcode = '22023';
  end if;

  v_current_turn := p_game_projection ->> 'currentTurn';
  if v_current_turn not in ('player-one', 'player-two') then
    raise exception 'Ranked game projection has an invalid current turn.' using errcode = '22023';
  end if;

  v_difficulty := coalesce(nullif(p_game_projection ->> 'difficulty', ''), 'medium');
  v_go_puzzle_count_text := nullif(p_game_projection ->> 'goPuzzleCount', '');
  if v_go_puzzle_count_text is not null then
    if v_go_puzzle_count_text !~ '^[0-9]+$' then
      raise exception 'Ranked game projection GO puzzle count is invalid.' using errcode = '22023';
    end if;
    v_go_puzzle_count := v_go_puzzle_count_text::integer;
  else
    v_go_puzzle_count := null;
  end if;

  if v_first.mode = 'go' and (v_go_puzzle_count is null or v_go_puzzle_count < 1) then
    raise exception 'Ranked GO finalization requires a puzzle count.' using errcode = '22023';
  end if;

  v_idempotency_key := coalesce(
    nullif(p_idempotency_key, ''),
    case when v_is_timed then 'phase33-ranked-timed-v1' else 'phase27-ranked-v1' end || ':finalize:' || p_matched_game_id
  );

  select *
  into v_existing_game
  from public.async_multiplayer_games game_row
  where game_row.id = p_matched_game_id
  for update;

  if found then
    if v_existing_game.ranked is distinct from true
      or v_existing_game.scope <> 'practice'
      or v_existing_game.mode <> v_first.mode
      or v_existing_game.rating_bucket <> v_first.rating_bucket
      or v_existing_game.word_length <> v_first.word_length
      or v_existing_game.player_one_user_id is distinct from v_first.user_id
      or v_existing_game.player_two_user_id is distinct from v_second.user_id
      or v_existing_game.custom_game_code is not null
      or v_existing_game.daily_date_key is not null
      or v_existing_game.status not in ('playing', 'won', 'lost', 'expired')
      or v_existing_game.projection ->> 'id' is distinct from p_matched_game_id
      or v_existing_game.projection #>> '{playerUserIds,player-one}' is distinct from v_first.user_id::text
      or v_existing_game.projection #>> '{playerUserIds,player-two}' is distinct from v_second.user_id::text
      or (
        v_is_timed
        and (
          nullif(v_existing_game.projection ->> 'timeLimitMs', '') is null
          or nullif(v_existing_game.projection ->> 'timeLimitMs', '') !~ '^[0-9]+$'
          or (v_existing_game.projection ->> 'timeLimitMs')::integer <> v_time_limit_ms
        )
      )
      or (
        not v_is_timed
        and nullif(v_existing_game.projection ->> 'timeLimitMs', '') is not null
        and nullif(v_existing_game.projection ->> 'timeLimitMs', '') <> '0'
      )
    then
      raise exception 'Existing ranked game row does not match this reservation.' using errcode = '23505';
    end if;

    return query
    select
      v_existing_game.id,
      v_request.id,
      case when v_request.id = v_first.id then v_second.id else v_first.id end,
      v_request.status,
      false,
      true;
    return;
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
    p_matched_game_id,
    'practice',
    v_first.mode,
    null,
    'playing',
    v_current_turn,
    v_first.word_length,
    v_difficulty,
    v_go_puzzle_count,
    v_first.user_id,
    v_first.user_id,
    v_second.user_id,
    true,
    v_first.rating_bucket,
    v_idempotency_key,
    null,
    null,
    null,
    null,
    p_game_projection,
    now(),
    now()
  );

  return query
  select
    p_matched_game_id,
    v_request.id,
    case when v_request.id = v_first.id then v_second.id else v_first.id end,
    v_request.status,
    true,
    false;
end;
$$;

create or replace function public.settle_ranked_async_multiplayer_match(
  p_game_id text,
  p_idempotency_key text default null
)
returns table (
  match_result_id text,
  bucket text,
  user_id uuid,
  opponent_user_id uuid,
  outcome text,
  old_rating integer,
  new_rating integer,
  rating_delta integer,
  expected_score numeric,
  idempotent boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_game public.async_multiplayer_games%rowtype;
  v_bucket text;
  v_existing_result_id text;
  v_forfeited_player text;
  v_hard_mode boolean := false;
  v_hard_mode_text text;
  v_idempotency_key text;
  v_is_timed boolean := false;
  v_left_attempts integer := 0;
  v_left_delta integer;
  v_left_expected numeric;
  v_left_k integer;
  v_left_new_games integer;
  v_left_new_provisional boolean;
  v_left_new_rating integer;
  v_left_outcome text;
  v_left_profile public.multiplayer_rating_profiles%rowtype;
  v_left_puzzles integer := 0;
  v_left_remaining integer;
  v_left_remaining_text text;
  v_left_score numeric;
  v_left_user_id uuid;
  v_loser_player text;
  v_match_result_id text;
  v_moves jsonb := '[]'::jsonb;
  v_reservation_rows integer := 0;
  v_reservation_users integer := 0;
  v_right_attempts integer := 0;
  v_right_delta integer;
  v_right_expected numeric;
  v_right_k integer;
  v_right_new_games integer;
  v_right_new_provisional boolean;
  v_right_new_rating integer;
  v_right_outcome text;
  v_right_profile public.multiplayer_rating_profiles%rowtype;
  v_right_puzzles integer := 0;
  v_right_remaining integer;
  v_right_remaining_text text;
  v_right_score numeric;
  v_right_user_id uuid;
  v_settlement_version text := 'phase27-ranked-v1';
  v_time_limit_ms integer;
  v_time_limit_text text;
  v_timed_out_player text;
  v_winner_player text;
  v_winner_user_id uuid;
begin
  if auth.role() <> 'authenticated' or v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_game_id is null or p_game_id = '' then
    raise exception 'Ranked settlement requires a game id.' using errcode = '22023';
  end if;

  select *
  into v_game
  from public.async_multiplayer_games game_row
  where game_row.id = p_game_id
  for update;

  if not found then
    raise exception 'Ranked game not found.' using errcode = 'P0002';
  end if;

  if v_user_id is distinct from v_game.host_user_id
    and v_user_id is distinct from v_game.player_one_user_id
    and v_user_id is distinct from v_game.player_two_user_id
  then
    raise exception 'Only ranked match participants can settle this match.' using errcode = '42501';
  end if;

  v_left_user_id := v_game.player_one_user_id;
  v_right_user_id := v_game.player_two_user_id;

  if v_game.ranked is distinct from true then
    raise exception 'Unranked matches do not affect rating.' using errcode = '22023';
  end if;

  if v_game.scope <> 'practice' then
    raise exception 'Daily ranked multiplayer is deferred.' using errcode = '22023';
  end if;

  if v_game.custom_game_code is not null then
    raise exception 'Ranked custom games are deferred.' using errcode = '22023';
  end if;

  v_time_limit_text := nullif(v_game.projection ->> 'timeLimitMs', '');
  if v_time_limit_text is not null then
    if v_time_limit_text !~ '^[0-9]+$' then
      raise exception 'Corrupt ranked time-limit evidence.' using errcode = '22023';
    end if;
    v_time_limit_ms := nullif(v_time_limit_text::integer, 0);
  else
    v_time_limit_ms := null;
  end if;

  if not public.phase33_is_ranked_practice_time_limit_supported(v_time_limit_ms) then
    raise exception 'Timed Practice ranked supports only the canonical five-minute clock.' using errcode = '22023';
  end if;

  v_is_timed := v_time_limit_ms = public.phase33_ranked_timed_practice_time_limit_ms();
  v_settlement_version := case when v_is_timed then 'phase33-ranked-timed-v1' else 'phase27-ranked-v1' end;
  v_bucket := public.phase33_ranked_practice_storage_bucket_for_mode_and_time_limit(v_game.mode, v_time_limit_ms);
  if v_bucket is null or v_game.rating_bucket <> v_bucket then
    raise exception 'Ranked rating bucket does not match mode and time control.' using errcode = '22023';
  end if;

  if v_left_user_id is null or v_right_user_id is null or v_left_user_id = v_right_user_id then
    raise exception 'Ranked settlement requires two distinct participant users.' using errcode = '22023';
  end if;

  if v_game.status not in ('won', 'lost') then
    raise exception 'Ranked settlement requires completed win/loss evidence.' using errcode = '22023';
  end if;

  if v_is_timed then
    v_left_remaining_text := v_game.projection #>> '{timeRemainingMs,player-one}';
    v_right_remaining_text := v_game.projection #>> '{timeRemainingMs,player-two}';
    if coalesce(v_left_remaining_text, '') !~ '^[0-9]+$'
      or coalesce(v_right_remaining_text, '') !~ '^[0-9]+$'
    then
      raise exception 'Timed ranked settlement requires durable clock evidence.' using errcode = '22023';
    end if;

    v_left_remaining := v_left_remaining_text::integer;
    v_right_remaining := v_right_remaining_text::integer;
    if v_left_remaining > v_time_limit_ms or v_right_remaining > v_time_limit_ms then
      raise exception 'Timed ranked settlement clock evidence exceeds the canonical clock.' using errcode = '22023';
    end if;
  end if;

  v_hard_mode_text := nullif(v_game.projection ->> 'hardMode', '');
  if v_hard_mode_text is not null then
    if v_hard_mode_text not in ('true', 'false') then
      raise exception 'Corrupt ranked Hard Mode evidence.' using errcode = '22023';
    end if;
    v_hard_mode := v_hard_mode_text::boolean;
  end if;

  select count(*)::integer, count(distinct queue_row.user_id)::integer
  into v_reservation_rows, v_reservation_users
  from public.multiplayer_matchmaking_queue queue_row
  where coalesce(queue_row.matched_game_id, queue_row.matched_match_id) = v_game.id
    and queue_row.status = 'matched'
    and queue_row.transport = 'async'
    and queue_row.scope = 'practice'
    and queue_row.ranked = true
    and queue_row.mode = v_game.mode
    and queue_row.rating_bucket = v_bucket
    and queue_row.hard_mode = v_hard_mode
    and queue_row.time_limit_ms is not distinct from v_time_limit_ms
    and queue_row.word_length = v_game.word_length
    and queue_row.user_id in (v_left_user_id, v_right_user_id);

  if v_reservation_rows <> 2 or v_reservation_users <> 2 then
    raise exception 'Ranked settlement requires a matched ranked queue reservation.' using errcode = '42501';
  end if;

  v_idempotency_key := coalesce(nullif(p_idempotency_key, ''), v_settlement_version || ':async:' || v_game.id || ':' || v_bucket);

  select result_row.id
  into v_existing_result_id
  from public.multiplayer_match_results result_row
  where result_row.idempotency_key = v_idempotency_key;

  if v_existing_result_id is not null then
    return query
    select
      tx.match_result_id,
      tx.bucket,
      tx.user_id,
      tx.opponent_user_id,
      tx.outcome,
      tx.old_rating,
      tx.new_rating,
      tx.rating_delta,
      tx.expected_score,
      true
    from public.multiplayer_rating_transactions tx
    where tx.match_result_id = v_existing_result_id
    order by tx.user_id;
    return;
  end if;

  if jsonb_typeof(v_game.projection -> 'moves') = 'array' then
    v_moves := v_game.projection -> 'moves';
  end if;

  v_winner_player := nullif(coalesce(v_game.winner_player_id, v_game.projection ->> 'winnerId'), '');
  v_forfeited_player := nullif(v_game.projection ->> 'forfeitedPlayerId', '');
  v_timed_out_player := nullif(v_game.projection ->> 'timedOutPlayerId', '');

  if v_timed_out_player is not null and v_timed_out_player not in ('player-one', 'player-two') then
    raise exception 'Corrupt ranked timeout evidence.' using errcode = '22023';
  end if;

  if v_is_timed and v_timed_out_player in ('player-one', 'player-two') then
    if (v_timed_out_player = 'player-one' and v_left_remaining <> 0)
      or (v_timed_out_player = 'player-two' and v_right_remaining <> 0)
    then
      raise exception 'Timed ranked timeout settlement requires exhausted clock evidence.' using errcode = '22023';
    end if;
  end if;

  v_loser_player := coalesce(
    case when v_forfeited_player in ('player-one', 'player-two') then v_forfeited_player end,
    case when v_timed_out_player in ('player-one', 'player-two') then v_timed_out_player end
  );

  if v_winner_player is null and v_loser_player in ('player-one', 'player-two') then
    v_winner_player := case when v_loser_player = 'player-one' then 'player-two' else 'player-one' end;
  end if;

  if v_winner_player is not null and v_winner_player not in ('player-one', 'player-two') then
    raise exception 'Corrupt ranked winner evidence.' using errcode = '22023';
  end if;

  v_winner_user_id := case v_winner_player
    when 'player-one' then v_left_user_id
    when 'player-two' then v_right_user_id
    else null
  end;

  if v_winner_user_id is null then
    v_left_outcome := 'draw';
    v_right_outcome := 'draw';
    v_left_score := 0.5;
    v_right_score := 0.5;
  elsif v_winner_user_id = v_left_user_id then
    v_left_outcome := 'win';
    v_right_outcome := 'loss';
    v_left_score := 1;
    v_right_score := 0;
  else
    v_left_outcome := 'loss';
    v_right_outcome := 'win';
    v_left_score := 0;
    v_right_score := 1;
  end if;

  select count(*)::integer
  into v_left_attempts
  from jsonb_array_elements(v_moves) as move(move_value)
  where move.move_value ->> 'playerId' = 'player-one';

  select count(*)::integer
  into v_right_attempts
  from jsonb_array_elements(v_moves) as move(move_value)
  where move.move_value ->> 'playerId' = 'player-two';

  select count(distinct (
    case
      when coalesce(move.move_value ->> 'puzzleIndex', '0') ~ '^[0-9]+$'
        then (coalesce(move.move_value ->> 'puzzleIndex', '0'))::integer
      else 0
    end
  ))::integer
  into v_left_puzzles
  from jsonb_array_elements(v_moves) as move(move_value)
  where move.move_value ->> 'playerId' = 'player-one'
    and exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(move.move_value -> 'tiles') = 'array' then move.move_value -> 'tiles' else '[]'::jsonb end
      ) as tile(tile_value)
    )
    and not exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(move.move_value -> 'tiles') = 'array' then move.move_value -> 'tiles' else '[]'::jsonb end
      ) as tile(tile_value)
      where tile.tile_value ->> 'state' <> 'correct'
    );

  select count(distinct (
    case
      when coalesce(move.move_value ->> 'puzzleIndex', '0') ~ '^[0-9]+$'
        then (coalesce(move.move_value ->> 'puzzleIndex', '0'))::integer
      else 0
    end
  ))::integer
  into v_right_puzzles
  from jsonb_array_elements(v_moves) as move(move_value)
  where move.move_value ->> 'playerId' = 'player-two'
    and exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(move.move_value -> 'tiles') = 'array' then move.move_value -> 'tiles' else '[]'::jsonb end
      ) as tile(tile_value)
    )
    and not exists (
      select 1
      from jsonb_array_elements(
        case when jsonb_typeof(move.move_value -> 'tiles') = 'array' then move.move_value -> 'tiles' else '[]'::jsonb end
      ) as tile(tile_value)
      where tile.tile_value ->> 'state' <> 'correct'
    );

  insert into public.multiplayer_rating_profiles (user_id, bucket)
  values (v_left_user_id, v_bucket), (v_right_user_id, v_bucket)
  on conflict on constraint multiplayer_rating_profiles_pkey do nothing;

  perform 1
  from public.multiplayer_rating_profiles profile
  where profile.bucket = v_bucket
    and profile.user_id in (v_left_user_id, v_right_user_id)
  order by profile.user_id
  for update;

  select *
  into v_left_profile
  from public.multiplayer_rating_profiles profile
  where profile.user_id = v_left_user_id
    and profile.bucket = v_bucket;

  select *
  into v_right_profile
  from public.multiplayer_rating_profiles profile
  where profile.user_id = v_right_user_id
    and profile.bucket = v_bucket;

  v_left_expected := public.phase27_expected_score(v_left_profile.rating, v_right_profile.rating);
  v_right_expected := public.phase27_expected_score(v_right_profile.rating, v_left_profile.rating);
  v_left_k := public.phase27_k_factor(v_left_profile.games_played);
  v_right_k := public.phase27_k_factor(v_right_profile.games_played);
  v_left_delta := round(v_left_k * (v_left_score - v_left_expected))::integer;
  v_right_delta := round(v_right_k * (v_right_score - v_right_expected))::integer;
  v_left_new_rating := v_left_profile.rating + v_left_delta;
  v_right_new_rating := v_right_profile.rating + v_right_delta;
  v_left_new_games := v_left_profile.games_played + 1;
  v_right_new_games := v_right_profile.games_played + 1;
  v_left_new_provisional := v_left_new_games < 10;
  v_right_new_provisional := v_right_new_games < 10;

  v_match_result_id := case when v_is_timed then 'phase33-result-' else 'phase27-result-' end
    || replace(replace(v_game.id, ':', '-'), '/', '-');

  insert into public.multiplayer_match_results (
    id,
    source_match_id,
    source_transport,
    mode,
    scope,
    daily_date_key,
    ranked,
    rating_bucket,
    terminal_status,
    winner_user_id,
    summary,
    idempotency_key,
    settlement_version,
    settlement_source
  )
  values (
    v_match_result_id,
    v_game.id,
    'async',
    v_game.mode,
    v_game.scope,
    v_game.daily_date_key,
    true,
    v_bucket,
    'completed',
    v_winner_user_id,
    case when v_is_timed then 'Phase 33 trusted timed ranked Practice settlement' else 'Phase 27 trusted ranked Practice settlement' end,
    v_idempotency_key,
    v_settlement_version,
    'trusted_rpc'
  );

  insert into public.multiplayer_player_results (
    match_result_id,
    user_id,
    player_id,
    outcome,
    attempts_used,
    puzzles_solved,
    completed_at,
    summary
  )
  values
    (
      v_match_result_id,
      v_left_user_id,
      'player-one',
      v_left_outcome,
      v_left_attempts,
      coalesce(v_left_puzzles, 0),
      v_game.ended_at,
      'Trusted ranked Practice player-one result'
    ),
    (
      v_match_result_id,
      v_right_user_id,
      'player-two',
      v_right_outcome,
      v_right_attempts,
      coalesce(v_right_puzzles, 0),
      v_game.ended_at,
      'Trusted ranked Practice player-two result'
    );

  update public.multiplayer_rating_profiles as profile
  set
    rating = v_left_new_rating,
    games_played = v_left_new_games,
    wins = profile.wins + case when v_left_outcome = 'win' then 1 else 0 end,
    losses = profile.losses + case when v_left_outcome = 'loss' then 1 else 0 end,
    draws = profile.draws + case when v_left_outcome = 'draw' then 1 else 0 end,
    provisional = v_left_new_provisional,
    updated_at = now()
  where profile.user_id = v_left_user_id
    and profile.bucket = v_bucket;

  update public.multiplayer_rating_profiles as profile
  set
    rating = v_right_new_rating,
    games_played = v_right_new_games,
    wins = profile.wins + case when v_right_outcome = 'win' then 1 else 0 end,
    losses = profile.losses + case when v_right_outcome = 'loss' then 1 else 0 end,
    draws = profile.draws + case when v_right_outcome = 'draw' then 1 else 0 end,
    provisional = v_right_new_provisional,
    updated_at = now()
  where profile.user_id = v_right_user_id
    and profile.bucket = v_bucket;

  insert into public.multiplayer_rating_transactions (
    match_result_id,
    bucket,
    user_id,
    opponent_user_id,
    outcome,
    old_rating,
    new_rating,
    rating_delta,
    expected_score,
    idempotency_key,
    old_games_played,
    new_games_played,
    old_provisional,
    new_provisional,
    k_factor,
    settlement_version
  )
  values
    (
      v_match_result_id,
      v_bucket,
      v_left_user_id,
      v_right_user_id,
      v_left_outcome,
      v_left_profile.rating,
      v_left_new_rating,
      v_left_delta,
      v_left_expected,
      v_idempotency_key || ':' || v_left_user_id::text,
      v_left_profile.games_played,
      v_left_new_games,
      v_left_profile.provisional,
      v_left_new_provisional,
      v_left_k,
      v_settlement_version
    ),
    (
      v_match_result_id,
      v_bucket,
      v_right_user_id,
      v_left_user_id,
      v_right_outcome,
      v_right_profile.rating,
      v_right_new_rating,
      v_right_delta,
      v_right_expected,
      v_idempotency_key || ':' || v_right_user_id::text,
      v_right_profile.games_played,
      v_right_new_games,
      v_right_profile.provisional,
      v_right_new_provisional,
      v_right_k,
      v_settlement_version
    );

  return query
  select
    tx.match_result_id,
    tx.bucket,
    tx.user_id,
    tx.opponent_user_id,
    tx.outcome,
    tx.old_rating,
    tx.new_rating,
    tx.rating_delta,
    tx.expected_score,
    false
  from public.multiplayer_rating_transactions tx
  where tx.match_result_id = v_match_result_id
  order by tx.user_id;
end;
$$;

create or replace function public.get_multiplayer_participant_identity_summaries(
  p_game_id text default null,
  p_ranked_request_id text default null
)
returns table (
  seat text,
  is_viewer boolean,
  identity_available boolean,
  public_profile_id uuid,
  display_name text,
  accent_color text,
  flair_key text,
  avatar_url text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_game_id text := nullif(btrim(coalesce(p_game_id, '')), '');
  v_ranked_request_id text := nullif(btrim(coalesce(p_ranked_request_id, '')), '');
  v_game public.async_multiplayer_games%rowtype;
  v_request public.multiplayer_matchmaking_queue%rowtype;
  v_first public.multiplayer_matchmaking_queue%rowtype;
  v_second public.multiplayer_matchmaking_queue%rowtype;
  v_matched_game_id text;
  v_pair_rows integer;
  v_pair_users integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  if (v_game_id is null and v_ranked_request_id is null)
    or (v_game_id is not null and v_ranked_request_id is not null)
  then
    raise exception 'Exactly one participant identity context is required.' using errcode = '22023';
  end if;

  if v_game_id is not null then
    select *
    into v_game
    from public.async_multiplayer_games as game_row
    where game_row.id = v_game_id;

    if not found
      or (
        v_user_id is distinct from v_game.player_one_user_id
        and v_user_id is distinct from v_game.player_two_user_id
      )
    then
      raise exception 'Participant identity context is not available for current user.' using errcode = '42501';
    end if;

    return query
    with participants(participant_seat, participant_user_id) as (
      values
        ('player-one'::text, v_game.player_one_user_id),
        ('player-two'::text, v_game.player_two_user_id)
    )
    select
      participant.participant_seat,
      participant.participant_user_id = v_user_id,
      profile.public_profile_id is not null,
      profile.public_profile_id,
      profile.display_name,
      profile.accent_color,
      profile.flair_key,
      profile.avatar_url,
      profile.updated_at
    from participants as participant
    left join public.public_player_profiles as profile
      on profile.user_id = participant.participant_user_id
      and profile.visibility = 'public'
      and profile.moderation_status = 'active'
    where participant.participant_user_id is not null
    order by case participant.participant_seat
      when 'player-one' then 1
      when 'player-two' then 2
      else 3
    end;

    return;
  end if;

  select *
  into v_request
  from public.multiplayer_matchmaking_queue as queue_row
  where queue_row.id = v_ranked_request_id;

  if not found or v_request.user_id is distinct from v_user_id then
    raise exception 'Participant identity context is not available for current user.' using errcode = '42501';
  end if;

  if v_request.status <> 'matched' then
    return;
  end if;

  v_matched_game_id := coalesce(nullif(v_request.matched_game_id, ''), nullif(v_request.matched_match_id, ''));

  if v_matched_game_id is null then
    raise exception 'Matched ranked queue request is missing a game id.' using errcode = '22023';
  end if;

  select count(*)::integer, count(distinct queue_row.user_id)::integer
  into v_pair_rows, v_pair_users
  from public.multiplayer_matchmaking_queue as queue_row
  where coalesce(nullif(queue_row.matched_game_id, ''), nullif(queue_row.matched_match_id, '')) = v_matched_game_id
    and queue_row.status = 'matched';

  if v_pair_rows <> 2 or v_pair_users <> 2 then
    raise exception 'Matched ranked queue reservation must contain exactly two distinct users.' using errcode = '22023';
  end if;

  select *
  into v_first
  from public.multiplayer_matchmaking_queue as queue_row
  where coalesce(nullif(queue_row.matched_game_id, ''), nullif(queue_row.matched_match_id, '')) = v_matched_game_id
    and queue_row.status = 'matched'
  order by queue_row.queued_at, queue_row.id
  limit 1;

  select *
  into v_second
  from public.multiplayer_matchmaking_queue as queue_row
  where coalesce(nullif(queue_row.matched_game_id, ''), nullif(queue_row.matched_match_id, '')) = v_matched_game_id
    and queue_row.status = 'matched'
    and queue_row.id <> v_first.id
  order by queue_row.queued_at, queue_row.id
  limit 1;

  if v_first.transport <> 'async'
    or v_second.transport <> 'async'
    or v_first.scope <> 'practice'
    or v_second.scope <> 'practice'
    or v_first.ranked is distinct from true
    or v_second.ranked is distinct from true
    or v_first.mode <> v_second.mode
    or v_first.rating_bucket <> v_second.rating_bucket
    or v_first.word_length is null
    or v_first.word_length is distinct from v_second.word_length
    or v_first.hard_mode is distinct from v_second.hard_mode
    or v_first.time_limit_ms is distinct from v_second.time_limit_ms
    or not public.phase33_is_ranked_practice_time_limit_supported(v_first.time_limit_ms)
    or v_first.rating_bucket <> public.phase33_ranked_practice_storage_bucket_for_mode_and_time_limit(v_first.mode, v_first.time_limit_ms)
    or v_first.user_id = v_second.user_id
  then
    raise exception 'Ranked participant identity context is not eligible.' using errcode = '22023';
  end if;

  return query
  with participants(participant_seat, participant_user_id) as (
    values
      ('player-one'::text, v_first.user_id),
      ('player-two'::text, v_second.user_id)
  )
  select
    participant.participant_seat,
    participant.participant_user_id = v_user_id,
    profile.public_profile_id is not null,
    profile.public_profile_id,
    profile.display_name,
    profile.accent_color,
    profile.flair_key,
    profile.avatar_url,
    profile.updated_at
  from participants as participant
  left join public.public_player_profiles as profile
    on profile.user_id = participant.participant_user_id
    and profile.visibility = 'public'
    and profile.moderation_status = 'active'
  where participant.participant_user_id is not null
  order by case participant.participant_seat
    when 'player-one' then 1
    when 'player-two' then 2
    else 3
  end;
end;
$$;

comment on function public.create_ranked_async_matchmaking_request(text, integer, boolean, text, text, integer, timestamptz)
  is 'Phase 33 authenticated-only RPC for creating untimed or canonical five-minute timed Practice ranked queue requests.';

comment on function public.claim_ranked_async_matchmaking_pair(text, text)
  is 'Phase 33 authenticated-only RPC for atomically reserving a compatible untimed or canonical five-minute timed ranked Practice pair.';

comment on function public.get_ranked_async_matchmaking_status(text)
  is 'Phase 33 authenticated-only ranked Practice queue status and deterministic seat assignment RPC for untimed and canonical timed requests.';

comment on function public.finalize_ranked_async_matchmaking_game(text, text, jsonb, text)
  is 'Phase 33 authenticated-only ranked Practice queue finalization RPC for untimed and canonical five-minute timed reservations.';

comment on function public.settle_ranked_async_multiplayer_match(text, text)
  is 'Phase 33 authenticated-only trusted ranked Practice settlement from durable async multiplayer rows, including canonical timed ranked Practice.';

comment on function public.get_multiplayer_participant_identity_summaries(text, text)
  is 'Phase 33 authenticated-only participant-scoped public-safe identity summaries for async multiplayer games and matched untimed or canonical timed ranked Practice queue contexts.';

revoke all on function public.phase33_ranked_timed_practice_time_limit_ms() from public;
revoke all on function public.phase33_ranked_timed_practice_time_limit_ms() from anon;
revoke all on function public.phase33_ranked_timed_practice_time_limit_ms() from authenticated;

revoke all on function public.phase33_is_ranked_practice_time_limit_supported(integer) from public;
revoke all on function public.phase33_is_ranked_practice_time_limit_supported(integer) from anon;
revoke all on function public.phase33_is_ranked_practice_time_limit_supported(integer) from authenticated;

revoke all on function public.phase33_ranked_practice_storage_bucket_for_mode_and_time_limit(text, integer) from public;
revoke all on function public.phase33_ranked_practice_storage_bucket_for_mode_and_time_limit(text, integer) from anon;
revoke all on function public.phase33_ranked_practice_storage_bucket_for_mode_and_time_limit(text, integer) from authenticated;

revoke all on function public.phase33_ranked_practice_app_bucket_for_storage_bucket(text) from public;
revoke all on function public.phase33_ranked_practice_app_bucket_for_storage_bucket(text) from anon;
revoke all on function public.phase33_ranked_practice_app_bucket_for_storage_bucket(text) from authenticated;

revoke all on function public.phase33_is_timed_ranked_practice_storage_bucket(text) from public;
revoke all on function public.phase33_is_timed_ranked_practice_storage_bucket(text) from anon;
revoke all on function public.phase33_is_timed_ranked_practice_storage_bucket(text) from authenticated;

revoke all on function public.create_ranked_async_matchmaking_request(text, integer, boolean, text, text, integer, timestamptz) from public;
revoke all on function public.create_ranked_async_matchmaking_request(text, integer, boolean, text, text, integer, timestamptz) from anon;
revoke all on function public.create_ranked_async_matchmaking_request(text, integer, boolean, text, text, integer, timestamptz) from authenticated;

revoke all on function public.claim_ranked_async_matchmaking_pair(text, text) from public;
revoke all on function public.claim_ranked_async_matchmaking_pair(text, text) from anon;
revoke all on function public.claim_ranked_async_matchmaking_pair(text, text) from authenticated;

revoke all on function public.get_ranked_async_matchmaking_status(text) from public;
revoke all on function public.get_ranked_async_matchmaking_status(text) from anon;
revoke all on function public.get_ranked_async_matchmaking_status(text) from authenticated;

revoke all on function public.finalize_ranked_async_matchmaking_game(text, text, jsonb, text) from public;
revoke all on function public.finalize_ranked_async_matchmaking_game(text, text, jsonb, text) from anon;
revoke all on function public.finalize_ranked_async_matchmaking_game(text, text, jsonb, text) from authenticated;

revoke all on function public.settle_ranked_async_multiplayer_match(text, text) from public;
revoke all on function public.settle_ranked_async_multiplayer_match(text, text) from anon;
revoke all on function public.settle_ranked_async_multiplayer_match(text, text) from authenticated;

revoke all on function public.get_multiplayer_participant_identity_summaries(text, text) from public;
revoke all on function public.get_multiplayer_participant_identity_summaries(text, text) from anon;
revoke all on function public.get_multiplayer_participant_identity_summaries(text, text) from authenticated;

grant execute on function public.create_ranked_async_matchmaking_request(text, integer, boolean, text, text, integer, timestamptz) to authenticated;
grant execute on function public.claim_ranked_async_matchmaking_pair(text, text) to authenticated;
grant execute on function public.get_ranked_async_matchmaking_status(text) to authenticated;
grant execute on function public.finalize_ranked_async_matchmaking_game(text, text, jsonb, text) to authenticated;
grant execute on function public.settle_ranked_async_multiplayer_match(text, text) to authenticated;
grant execute on function public.get_multiplayer_participant_identity_summaries(text, text) to authenticated;

grant select on table public.multiplayer_matchmaking_queue to authenticated;
revoke insert, update on table public.multiplayer_matchmaking_queue from authenticated;
