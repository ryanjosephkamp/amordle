-- Phase 50: ranked Practice FIFO matchmaking.
-- Preserve the browser-facing claim_ranked_async_matchmaking_pair(text, text)
-- signature while simplifying candidate selection to first-come, first-served
-- among compatible queued ranked Practice requests.

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
  order by
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

comment on function public.claim_ranked_async_matchmaking_pair(text, text)
  is 'Claims a ranked async Practice matchmaking pair. Phase 50 preserves the public signature and compatibility filters while matching the oldest compatible queued opponent first.';

revoke all on function public.claim_ranked_async_matchmaking_pair(text, text) from public;
revoke all on function public.claim_ranked_async_matchmaking_pair(text, text) from anon;
revoke all on function public.claim_ranked_async_matchmaking_pair(text, text) from authenticated;

grant execute on function public.claim_ranked_async_matchmaking_pair(text, text) to authenticated;
