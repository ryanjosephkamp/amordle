-- Phase 27 Stage 27.3: trusted ranked Practice queue authority and
-- idempotent ranked settlement. This migration is additive and keeps browser
-- clients away from direct rating/result writes.

create extension if not exists pgcrypto with schema extensions;

alter table public.multiplayer_matchmaking_queue
  add column if not exists hard_mode boolean not null default false,
  add column if not exists time_limit_ms integer,
  add column if not exists matchmaking_version text not null default 'phase27-ranked-v1',
  add column if not exists matched_game_id text;

alter table public.multiplayer_match_results
  add column if not exists settlement_version text not null default 'phase27-ranked-v1',
  add column if not exists settlement_source text not null default 'trusted_rpc';

alter table public.multiplayer_rating_transactions
  add column if not exists old_games_played integer,
  add column if not exists new_games_played integer,
  add column if not exists old_provisional boolean,
  add column if not exists new_provisional boolean,
  add column if not exists k_factor integer,
  add column if not exists settlement_version text not null default 'phase27-ranked-v1';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'multiplayer_matchmaking_queue_time_limit_positive_check'
      and conrelid = 'public.multiplayer_matchmaking_queue'::regclass
  ) then
    alter table public.multiplayer_matchmaking_queue
      add constraint multiplayer_matchmaking_queue_time_limit_positive_check
      check (time_limit_ms is null or time_limit_ms > 0)
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'multiplayer_matchmaking_queue_word_length_bounds_check'
      and conrelid = 'public.multiplayer_matchmaking_queue'::regclass
  ) then
    alter table public.multiplayer_matchmaking_queue
      add constraint multiplayer_matchmaking_queue_word_length_bounds_check
      check (word_length is null or (word_length between 2 and 35))
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'multiplayer_rating_transactions_games_played_check'
      and conrelid = 'public.multiplayer_rating_transactions'::regclass
  ) then
    alter table public.multiplayer_rating_transactions
      add constraint multiplayer_rating_transactions_games_played_check
      check (
        (old_games_played is null or old_games_played >= 0)
        and (new_games_played is null or new_games_played >= 0)
      )
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'multiplayer_rating_transactions_k_factor_check'
      and conrelid = 'public.multiplayer_rating_transactions'::regclass
  ) then
    alter table public.multiplayer_rating_transactions
      add constraint multiplayer_rating_transactions_k_factor_check
      check (k_factor is null or k_factor > 0)
      not valid;
  end if;
end $$;

create index if not exists multiplayer_matchmaking_queue_ranked_practice_idx
  on public.multiplayer_matchmaking_queue (
    transport,
    mode,
    scope,
    rating_bucket,
    hard_mode,
    word_length,
    queued_at
  )
  where status = 'queued'
    and ranked = true
    and transport = 'async'
    and scope = 'practice';

create index if not exists multiplayer_matchmaking_queue_matched_game_idx
  on public.multiplayer_matchmaking_queue (matched_game_id)
  where matched_game_id is not null;

create index if not exists multiplayer_matchmaking_queue_user_status_idx
  on public.multiplayer_matchmaking_queue (user_id, status, queued_at desc);

create or replace function public.phase27_rating_bucket_for_mode(p_mode text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case lower(coalesce(p_mode, ''))
    when 'og' then 'async:og'
    when 'go' then 'async:go'
    else null
  end
$$;

create or replace function public.phase27_expected_score(
  p_rating integer,
  p_opponent_rating integer
)
returns numeric
language sql
immutable
set search_path = public, pg_temp
as $$
  select greatest(
    0::numeric,
    least(
      1::numeric,
      1::numeric / (
        1::numeric + power(
          10::numeric,
          greatest(
            -10::numeric,
            least(
              10::numeric,
              ((coalesce(p_opponent_rating, 1200) - coalesce(p_rating, 1200))::numeric / 400::numeric)
            )
          )
        )
      )
    )
  )
$$;

create or replace function public.phase27_k_factor(p_games_played integer)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when coalesce(p_games_played, 0) < 10 then 40 else 24 end
$$;

create or replace function public.phase27_ranked_search_band(
  p_rating integer,
  p_queued_at timestamptz,
  p_now timestamptz default now()
)
returns integer
language sql
stable
set search_path = public, pg_temp
as $$
  select least(
    600,
    (case when coalesce(p_rating, 1200) = 1200 then 200 else 100 end)
      + greatest(
        0,
        floor(
          extract(epoch from (coalesce(p_now, now()) - coalesce(p_queued_at, coalesce(p_now, now()))))
          / 600
        )::integer
      ) * 50
  )
$$;

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
  v_existing_user_id uuid;
  v_key text;
  v_rating_snapshot integer;
  v_request_id text;
begin
  if auth.role() <> 'authenticated' or v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if lower(coalesce(p_scope, '')) <> 'practice' then
    raise exception 'Daily ranked matchmaking is deferred.' using errcode = '22023';
  end if;

  if p_time_limit_ms is not null and p_time_limit_ms > 0 then
    raise exception 'Timed Practice ranked matchmaking is deferred.' using errcode = '22023';
  end if;

  v_bucket := public.phase27_rating_bucket_for_mode(p_mode);
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
  v_key := coalesce(
    nullif(p_idempotency_key, ''),
    'phase27-ranked-v1:queue:' || v_user_id::text || ':' || lower(p_mode) || ':' || p_word_length::text || ':' || coalesce(p_hard_mode, false)::text || ':' || gen_random_uuid()::text
  );

  select queue_row.id, queue_row.user_id
  into v_request_id, v_existing_user_id
  from public.multiplayer_matchmaking_queue queue_row
  where queue_row.idempotency_key = v_key;

  if v_request_id is not null then
    if v_existing_user_id <> v_user_id then
      raise exception 'Ranked queue idempotency key belongs to another user.' using errcode = '42501';
    end if;
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
      lower(p_mode),
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
      null,
      'phase27-ranked-v1'
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

create or replace function public.cancel_ranked_async_matchmaking_request(p_request_id text)
returns table (
  request_id text,
  request_status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if auth.role() <> 'authenticated' or v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  update public.multiplayer_matchmaking_queue queue_row
  set status = 'cancelled'
  where queue_row.id = p_request_id
    and queue_row.user_id = v_user_id
    and queue_row.status = 'queued'
  returning queue_row.id, queue_row.status
  into request_id, request_status;

  if request_id is null then
    raise exception 'No cancellable ranked queue request found for current user.' using errcode = 'P0002';
  end if;

  return next;
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
    or v_request.time_limit_ms is not null
    or v_request.rating_bucket <> public.phase27_rating_bucket_for_mode(v_request.mode)
    or v_request.word_length is null
    or v_request.word_length < 2
    or v_request.word_length > 35
  then
    raise exception 'Ranked queue request is not eligible for Phase 27 ranked pairing.' using errcode = '22023';
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
    and candidate.time_limit_ms is null
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
  v_right_score numeric;
  v_right_user_id uuid;
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

  v_bucket := public.phase27_rating_bucket_for_mode(v_game.mode);
  if v_bucket is null or v_game.rating_bucket <> v_bucket then
    raise exception 'Ranked rating bucket does not match mode.' using errcode = '22023';
  end if;

  if v_left_user_id is null or v_right_user_id is null or v_left_user_id = v_right_user_id then
    raise exception 'Ranked settlement requires two distinct participant users.' using errcode = '22023';
  end if;

  if v_game.status not in ('won', 'lost') then
    raise exception 'Ranked settlement requires completed win/loss evidence.' using errcode = '22023';
  end if;

  v_time_limit_text := nullif(v_game.projection ->> 'timeLimitMs', '');
  if v_time_limit_text is not null then
    if v_time_limit_text !~ '^[0-9]+$' then
      raise exception 'Corrupt ranked time-limit evidence.' using errcode = '22023';
    end if;
    if v_time_limit_text::integer > 0 then
      raise exception 'Timed Practice ranked multiplayer is deferred.' using errcode = '22023';
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
    and queue_row.time_limit_ms is null
    and queue_row.word_length = v_game.word_length
    and queue_row.user_id in (v_left_user_id, v_right_user_id);

  if v_reservation_rows <> 2 or v_reservation_users <> 2 then
    raise exception 'Ranked settlement requires a matched ranked queue reservation.' using errcode = '42501';
  end if;

  v_idempotency_key := coalesce(nullif(p_idempotency_key, ''), 'phase27-ranked-v1:async:' || v_game.id || ':' || v_bucket);

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
  on conflict (user_id, bucket) do nothing;

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

  v_match_result_id := 'phase27-result-' || replace(replace(v_game.id, ':', '-'), '/', '-');

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
    'Phase 27 trusted ranked Practice settlement',
    v_idempotency_key,
    'phase27-ranked-v1',
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

  update public.multiplayer_rating_profiles
  set
    rating = v_left_new_rating,
    games_played = v_left_new_games,
    wins = wins + case when v_left_outcome = 'win' then 1 else 0 end,
    losses = losses + case when v_left_outcome = 'loss' then 1 else 0 end,
    draws = draws + case when v_left_outcome = 'draw' then 1 else 0 end,
    provisional = v_left_new_provisional,
    updated_at = now()
  where user_id = v_left_user_id
    and bucket = v_bucket;

  update public.multiplayer_rating_profiles
  set
    rating = v_right_new_rating,
    games_played = v_right_new_games,
    wins = wins + case when v_right_outcome = 'win' then 1 else 0 end,
    losses = losses + case when v_right_outcome = 'loss' then 1 else 0 end,
    draws = draws + case when v_right_outcome = 'draw' then 1 else 0 end,
    provisional = v_right_new_provisional,
    updated_at = now()
  where user_id = v_right_user_id
    and bucket = v_bucket;

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
      'phase27-ranked-v1'
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
      'phase27-ranked-v1'
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

comment on function public.create_ranked_async_matchmaking_request(text, integer, boolean, text, text, integer, timestamptz)
  is 'Phase 27 authenticated-only RPC for creating untimed Practice ranked queue requests.';

comment on function public.cancel_ranked_async_matchmaking_request(text)
  is 'Phase 27 authenticated-only RPC for cancelling the caller''s queued ranked Practice request.';

comment on function public.claim_ranked_async_matchmaking_pair(text, text)
  is 'Phase 27 authenticated-only RPC for atomically reserving a compatible ranked Practice pair.';

comment on function public.settle_ranked_async_multiplayer_match(text, text)
  is 'Phase 27 authenticated-only trusted ranked Practice settlement from durable async multiplayer rows.';

revoke all on function public.phase27_rating_bucket_for_mode(text) from public;
revoke all on function public.phase27_rating_bucket_for_mode(text) from anon;
revoke all on function public.phase27_rating_bucket_for_mode(text) from authenticated;

revoke all on function public.phase27_expected_score(integer, integer) from public;
revoke all on function public.phase27_expected_score(integer, integer) from anon;
revoke all on function public.phase27_expected_score(integer, integer) from authenticated;

revoke all on function public.phase27_k_factor(integer) from public;
revoke all on function public.phase27_k_factor(integer) from anon;
revoke all on function public.phase27_k_factor(integer) from authenticated;

revoke all on function public.phase27_ranked_search_band(integer, timestamptz, timestamptz) from public;
revoke all on function public.phase27_ranked_search_band(integer, timestamptz, timestamptz) from anon;
revoke all on function public.phase27_ranked_search_band(integer, timestamptz, timestamptz) from authenticated;

revoke all on function public.create_ranked_async_matchmaking_request(text, integer, boolean, text, text, integer, timestamptz) from public;
revoke all on function public.create_ranked_async_matchmaking_request(text, integer, boolean, text, text, integer, timestamptz) from anon;
revoke all on function public.create_ranked_async_matchmaking_request(text, integer, boolean, text, text, integer, timestamptz) from authenticated;

revoke all on function public.cancel_ranked_async_matchmaking_request(text) from public;
revoke all on function public.cancel_ranked_async_matchmaking_request(text) from anon;
revoke all on function public.cancel_ranked_async_matchmaking_request(text) from authenticated;

revoke all on function public.claim_ranked_async_matchmaking_pair(text, text) from public;
revoke all on function public.claim_ranked_async_matchmaking_pair(text, text) from anon;
revoke all on function public.claim_ranked_async_matchmaking_pair(text, text) from authenticated;

revoke all on function public.settle_ranked_async_multiplayer_match(text, text) from public;
revoke all on function public.settle_ranked_async_multiplayer_match(text, text) from anon;
revoke all on function public.settle_ranked_async_multiplayer_match(text, text) from authenticated;

grant execute on function public.create_ranked_async_matchmaking_request(text, integer, boolean, text, text, integer, timestamptz) to authenticated;
grant execute on function public.cancel_ranked_async_matchmaking_request(text) to authenticated;
grant execute on function public.claim_ranked_async_matchmaking_pair(text, text) to authenticated;
grant execute on function public.settle_ranked_async_multiplayer_match(text, text) to authenticated;

grant select on table public.multiplayer_matchmaking_queue to authenticated;
revoke insert, update on table public.multiplayer_matchmaking_queue from authenticated;
