-- Phase 55 ranked Daily finalization authority repair.
--
-- Ranked Daily canonical projection fields come from the locked private pair
-- reservation. Caller JSON is not an authority source and unknown fields are
-- intentionally discarded. Ranked Practice continues through the preserved
-- reviewed implementation without projection changes.

create or replace function public.finalize_ranked_async_matchmaking_game_v2(
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
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_app_rating_bucket text;
  v_public_projection jsonb := p_game_projection;
  v_reservation brrrdle_private.ranked_daily_pair_reservations%rowtype;
begin
  select * into v_reservation
  from brrrdle_private.ranked_daily_pair_reservations reservation
  where reservation.game_id = p_matched_game_id
  for update;

  if found then
    if v_user_id is null then
      raise exception 'Authentication required.' using errcode = '28000';
    end if;
    if v_user_id not in (
      v_reservation.player_one_user_id,
      v_reservation.player_two_user_id
    ) then
      raise exception 'Only ranked Daily participants can finalize the match.' using errcode = '42501';
    end if;

    v_app_rating_bucket := public.phase55_ranked_app_bucket(v_reservation.rating_bucket);
    if v_app_rating_bucket is null then
      raise exception 'Ranked Daily reservation has an invalid rating bucket.' using errcode = '22023';
    end if;

    -- Unknown caller projection fields are intentionally discarded. Every
    -- canonical field below is derived from locked server reservation data.
    v_public_projection := jsonb_build_object(
      'id', v_reservation.game_id,
      'mode', v_reservation.mode,
      'scope', 'daily',
      'dailyDateKey', v_reservation.daily_date_key,
      'ranked', true,
      'ratingBucket', v_app_rating_bucket,
      'wordLength', 5,
      'difficulty', 'expert',
      'hardMode', v_reservation.hard_mode,
      'timeLimitMs', null,
      'customGameCode', null,
      'goPuzzleCount', case when v_reservation.mode = 'go' then 5 else null end,
      'playerUserIds', jsonb_build_object(
        'player-one', v_reservation.player_one_user_id,
        'player-two', v_reservation.player_two_user_id
      ),
      'moves', jsonb_build_array()
    );
  end if;

  return query
  select *
  from brrrdle_private.phase55_initial_finalize_ranked_async_matchmaking_game_v2(
    p_request_id,
    p_matched_game_id,
    v_public_projection,
    p_idempotency_key
  );
end;
$$;

revoke all on function public.finalize_ranked_async_matchmaking_game_v2(
  text, text, jsonb, text
) from public, anon, authenticated;
grant execute on function public.finalize_ranked_async_matchmaking_game_v2(
  text, text, jsonb, text
) to authenticated;

comment on function public.finalize_ranked_async_matchmaking_game_v2(
  text, text, jsonb, text
) is 'Finalizes ranked async games; ranked Daily canonical evidence is built exclusively from the locked private pair reservation.';

-- Rollback notes:
-- - Restore the 20260710180608 wrapper only if caller-derived allowlisted
--   evidence is explicitly re-approved.
-- - Do not expose the preserved private implementation to browser roles.

-- Remote probes:
-- - prove ranked Practice projection behavior remains unchanged;
-- - prove Daily canonical fields equal the reservation even when caller fields
--   are stale, malformed, or contain unknown nested private/token-like keys;
-- - prove nonparticipants and anonymous callers cannot finalize;
-- - prove the durable public projection remains answerless and parseable.
