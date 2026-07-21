-- Phase 27 Stage 27.5B: ranked Practice queue game finalization.
--
-- This migration keeps the verified Stage 27.3 queue reservation RPCs intact
-- and adds the missing trusted handoff from a matched queue reservation to one
-- participant-complete async_multiplayer_games row.

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
    or v_request.time_limit_ms is not null
    or v_request.rating_bucket <> public.phase27_rating_bucket_for_mode(v_request.mode)
    or v_request.word_length is null
    or v_request.word_length < 2
    or v_request.word_length > 35
  then
    raise exception 'Ranked queue request is not eligible for Phase 27 ranked Practice status.' using errcode = '22023';
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
    or v_first.rating_bucket <> public.phase27_rating_bucket_for_mode(v_first.mode)
    or v_first.word_length is distinct from v_second.word_length
    or v_first.hard_mode is distinct from v_second.hard_mode
    or v_first.time_limit_ms is not null
    or v_second.time_limit_ms is not null
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
  v_projection_word_length text;
  v_time_limit_text text;
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
    or v_first.rating_bucket <> public.phase27_rating_bucket_for_mode(v_first.mode)
    or v_first.word_length is null
    or v_first.word_length is distinct from v_second.word_length
    or v_first.hard_mode is distinct from v_second.hard_mode
    or v_first.time_limit_ms is not null
    or v_second.time_limit_ms is not null
    or v_first.user_id = v_second.user_id
  then
    raise exception 'Matched ranked queue reservation contains incompatible settings.' using errcode = '22023';
  end if;

  v_app_rating_bucket := case v_first.rating_bucket
    when 'async:og' then 'multiplayer:og'
    when 'async:go' then 'multiplayer:go'
    else null
  end;

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
  if v_time_limit_text is not null and v_time_limit_text <> '0' then
    raise exception 'Timed Practice ranked game finalization is deferred.' using errcode = '22023';
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

  v_idempotency_key := coalesce(nullif(p_idempotency_key, ''), 'phase27-ranked-v1:finalize:' || p_matched_game_id);

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

revoke all on function public.get_ranked_async_matchmaking_status(text) from public;
revoke all on function public.get_ranked_async_matchmaking_status(text) from anon;
revoke all on function public.get_ranked_async_matchmaking_status(text) from authenticated;

revoke all on function public.finalize_ranked_async_matchmaking_game(text, text, jsonb, text) from public;
revoke all on function public.finalize_ranked_async_matchmaking_game(text, text, jsonb, text) from anon;
revoke all on function public.finalize_ranked_async_matchmaking_game(text, text, jsonb, text) from authenticated;

grant execute on function public.get_ranked_async_matchmaking_status(text) to authenticated;
grant execute on function public.finalize_ranked_async_matchmaking_game(text, text, jsonb, text) to authenticated;

comment on function public.get_ranked_async_matchmaking_status(text)
  is 'Phase 27 authenticated-only ranked Practice queue status and deterministic seat assignment RPC.';

comment on function public.finalize_ranked_async_matchmaking_game(text, text, jsonb, text)
  is 'Phase 27 authenticated-only ranked Practice queue finalization RPC that creates one participant-complete playing async_multiplayer_games row from a matched queue reservation.';
