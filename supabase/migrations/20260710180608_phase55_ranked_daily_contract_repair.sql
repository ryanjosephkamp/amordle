-- Phase 55 ranked Daily contract repair.
--
-- This additive migration preserves the already-applied Phase 55 migration
-- and corrects only the ranked Daily queue, finalization, final-GO-puzzle,
-- and service-role cleanup contracts identified by post-apply verification.

do $$
begin
  if to_regprocedure('public.create_ranked_async_matchmaking_request_v2(text,integer,boolean,text,text,text,integer,timestamp with time zone)') is null
    or to_regprocedure('public.finalize_ranked_async_matchmaking_game_v2(text,text,jsonb,text)') is null
    or to_regprocedure('public.save_ranked_daily_async_multiplayer_action(text,integer,integer,text,text,boolean)') is null
  then
    raise exception 'Phase 55 ranked Daily base functions are missing.';
  end if;
end $$;

-- Preserve the reviewed base implementations behind unexposed private names.
-- The new public wrappers below retain Practice behavior and narrow only the
-- ranked Daily inputs that require correction.
alter function public.create_ranked_async_matchmaking_request_v2(
  text, integer, boolean, text, text, text, integer, timestamptz
) set schema brrrdle_private;
alter function brrrdle_private.create_ranked_async_matchmaking_request_v2(
  text, integer, boolean, text, text, text, integer, timestamptz
) rename to phase55_initial_create_ranked_async_matchmaking_request_v2;

alter function public.finalize_ranked_async_matchmaking_game_v2(
  text, text, jsonb, text
) set schema brrrdle_private;
alter function brrrdle_private.finalize_ranked_async_matchmaking_game_v2(
  text, text, jsonb, text
) rename to phase55_initial_finalize_ranked_async_matchmaking_game_v2;

revoke all on function brrrdle_private.phase55_initial_create_ranked_async_matchmaking_request_v2(
  text, integer, boolean, text, text, text, integer, timestamptz
) from public, anon, authenticated;
revoke all on function brrrdle_private.phase55_initial_finalize_ranked_async_matchmaking_game_v2(
  text, text, jsonb, text
) from public, anon, authenticated;

create or replace function public.create_ranked_async_matchmaking_request_v2(
  p_mode text,
  p_word_length integer,
  p_hard_mode boolean default false,
  p_idempotency_key text default null,
  p_scope text default 'practice',
  p_daily_date_key text default null,
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
  mode text,
  scope text,
  daily_date_key text,
  queued_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_base_idempotency_key text;
  v_existing_status text;
  v_insert_idempotency_key text := nullif(p_idempotency_key, '');
begin
  if lower(coalesce(p_scope, 'practice')) = 'daily' then
    v_base_idempotency_key := coalesce(
      nullif(p_idempotency_key, ''),
      'phase55-ranked-daily-v1:queue:'
        || coalesce(v_user_id::text, '') || ':'
        || coalesce(p_daily_date_key, '') || ':'
        || lower(coalesce(p_mode, '')) || ':'
        || coalesce(p_hard_mode, false)::text
    );

    select queue_row.status
    into v_existing_status
    from public.multiplayer_matchmaking_queue queue_row
    where queue_row.idempotency_key = v_base_idempotency_key
      and queue_row.user_id = v_user_id;

    if v_existing_status in ('cancelled', 'expired') then
      -- A terminal request can remain in immutable pair history. A new queue
      -- attempt therefore receives a fresh id instead of reactivating it.
      v_insert_idempotency_key := v_base_idempotency_key
        || ':attempt:' || extensions.gen_random_uuid()::text;
    else
      v_insert_idempotency_key := v_base_idempotency_key;
    end if;
  end if;

  -- The delegated implementation preserves strict FIFO via
  -- order by candidate.queued_at, candidate.id and for update skip locked.
  return query
  select *
  from brrrdle_private.phase55_initial_create_ranked_async_matchmaking_request_v2(
    p_mode,
    p_word_length,
    p_hard_mode,
    v_insert_idempotency_key,
    p_scope,
    p_daily_date_key,
    p_time_limit_ms,
    p_expires_at
  );
end;
$$;

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
  v_public_projection jsonb := p_game_projection;
begin
  if lower(coalesce(p_game_projection ->> 'scope', '')) = 'daily' then
    -- Unknown caller projection fields are intentionally discarded. The
    -- private base function validates this explicit safe-field projection and
    -- adds server-owned lifecycle fields before persistence.
    v_public_projection := jsonb_build_object(
      'id', p_game_projection ->> 'id',
      'mode', lower(coalesce(p_game_projection ->> 'mode', '')),
      'scope', 'daily',
      'dailyDateKey', p_game_projection ->> 'dailyDateKey',
      'ranked', true,
      'ratingBucket', p_game_projection ->> 'ratingBucket',
      'wordLength', 5,
      'difficulty', 'expert',
      'hardMode', coalesce((p_game_projection ->> 'hardMode')::boolean, false),
      'timeLimitMs', null,
      'customGameCode', null,
      'goPuzzleCount', case
        when lower(coalesce(p_game_projection ->> 'mode', '')) = 'go' then 5
        else null
      end,
      'playerUserIds', jsonb_build_object(
        'player-one', p_game_projection #>> '{playerUserIds,player-one}',
        'player-two', p_game_projection #>> '{playerUserIds,player-two}'
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

create or replace function public.save_ranked_daily_async_multiplayer_action(
  p_game_id text,
  p_expected_version integer,
  p_expected_move_count integer,
  p_action_id text,
  p_guess text default null,
  p_forfeit boolean default false
)
returns table (game_projection jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_game public.async_multiplayer_games%rowtype;
  authority_row brrrdle_private.ranked_daily_game_authority%rowtype;
  v_reservation brrrdle_private.ranked_daily_pair_reservations%rowtype;
  v_existing_action brrrdle_private.ranked_daily_action_ledger%rowtype;
  v_action_type text;
  v_answer text;
  v_attempt_limit integer;
  v_created_at timestamptz := now();
  v_evidence jsonb;
  v_expected_tiles jsonb;
  v_final_go_puzzle boolean;
  v_forfeited_player_id text;
  v_guess text := lower(nullif(btrim(p_guess), ''));
  v_ledger_moves jsonb;
  v_left_points integer;
  v_next_move_count integer;
  v_next_puzzle_index integer;
  v_next_turn text;
  v_next_version integer;
  v_other_attempts integer;
  v_other_player_id text;
  v_player_attempts integer;
  v_player_id text;
  v_projection_status text;
  v_right_points integer;
  v_solved boolean := false;
  v_terminal_status text := 'playing';
  v_updated_projection jsonb;
  v_winner_player_id text;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;
  if nullif(p_game_id, '') is null
    or nullif(p_action_id, '') is null
    or length(p_action_id) > 200
    or p_expected_version is null
    or p_expected_move_count is null
    or ((v_guess is null) = (coalesce(p_forfeit, false) is false))
  then
    raise exception 'Ranked Daily action evidence is invalid.' using errcode = '22023';
  end if;

  select * into v_reservation
  from brrrdle_private.ranked_daily_pair_reservations reservation
  where reservation.game_id = p_game_id
  for update;
  select * into authority_row
  from brrrdle_private.ranked_daily_game_authority authority
  where authority.game_id = p_game_id
  for update;
  select * into v_game
  from public.async_multiplayer_games game_row
  where game_row.id = p_game_id
  for update;

  if v_reservation.game_id is null or authority_row.game_id is null or v_game.id is null then
    raise exception 'Ranked Daily authority was not found.' using errcode = 'P0002';
  end if;
  if v_user_id = authority_row.player_one_user_id then
    v_player_id := 'player-one';
    v_other_player_id := 'player-two';
  elsif v_user_id = authority_row.player_two_user_id then
    v_player_id := 'player-two';
    v_other_player_id := 'player-one';
  else
    raise exception 'Only ranked Daily participants can submit actions.' using errcode = '42501';
  end if;

  select * into v_existing_action
  from brrrdle_private.ranked_daily_action_ledger action
  where action.game_id = p_game_id and action.action_id = p_action_id;
  if found then
    if v_existing_action.player_user_id <> v_user_id
      or (v_existing_action.action_type = 'guess') is distinct from (v_guess is not null)
      or v_existing_action.guess is distinct from v_guess
    then
      raise exception 'Ranked Daily action id belongs to different evidence.' using errcode = '23505';
    end if;
    return query select v_game.projection;
    return;
  end if;

  if authority_row.terminal_status <> 'playing' then
    raise exception 'Ranked Daily game is already terminal.' using errcode = '22023';
  end if;
  if authority_row.version <> p_expected_version
    or authority_row.move_count <> p_expected_move_count
  then
    raise exception 'Ranked Daily action has stale expected_version or move count.' using errcode = '40001';
  end if;
  if v_game.ranked is distinct from true
    or v_game.scope <> 'daily'
    or v_game.daily_date_key is distinct from authority_row.daily_date_key
    or v_game.mode is distinct from authority_row.mode
    or v_game.player_one_user_id is distinct from authority_row.player_one_user_id
    or v_game.player_two_user_id is distinct from authority_row.player_two_user_id
    or v_game.rating_bucket is distinct from public.phase55_ranked_storage_bucket('daily', authority_row.mode, null)
    or v_game.word_length <> 5
    or v_game.difficulty <> 'expert'
    or v_game.custom_game_code is not null
    or v_game.deadline_at is distinct from ((authority_row.daily_date_key::date + 1)::timestamp at time zone 'UTC')
  then
    raise exception 'Ranked Daily public projection does not match server authority.' using errcode = '22023';
  end if;
  if v_created_at >= ((authority_row.daily_date_key::date + 1)::timestamp at time zone 'UTC') then
    raise exception 'Ranked Daily game has expired.' using errcode = '22023';
  end if;

  v_next_version := authority_row.version + 1;
  v_next_move_count := authority_row.move_count;
  v_next_turn := authority_row.current_turn;
  v_next_puzzle_index := authority_row.current_puzzle_index;
  v_final_go_puzzle := authority_row.mode = 'go'
    and authority_row.current_puzzle_index = 4;

  if coalesce(p_forfeit, false) then
    v_action_type := case when authority_row.move_count = 0 then 'cancel' else 'forfeit' end;
    v_terminal_status := case when v_action_type = 'cancel' then 'cancelled' else 'completed' end;
    v_projection_status := case when v_action_type = 'cancel' then 'cancelled' else 'lost' end;
    if v_action_type = 'forfeit' then
      v_forfeited_player_id := v_player_id;
      v_winner_player_id := v_other_player_id;
    end if;

    insert into brrrdle_private.ranked_daily_action_ledger (
      game_id,
      sequence_no,
      action_id,
      action_type,
      player_user_id,
      player_id,
      created_at
    ) values (
      p_game_id,
      v_next_version,
      p_action_id,
      v_action_type,
      v_user_id,
      v_player_id,
      v_created_at
    );
  else
    if v_player_id <> authority_row.current_turn then
      raise exception 'It is not this ranked Daily participant''s turn.' using errcode = '22023';
    end if;
    if v_guess !~ '^[a-z]{5}$'
      or not exists (
        select 1 from brrrdle_private.ranked_daily_word_catalog catalog
        where catalog.kind = 'valid_guess' and catalog.word = v_guess
      )
    then
      raise exception 'Ranked Daily guess is not in the canonical dictionary.' using errcode = '22023';
    end if;

    v_answer := authority_row.answers[authority_row.current_puzzle_index + 1];
    v_expected_tiles := brrrdle_private.phase55_ranked_daily_tiles(v_guess, v_answer);
    v_evidence := brrrdle_private.phase55_ranked_daily_hard_mode_evidence(
      p_game_id,
      authority_row.current_puzzle_index,
      authority_row.answers
    );
    if authority_row.hard_mode
      and not brrrdle_private.phase55_ranked_daily_hard_mode_guess_is_valid(
        v_evidence,
        authority_row.current_puzzle_index,
        v_guess
      )
    then
      raise exception 'Ranked Daily guess violates Hard Mode.' using errcode = '22023';
    end if;

    v_attempt_limit := case when authority_row.mode = 'go'
      then 6 - authority_row.current_puzzle_index
      else 6
    end;
    select count(*)::integer into v_player_attempts
    from brrrdle_private.ranked_daily_action_ledger action
    where action.game_id = p_game_id
      and action.action_type = 'guess'
      and action.player_id = v_player_id
      and action.puzzle_index = authority_row.current_puzzle_index;
    if not v_final_go_puzzle and v_player_attempts >= v_attempt_limit then
      raise exception 'Ranked Daily participant has no attempts remaining.' using errcode = '22023';
    end if;

    v_solved := v_guess = v_answer;
    insert into brrrdle_private.ranked_daily_action_ledger (
      game_id,
      sequence_no,
      action_id,
      action_type,
      player_user_id,
      player_id,
      puzzle_index,
      guess,
      tiles,
      created_at
    ) values (
      p_game_id,
      v_next_version,
      p_action_id,
      'guess',
      v_user_id,
      v_player_id,
      authority_row.current_puzzle_index,
      v_guess,
      v_expected_tiles,
      v_created_at
    );
    v_next_move_count := authority_row.move_count + 1;
    v_player_attempts := v_player_attempts + 1;
    select count(*)::integer into v_other_attempts
    from brrrdle_private.ranked_daily_action_ledger action
    where action.game_id = p_game_id
      and action.action_type = 'guess'
      and action.player_id = v_other_player_id
      and action.puzzle_index = authority_row.current_puzzle_index;

    if authority_row.mode = 'og' and v_solved then
      v_terminal_status := 'completed';
      v_projection_status := 'won';
      v_winner_player_id := v_player_id;
    elsif authority_row.mode = 'go'
      and v_solved
      and authority_row.current_puzzle_index = 4
    then
      v_terminal_status := 'completed';
      v_projection_status := 'won';
    elsif authority_row.mode = 'go' and v_solved then
      v_next_puzzle_index := authority_row.current_puzzle_index + 1;
      v_next_turn := v_other_player_id;
      v_projection_status := 'playing';
    elsif not v_final_go_puzzle
      and v_player_attempts >= v_attempt_limit
      and v_other_attempts >= v_attempt_limit
    then
      v_terminal_status := 'completed';
      v_projection_status := case when authority_row.mode = 'og' then 'lost' else 'won' end;
    elsif not v_final_go_puzzle and v_player_attempts >= v_attempt_limit then
      v_next_turn := v_other_player_id;
      v_projection_status := 'playing';
    elsif not v_final_go_puzzle and v_other_attempts >= v_attempt_limit then
      v_next_turn := v_player_id;
      v_projection_status := 'playing';
    else
      v_next_turn := v_other_player_id;
      v_projection_status := 'playing';
    end if;

    if v_terminal_status = 'completed' and v_winner_player_id is null then
      v_ledger_moves := brrrdle_private.phase55_ranked_daily_ledger_moves(p_game_id);
      v_left_points := public.phase55_ranked_daily_player_points(
        v_ledger_moves,
        'player-one',
        authority_row.hard_mode
      );
      v_right_points := public.phase55_ranked_daily_player_points(
        v_ledger_moves,
        'player-two',
        authority_row.hard_mode
      );
      v_winner_player_id := case
        when v_left_points > v_right_points then 'player-one'
        when v_right_points > v_left_points then 'player-two'
        else null
      end;
    end if;
  end if;

  v_ledger_moves := brrrdle_private.phase55_ranked_daily_ledger_moves(p_game_id);
  v_updated_projection := v_game.projection
    - 'winnerId'
    - 'forfeitedPlayerId'
    - 'timedOutPlayerId'
    - 'endedAt';
  v_updated_projection := v_updated_projection
    || jsonb_build_object(
      'moves', v_ledger_moves,
      'status', v_projection_status,
      'currentTurn', v_next_turn,
      'updatedAt', v_created_at,
      'authorityVersion', v_next_version
    );
  if v_terminal_status <> 'playing' then
    v_updated_projection := v_updated_projection
      || jsonb_build_object('endedAt', v_created_at);
  end if;
  if v_winner_player_id is not null then
    v_updated_projection := v_updated_projection
      || jsonb_build_object('winnerId', v_winner_player_id);
  end if;
  if v_forfeited_player_id is not null then
    v_updated_projection := v_updated_projection
      || jsonb_build_object('forfeitedPlayerId', v_forfeited_player_id);
  end if;

  update brrrdle_private.ranked_daily_game_authority authority
  set
    current_turn = v_next_turn,
    current_puzzle_index = v_next_puzzle_index,
    version = v_next_version,
    move_count = v_next_move_count,
    terminal_status = v_terminal_status,
    winner_player_id = v_winner_player_id,
    forfeited_player_id = v_forfeited_player_id,
    ended_at = case when v_terminal_status <> 'playing' then v_created_at else null end,
    updated_at = v_created_at
  where authority.game_id = p_game_id;

  update public.async_multiplayer_games game_row
  set
    status = v_projection_status,
    current_turn = v_next_turn,
    winner_player_id = v_winner_player_id,
    ended_at = case when v_terminal_status <> 'playing' then v_created_at else null end,
    projection = v_updated_projection,
    updated_at = v_created_at
  where game_row.id = p_game_id;

  if v_action_type = 'cancel' then
    update public.multiplayer_matchmaking_queue queue_row
    set status = 'cancelled'
    where queue_row.id in (v_reservation.request_one_id, v_reservation.request_two_id)
      and queue_row.status = 'matched';
    perform public.release_daily_multiplayer_claim(
      authority_row.player_one_user_id::text,
      'async',
      authority_row.mode,
      authority_row.daily_date_key,
      'async_game',
      p_game_id,
      true
    );
    perform public.release_daily_multiplayer_claim(
      authority_row.player_two_user_id::text,
      'async',
      authority_row.mode,
      authority_row.daily_date_key,
      'async_game',
      p_game_id,
      true
    );
  end if;

  return query select v_updated_projection;
end;
$$;

-- Administrative cleanup is intentionally service-role-only. It removes the
-- private dependency chain before the existing E2E cleanup removes public
-- games, queues, claims, ratings, and Auth users.
create or replace function public.cleanup_ranked_daily_multiplayer_for_users(
  p_user_ids uuid[]
)
returns table (
  action_rows_deleted integer,
  authority_rows_deleted integer,
  reservation_rows_deleted integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action_rows_deleted integer := 0;
  v_authority_rows_deleted integer := 0;
  v_game_ids text[] := array[]::text[];
  v_reservation_rows_deleted integer := 0;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  if p_user_ids is null or cardinality(p_user_ids) = 0 then
    return query select 0, 0, 0;
    return;
  end if;

  select coalesce(array_agg(authority.game_id), array[]::text[])
  into v_game_ids
  from brrrdle_private.ranked_daily_game_authority authority
  where authority.player_one_user_id = any(p_user_ids)
    or authority.player_two_user_id = any(p_user_ids);

  if cardinality(v_game_ids) = 0 then
    return query select 0, 0, 0;
    return;
  end if;

  delete from brrrdle_private.ranked_daily_action_ledger action
  where action.game_id = any(v_game_ids);
  get diagnostics v_action_rows_deleted = row_count;

  delete from brrrdle_private.ranked_daily_game_authority authority
  where authority.game_id = any(v_game_ids);
  get diagnostics v_authority_rows_deleted = row_count;

  delete from brrrdle_private.ranked_daily_pair_reservations reservation
  where reservation.game_id = any(v_game_ids);
  get diagnostics v_reservation_rows_deleted = row_count;

  return query select
    v_action_rows_deleted,
    v_authority_rows_deleted,
    v_reservation_rows_deleted;
end;
$$;

revoke all on function public.create_ranked_async_matchmaking_request_v2(
  text, integer, boolean, text, text, text, integer, timestamptz
) from public, anon, authenticated;
revoke all on function public.finalize_ranked_async_matchmaking_game_v2(
  text, text, jsonb, text
) from public, anon, authenticated;
revoke all on function public.save_ranked_daily_async_multiplayer_action(
  text, integer, integer, text, text, boolean
) from public, anon, authenticated;
revoke all on function public.cleanup_ranked_daily_multiplayer_for_users(uuid[])
  from public, anon, authenticated;

grant execute on function public.create_ranked_async_matchmaking_request_v2(
  text, integer, boolean, text, text, text, integer, timestamptz
) to authenticated;
grant execute on function public.finalize_ranked_async_matchmaking_game_v2(
  text, text, jsonb, text
) to authenticated;
grant execute on function public.save_ranked_daily_async_multiplayer_action(
  text, integer, integer, text, text, boolean
) to authenticated;
grant execute on function public.cleanup_ranked_daily_multiplayer_for_users(uuid[])
  to service_role;

comment on function public.create_ranked_async_matchmaking_request_v2(
  text, integer, boolean, text, text, text, integer, timestamptz
) is 'Creates ranked async queue requests; ranked Daily terminal retries receive fresh immutable request ids.';
comment on function public.finalize_ranked_async_matchmaking_game_v2(
  text, text, jsonb, text
) is 'Finalizes ranked async games; ranked Daily caller projections are rebuilt from an explicit safe-field allowlist.';
comment on function public.save_ranked_daily_async_multiplayer_action(
  text, integer, integer, text, text, boolean
) is 'Applies narrow server-authoritative ranked Daily actions and keeps the final GO puzzle active until solved.';
comment on function public.cleanup_ranked_daily_multiplayer_for_users(uuid[])
  is 'Service-role-only administrative cleanup for ranked Daily private authority rows associated with supplied users.';

-- Rollback notes:
-- 1. Restore the public base queue/finalization function names from the two
--    brrrdle_private.phase55_initial_* functions before dropping wrappers.
-- 2. Restore the prior save_ranked_daily_async_multiplayer_action definition
--    from migration 20260710061039.
-- 3. Drop cleanup_ranked_daily_multiplayer_for_users after private rows are
--    confirmed absent for any in-flight administrative cleanup.
-- 4. Never delete or rewrite migration 20260710061039.

-- Remote probes after exact application must verify:
-- - only the four public functions above have the intended browser/service
--   grants and every security-definer function has an empty search_path;
-- - the two preserved initial implementations are in brrrdle_private and are
--   not executable by public, anon, or authenticated;
-- - ranked Daily terminal requeue produces a fresh request id while active
--   retries remain idempotent and FIFO;
-- - final GO puzzle wrong guesses continue alternating after normal budgets;
-- - unknown top-level and nested caller projection fields are absent from the
--   durable public projection;
-- - cleanup is denied to anon/authenticated, succeeds for service_role, is
--   idempotent, and leaves no private dependency rows.
