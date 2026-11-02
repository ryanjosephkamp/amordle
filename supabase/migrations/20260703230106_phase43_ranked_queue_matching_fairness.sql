-- Phase 43 Stage 43.2B: ranked Practice queue matching fairness.
-- Preserve the browser-facing claim_ranked_async_matchmaking_pair(text, text)
-- signature while preferring a compatible non-recent opponent when one exists.

create index if not exists async_multiplayer_games_phase43_ranked_recent_pair_forward_idx
  on public.async_multiplayer_games (
    player_one_user_id,
    player_two_user_id,
    mode,
    rating_bucket,
    word_length,
    ended_at desc,
    updated_at desc
  )
  where ranked = true
    and scope = 'practice'
    and status in ('won', 'lost', 'expired');

create index if not exists async_multiplayer_games_phase43_ranked_recent_pair_reverse_idx
  on public.async_multiplayer_games (
    player_two_user_id,
    player_one_user_id,
    mode,
    rating_bucket,
    word_length,
    ended_at desc,
    updated_at desc
  )
  where ranked = true
    and scope = 'practice'
    and status in ('won', 'lost', 'expired');

create or replace function public.phase43_is_recent_ranked_practice_opponent(
  p_request_user_id uuid,
  p_candidate_user_id uuid,
  p_mode text,
  p_rating_bucket text,
  p_word_length integer,
  p_hard_mode boolean,
  p_time_limit_ms integer,
  p_reference_time timestamptz default now()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from (
      select
        case
          when nullif(game_row.projection ->> 'hardMode', '') is null then false
          when nullif(game_row.projection ->> 'hardMode', '') = 'true' then true
          when nullif(game_row.projection ->> 'hardMode', '') = 'false' then false
          else null
        end as projected_hard_mode,
        case
          when nullif(game_row.projection ->> 'timeLimitMs', '') is null then null
          when nullif(game_row.projection ->> 'timeLimitMs', '') = '0' then null
          when nullif(game_row.projection ->> 'timeLimitMs', '') ~ '^[0-9]+$'
            then nullif((game_row.projection ->> 'timeLimitMs')::integer, 0)
          else -1
        end as projected_time_limit_ms
      from public.async_multiplayer_games game_row
      where game_row.ranked = true
        and game_row.scope = 'practice'
        and game_row.status in ('won', 'lost', 'expired')
        and game_row.mode = lower(coalesce(p_mode, ''))
        and game_row.rating_bucket = p_rating_bucket
        and game_row.word_length = p_word_length
        and coalesce(game_row.ended_at, game_row.updated_at, game_row.created_at)
          >= coalesce(p_reference_time, now()) - interval '30 minutes'
        and (
          (
            game_row.player_one_user_id = p_request_user_id
            and game_row.player_two_user_id = p_candidate_user_id
          )
          or (
            game_row.player_one_user_id = p_candidate_user_id
            and game_row.player_two_user_id = p_request_user_id
          )
        )
    ) normalized_game
    where normalized_game.projected_hard_mode is not distinct from coalesce(p_hard_mode, false)
      and normalized_game.projected_time_limit_ms is not distinct from p_time_limit_ms
    limit 1
  );
$$;

comment on function public.phase43_is_recent_ranked_practice_opponent(uuid, uuid, text, text, integer, boolean, integer, timestamptz)
  is 'Internal Phase 43 helper for ranked Practice queue matching fairness. Detects a recent same-settings terminal ranked Practice game between two users; browser execution is intentionally revoked.';

revoke all on function public.phase43_is_recent_ranked_practice_opponent(uuid, uuid, text, text, integer, boolean, integer, timestamptz) from public;
revoke all on function public.phase43_is_recent_ranked_practice_opponent(uuid, uuid, text, text, integer, boolean, integer, timestamptz) from anon;
revoke all on function public.phase43_is_recent_ranked_practice_opponent(uuid, uuid, text, text, integer, boolean, integer, timestamptz) from authenticated;

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
    case
      when public.phase43_is_recent_ranked_practice_opponent(
        v_request.user_id,
        candidate.user_id,
        v_request.mode,
        v_request.rating_bucket,
        v_request.word_length,
        v_request.hard_mode,
        v_request.time_limit_ms,
        now()
      )
      then 1
      else 0
    end,
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

comment on function public.claim_ranked_async_matchmaking_pair(text, text)
  is 'Claims a ranked async Practice matchmaking pair. Phase 43 preserves the public signature and compatibility filters while preferring compatible non-recent opponents over immediate same-settings repeat opponents.';

revoke all on function public.claim_ranked_async_matchmaking_pair(text, text) from public;
revoke all on function public.claim_ranked_async_matchmaking_pair(text, text) from anon;
revoke all on function public.claim_ranked_async_matchmaking_pair(text, text) from authenticated;

grant execute on function public.claim_ranked_async_matchmaking_pair(text, text) to authenticated;
