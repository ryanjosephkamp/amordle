-- Make ranked Practice claim retries idempotent after a concurrent caller has
-- already matched the authenticated caller's valid, owned queue request.
-- Ranked Daily and the existing queued FIFO path remain unchanged.

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
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.multiplayer_matchmaking_queue%rowtype;
  v_opponent public.multiplayer_matchmaking_queue%rowtype;
  v_matched_game_id text;
  v_request_lock_key bigint;
  v_opponent_lock_key bigint;
  v_pair_rows integer;
  v_pair_users integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  update public.multiplayer_matchmaking_queue queue_row
  set status = 'expired'
  where queue_row.status = 'queued'
    and queue_row.expires_at is not null
    and queue_row.expires_at <= now();

  select * into v_request
  from public.multiplayer_matchmaking_queue queue_row
  where queue_row.id = p_request_id;

  if not found or v_request.user_id <> v_user_id then
    raise exception 'Ranked queue request is not owned by current user.' using errcode = '42501';
  end if;
  if v_request.transport <> 'async'
    or v_request.ranked is distinct from true
    or not public.phase55_ranked_queue_settings_are_valid(
      v_request.scope,
      v_request.daily_date_key,
      v_request.mode,
      v_request.word_length,
      v_request.rating_bucket,
      v_request.time_limit_ms
    )
  then
    raise exception 'Ranked queue request is not eligible for pairing.' using errcode = '22023';
  end if;

  if v_request.scope = 'practice' then
    select * into v_request
    from public.multiplayer_matchmaking_queue queue_row
    where queue_row.id = p_request_id
    for update;

    if v_request.status = 'matched' then
      v_matched_game_id := coalesce(
        nullif(v_request.matched_game_id, ''),
        nullif(v_request.matched_match_id, '')
      );

      if v_matched_game_id is not null then
        select count(*)::integer, count(distinct queue_row.user_id)::integer
        into v_pair_rows, v_pair_users
        from public.multiplayer_matchmaking_queue queue_row
        where coalesce(nullif(queue_row.matched_game_id, ''), nullif(queue_row.matched_match_id, '')) = v_matched_game_id
          and queue_row.status = 'matched';

        select * into v_opponent
        from public.multiplayer_matchmaking_queue queue_row
        where coalesce(nullif(queue_row.matched_game_id, ''), nullif(queue_row.matched_match_id, '')) = v_matched_game_id
          and queue_row.status = 'matched'
          and queue_row.id <> v_request.id
        order by queue_row.queued_at, queue_row.id
        limit 1;

        if v_pair_rows = 2 and v_pair_users = 2 and found then
          if v_opponent.user_id <> v_request.user_id
            and v_opponent.transport = 'async'
            and v_opponent.ranked = true
            and v_opponent.scope = 'practice'
            and v_opponent.daily_date_key is null
            and v_opponent.mode = v_request.mode
            and v_opponent.rating_bucket = v_request.rating_bucket
            and v_opponent.hard_mode = v_request.hard_mode
            and v_opponent.word_length = v_request.word_length
            and v_opponent.time_limit_ms is not distinct from v_request.time_limit_ms
            and public.phase55_ranked_queue_settings_are_valid(
              v_opponent.scope,
              v_opponent.daily_date_key,
              v_opponent.mode,
              v_opponent.word_length,
              v_opponent.rating_bucket,
              v_opponent.time_limit_ms
            )
          then
            return query select v_request.id, v_opponent.id, v_matched_game_id, 'matched'::text;
            return;
          end if;
        end if;
      end if;
    end if;

    if v_request.status <> 'queued' then
      raise exception 'Ranked queue request is not queued.' using errcode = '22023';
    end if;

    select candidate.* into v_opponent
    from public.multiplayer_matchmaking_queue candidate
    where candidate.status = 'queued'
      and candidate.id <> v_request.id
      and candidate.user_id <> v_request.user_id
      and candidate.transport = 'async'
      and candidate.ranked = true
      and candidate.scope = 'practice'
      and candidate.daily_date_key is null
      and candidate.mode = v_request.mode
      and candidate.rating_bucket = v_request.rating_bucket
      and candidate.hard_mode = v_request.hard_mode
      and candidate.word_length = v_request.word_length
      and candidate.time_limit_ms is not distinct from v_request.time_limit_ms
      and public.phase55_ranked_queue_settings_are_valid(
        candidate.scope,
        candidate.daily_date_key,
        candidate.mode,
        candidate.word_length,
        candidate.rating_bucket,
        candidate.time_limit_ms
      )
      and (candidate.expires_at is null or candidate.expires_at > now())
    order by candidate.queued_at, candidate.id
    for update skip locked
    limit 1;

    if not found then
      return query select v_request.id, null::text, null::text, 'queued'::text;
      return;
    end if;

    v_matched_game_id := coalesce(
      nullif(p_matched_game_id, ''),
      'ranked-async-game-' || extensions.gen_random_uuid()::text
    );
    update public.multiplayer_matchmaking_queue queue_row
    set
      status = 'matched',
      matched_at = now(),
      matched_match_id = v_matched_game_id,
      matched_game_id = v_matched_game_id
    where queue_row.id in (v_request.id, v_opponent.id);

    return query select v_request.id, v_opponent.id, v_matched_game_id, 'matched'::text;
    return;
  end if;

  if v_request.scope <> 'daily' or v_request.status <> 'queued' then
    raise exception 'Ranked Daily queue request is not queued.' using errcode = '22023';
  end if;

  loop
    select candidate.* into v_opponent
    from public.multiplayer_matchmaking_queue candidate
    where candidate.status = 'queued'
      and candidate.id <> v_request.id
      and candidate.user_id <> v_request.user_id
      and candidate.transport = 'async'
      and candidate.ranked = true
      and candidate.scope = 'daily'
      and candidate.daily_date_key = v_request.daily_date_key
      and candidate.mode = v_request.mode
      and candidate.rating_bucket = v_request.rating_bucket
      and candidate.hard_mode = v_request.hard_mode
      and candidate.word_length = 5
      and candidate.time_limit_ms is null
      and public.phase55_ranked_queue_settings_are_valid(
        candidate.scope,
        candidate.daily_date_key,
        candidate.mode,
        candidate.word_length,
        candidate.rating_bucket,
        candidate.time_limit_ms
      )
      and (candidate.expires_at is null or candidate.expires_at > now())
      and not exists (
        select 1 from public.multiplayer_daily_claims claim_row
        where claim_row.user_id = candidate.user_id
          and claim_row.transport = 'async'
          and claim_row.mode = candidate.mode
          and claim_row.daily_date_key = candidate.daily_date_key
          and claim_row.ranked = true
      )
    order by candidate.queued_at, candidate.id
    limit 1;

    if not found then
      return query select v_request.id, null::text, null::text, 'queued'::text;
      return;
    end if;

    v_request_lock_key := public.phase55_ranked_daily_lane_lock_key(
      v_request.user_id,
      v_request.daily_date_key,
      v_request.mode
    );
    v_opponent_lock_key := public.phase55_ranked_daily_lane_lock_key(
      v_opponent.user_id,
      v_opponent.daily_date_key,
      v_opponent.mode
    );
    if v_request_lock_key <= v_opponent_lock_key then
      perform pg_advisory_xact_lock(v_request_lock_key);
      perform pg_advisory_xact_lock(v_opponent_lock_key);
    else
      perform pg_advisory_xact_lock(v_opponent_lock_key);
      perform pg_advisory_xact_lock(v_request_lock_key);
    end if;

    perform 1
    from public.multiplayer_matchmaking_queue queue_row
    where queue_row.id in (v_request.id, v_opponent.id)
    order by queue_row.id
    for update;

    select * into v_request
    from public.multiplayer_matchmaking_queue queue_row
    where queue_row.id = p_request_id;
    select * into v_opponent
    from public.multiplayer_matchmaking_queue queue_row
    where queue_row.id = v_opponent.id;

    if v_request.status <> 'queued' then
      raise exception 'Ranked Daily queue request changed while pairing.' using errcode = '40001';
    end if;
    if v_opponent.status <> 'queued'
      or v_opponent.scope <> 'daily'
      or v_opponent.daily_date_key is distinct from v_request.daily_date_key
      or v_opponent.mode <> v_request.mode
      or v_opponent.rating_bucket <> v_request.rating_bucket
      or v_opponent.hard_mode <> v_request.hard_mode
      or v_opponent.word_length <> 5
      or v_opponent.time_limit_ms is not null
    then
      continue;
    end if;

    if exists (
      select 1 from public.multiplayer_daily_claims claim_row
      where claim_row.user_id in (v_request.user_id, v_opponent.user_id)
        and claim_row.transport = 'async'
        and claim_row.mode = v_request.mode
        and claim_row.daily_date_key = v_request.daily_date_key
        and claim_row.ranked = true
    ) then
      raise exception 'Ranked Daily lane is already claimed.' using errcode = '23505';
    end if;

    v_matched_game_id := 'ranked-async-game-' || extensions.gen_random_uuid()::text;
    insert into brrrdle_private.ranked_daily_pair_reservations (
      game_id,
      request_one_id,
      request_two_id,
      player_one_user_id,
      player_two_user_id,
      daily_date_key,
      mode,
      hard_mode,
      rating_bucket
    ) values (
      v_matched_game_id,
      v_request.id,
      v_opponent.id,
      v_request.user_id,
      v_opponent.user_id,
      v_request.daily_date_key,
      v_request.mode,
      v_request.hard_mode,
      v_request.rating_bucket
    );

    update public.multiplayer_matchmaking_queue queue_row
    set
      status = 'matched',
      matched_at = now(),
      matched_match_id = v_matched_game_id,
      matched_game_id = v_matched_game_id
    where queue_row.id in (v_request.id, v_opponent.id);

    return query select v_request.id, v_opponent.id, v_matched_game_id, 'matched'::text;
    return;
  end loop;
end;
$$;

comment on function public.claim_ranked_async_matchmaking_pair(text, text)
  is 'Pairs compatible ranked async requests; authenticated Practice retries return an already-complete owned match idempotently.';

revoke all on function public.claim_ranked_async_matchmaking_pair(text, text) from public, anon, authenticated;
grant execute on function public.claim_ranked_async_matchmaking_pair(text, text) to authenticated;

-- Verification:
-- 1. A valid owned ranked Practice request already matched to exactly one
--    compatible rival returns its stored match and opponent request ids.
-- 2. Queued Practice requests still match oldest-compatible-first.
-- 3. Cancelled, expired, invalid, incomplete, or foreign requests still fail.
-- 4. Ranked Daily behavior and its private authority are unchanged.
