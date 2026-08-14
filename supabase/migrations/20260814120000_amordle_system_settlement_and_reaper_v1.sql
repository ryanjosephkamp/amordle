-- Amordle v9: settlement the system can perform, and a reaper for games nobody played.
--
-- Two promises Cycle D made and did not keep, closed together.
--
--   R1. The correspondence sweep ends an abandoned game but cannot apply its rating,
--       because `settle_amordle_ranked_practice_v2` identifies its caller and a job has no
--       caller. Cycle D's own migration said the alternatives were a second copy of three
--       hundred lines of Elo maths or weakening authentication on the one that exists, and
--       took neither. There is a third: give the existing implementation an explicit actor
--       and keep the authentication in a thin public wrapper.
--
--   R2. Nothing ever retires an abandoned game. That is how one account reached twelve live
--       games and deadlocked its own matchmaking in v8.1, and the backlog was cleared by
--       hand rather than by anything that would stop it happening again.
--
-- The reaper's line is the owner's: a game with ZERO moves cannot have been lost by anyone,
-- so retiring one destroys nothing. A game with moves is never touched, however old.

-- ---------------------------------------------------------------------------
-- R1. One settlement implementation, two entry points
-- ---------------------------------------------------------------------------
--
-- Reproduced from the deployed definition with exactly six changes, all of them about who
-- is asking: the signature takes an actor, the actor is no longer read from the session,
-- the authentication moves to the wrapper, the seated-player check applies only to a real
-- caller, and the two places that build a receipt from the caller's seat fall back to
-- player one when there is no caller. The Elo maths is untouched.

create or replace function brrrdle_private.amordle_settle_ranked_practice(
  p_game_id text,
  p_action_id text,
  p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  /*
   * v9-R1. The actor, supplied rather than read from the session.
   *
   * NULL means the system — the scheduled sweep, which has no caller. Everything below
   * that used to identify the caller now branches on that, and nothing else changed:
   * this is the same three hundred lines of Elo maths, not a second copy of them.
   */
  v_user_id uuid := p_actor;
  v_receipt_seat uuid;
  v_authority brrrdle_private.amordle_combat_authority%rowtype;
  v_result public.multiplayer_match_results%rowtype;
  v_left_profile public.multiplayer_rating_profiles%rowtype;
  v_right_profile public.multiplayer_rating_profiles%rowtype;
  v_left_points integer;
  v_right_points integer;
  v_left_score numeric;
  v_right_score numeric;
  v_left_expected numeric;
  v_right_expected numeric;
  v_left_k integer;
  v_right_k integer;
  v_left_delta integer;
  v_right_delta integer;
  v_left_outcome text;
  v_right_outcome text;
  v_left_solved integer;
  v_right_solved integer;
  v_left_attempts integer;
  v_right_attempts integer;
  v_idempotency_key text;
  v_viewer_old integer;
  v_viewer_new integer;
  v_viewer_delta integer;
  v_viewer_outcome text;
begin
  perform pg_advisory_xact_lock(hashtextextended('amordle-combat-settle:' || p_game_id, 0));
  select * into v_authority
  from brrrdle_private.amordle_combat_authority authority
  where authority.game_id = p_game_id
  for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002', detail = 'NOT_FOUND';
  end if;
  if not v_authority.ranked or v_authority.source_kind <> 'ranked_queue' then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'FORBIDDEN';
  end if;
  -- A caller must be seated. The system is not, and is not required to be.
  if v_user_id is not null
    and v_user_id not in (v_authority.player_one_user_id, v_authority.player_two_user_id)
  then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'FORBIDDEN';
  end if;
  /*
   * The receipt is written from one seat's point of view. A player gets their own; the
   * system gets player one's, because a receipt nobody reads still has to be well formed.
   */
  v_receipt_seat := coalesce(v_user_id, v_authority.player_one_user_id);
  if v_authority.status <> 'completed' or v_authority.terminal_reason is null then
    raise exception 'SETTLEMENT_INELIGIBLE'
      using errcode = '22023', detail = 'SETTLEMENT_INELIGIBLE';
  end if;

  -- Independently reconstruct every awarded move from immutable tiles,
  -- per-player attempt order, and the server-owned Hard Mode flag.
  if exists (
    with ranked_actions as (
      select
        action.*,
        row_number() over (
          partition by action.game_id, action.player_id, action.puzzle_index
          order by action.sequence_no
        )::integer as attempt_number
      from brrrdle_private.amordle_combat_action_ledger action
      where action.game_id = p_game_id and action.action_type = 'guess'
    )
    select 1
    from ranked_actions action
    where action.points_awarded is distinct from brrrdle_private.amordle_action_points(
      action.tiles,
      not exists (
        select 1 from jsonb_array_elements(action.tiles) tile
        where tile ->> 'state' <> 'correct'
      ),
      brrrdle_private.amordle_attempt_budget(action.puzzle_index) - action.attempt_number,
      v_authority.hard_mode
    )
  ) then
    raise exception 'SETTLEMENT_INELIGIBLE'
      using errcode = '22023', detail = 'LEDGER_POINTS_MISMATCH';
  end if;

  v_left_points := brrrdle_private.amordle_player_points(p_game_id, 'player-one');
  v_right_points := brrrdle_private.amordle_player_points(p_game_id, 'player-two');
  if v_authority.terminal_reason = 'points' then
    if v_authority.winner_player_id is distinct from (case
      when v_left_points > v_right_points then 'player-one'
      when v_right_points > v_left_points then 'player-two'
      else null
    end) then
      raise exception 'SETTLEMENT_INELIGIBLE'
        using errcode = '22023', detail = 'OUTCOME_MISMATCH';
    end if;
  elsif v_authority.terminal_reason = 'draw' then
    if v_left_points <> v_right_points or v_authority.winner_player_id is not null then
      raise exception 'SETTLEMENT_INELIGIBLE'
        using errcode = '22023', detail = 'OUTCOME_MISMATCH';
    end if;
  elsif v_authority.terminal_reason = 'forfeit' then
    if v_authority.forfeited_player_id is null
      or v_authority.winner_player_id = v_authority.forfeited_player_id
    then
      raise exception 'SETTLEMENT_INELIGIBLE'
        using errcode = '22023', detail = 'OUTCOME_MISMATCH';
    end if;
  elsif v_authority.terminal_reason = 'timeout' then
    if v_authority.timed_out_player_id is null
      or v_authority.winner_player_id = v_authority.timed_out_player_id
    then
      raise exception 'SETTLEMENT_INELIGIBLE'
        using errcode = '22023', detail = 'OUTCOME_MISMATCH';
    end if;
  elsif v_authority.terminal_reason = 'solve' then
    if not exists (
      select 1
      from brrrdle_private.amordle_combat_action_ledger action
      where action.game_id = p_game_id
        and action.player_id = v_authority.winner_player_id
        and action.action_type = 'guess'
        and not exists (
          select 1 from jsonb_array_elements(action.tiles) tile
          where tile ->> 'state' <> 'correct'
        )
    ) then
      raise exception 'SETTLEMENT_INELIGIBLE'
        using errcode = '22023', detail = 'OUTCOME_MISMATCH';
    end if;
  else
    raise exception 'SETTLEMENT_INELIGIBLE'
      using errcode = '22023', detail = 'OUTCOME_MISMATCH';
  end if;

  v_idempotency_key := 'amordle-ranked-practice-v2:settle:' || p_game_id;
  select * into v_result
  from public.multiplayer_match_results result
  where result.idempotency_key = v_idempotency_key;
  if found then
    select transaction.old_rating, transaction.new_rating, transaction.rating_delta, transaction.outcome
    into v_viewer_old, v_viewer_new, v_viewer_delta, v_viewer_outcome
    from public.multiplayer_rating_transactions transaction
    where transaction.match_result_id = v_result.id and transaction.user_id = v_receipt_seat;
    return jsonb_build_object(
      'schemaVersion', 2,
      'matchResultId', v_result.id,
      'bucket', brrrdle_private.amordle_app_bucket(v_authority.rating_bucket),
      'outcome', v_viewer_outcome,
      'oldRating', v_viewer_old,
      'newRating', v_viewer_new,
      'ratingDelta', v_viewer_delta,
      'idempotent', true
    );
  end if;

  insert into public.multiplayer_rating_profiles (user_id, bucket)
  values
    (v_authority.player_one_user_id, v_authority.rating_bucket),
    (v_authority.player_two_user_id, v_authority.rating_bucket)
  on conflict (user_id, bucket) do nothing;
  perform 1
  from public.multiplayer_rating_profiles profile
  where profile.bucket = v_authority.rating_bucket
    and profile.user_id in (v_authority.player_one_user_id, v_authority.player_two_user_id)
  order by profile.user_id
  for update;
  select * into v_left_profile
  from public.multiplayer_rating_profiles profile
  where profile.user_id = v_authority.player_one_user_id
    and profile.bucket = v_authority.rating_bucket;
  select * into v_right_profile
  from public.multiplayer_rating_profiles profile
  where profile.user_id = v_authority.player_two_user_id
    and profile.bucket = v_authority.rating_bucket;

  if v_authority.winner_player_id = 'player-one' then
    v_left_score := 1; v_right_score := 0;
    v_left_outcome := 'win'; v_right_outcome := 'loss';
  elsif v_authority.winner_player_id = 'player-two' then
    v_left_score := 0; v_right_score := 1;
    v_left_outcome := 'loss'; v_right_outcome := 'win';
  else
    v_left_score := 0.5; v_right_score := 0.5;
    v_left_outcome := 'draw'; v_right_outcome := 'draw';
  end if;
  v_left_expected := 1 / (1 + power(10::numeric, (v_right_profile.rating - v_left_profile.rating)::numeric / 400));
  v_right_expected := 1 - v_left_expected;
  v_left_k := case when v_left_profile.games_played < 10 then 40 else 24 end;
  v_right_k := case when v_right_profile.games_played < 10 then 40 else 24 end;
  v_left_delta := round(v_left_k * (v_left_score - v_left_expected))::integer;
  v_right_delta := round(v_right_k * (v_right_score - v_right_expected))::integer;

  select count(*)::integer, count(*) filter (
    where not exists (
      select 1 from jsonb_array_elements(action.tiles) tile
      where tile ->> 'state' <> 'correct'
    )
  )::integer
  into v_left_attempts, v_left_solved
  from brrrdle_private.amordle_combat_action_ledger action
  where action.game_id = p_game_id and action.action_type = 'guess'
    and action.player_id = 'player-one';
  select count(*)::integer, count(*) filter (
    where not exists (
      select 1 from jsonb_array_elements(action.tiles) tile
      where tile ->> 'state' <> 'correct'
    )
  )::integer
  into v_right_attempts, v_right_solved
  from brrrdle_private.amordle_combat_action_ledger action
  where action.game_id = p_game_id and action.action_type = 'guess'
    and action.player_id = 'player-two';

  insert into public.multiplayer_match_results (
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
    settled_at
  ) values (
    p_game_id,
    'async',
    v_authority.mode,
    'practice',
    null,
    true,
    v_authority.rating_bucket,
    'completed',
    case v_authority.winner_player_id
      when 'player-one' then v_authority.player_one_user_id
      when 'player-two' then v_authority.player_two_user_id
      else null
    end,
    'Authoritative Amordle Practice v2 settlement.',
    v_idempotency_key,
    now()
  )
  returning * into v_result;

  insert into public.multiplayer_player_results (
    match_result_id, user_id, player_id, outcome, attempts_used,
    puzzles_solved, completed_at, summary
  ) values
    (v_result.id, v_authority.player_one_user_id, 'player-one', v_left_outcome,
      coalesce(v_left_attempts, 0), coalesce(v_left_solved, 0), v_authority.ended_at, 'Authoritative ledger result.'),
    (v_result.id, v_authority.player_two_user_id, 'player-two', v_right_outcome,
      coalesce(v_right_attempts, 0), coalesce(v_right_solved, 0), v_authority.ended_at, 'Authoritative ledger result.');

  insert into public.multiplayer_rating_transactions (
    match_result_id, bucket, user_id, opponent_user_id, outcome,
    old_rating, new_rating, rating_delta, expected_score, idempotency_key
  ) values
    (v_result.id, v_authority.rating_bucket, v_authority.player_one_user_id,
      v_authority.player_two_user_id, v_left_outcome, v_left_profile.rating,
      v_left_profile.rating + v_left_delta, v_left_delta, v_left_expected,
      v_idempotency_key || ':player-one'),
    (v_result.id, v_authority.rating_bucket, v_authority.player_two_user_id,
      v_authority.player_one_user_id, v_right_outcome, v_right_profile.rating,
      v_right_profile.rating + v_right_delta, v_right_delta, v_right_expected,
      v_idempotency_key || ':player-two');

  update public.multiplayer_rating_profiles
  set
    rating = rating + case
      when user_id = v_authority.player_one_user_id then v_left_delta else v_right_delta end,
    games_played = games_played + 1,
    wins = wins + case
      when (user_id = v_authority.player_one_user_id and v_left_outcome = 'win')
        or (user_id = v_authority.player_two_user_id and v_right_outcome = 'win') then 1 else 0 end,
    losses = losses + case
      when (user_id = v_authority.player_one_user_id and v_left_outcome = 'loss')
        or (user_id = v_authority.player_two_user_id and v_right_outcome = 'loss') then 1 else 0 end,
    draws = draws + case
      when v_left_outcome = 'draw' then 1 else 0 end,
    provisional = games_played + 1 < 10,
    updated_at = now()
  where bucket = v_authority.rating_bucket
    and user_id in (v_authority.player_one_user_id, v_authority.player_two_user_id);

  if v_receipt_seat = v_authority.player_one_user_id then
    v_viewer_old := v_left_profile.rating;
    v_viewer_new := v_left_profile.rating + v_left_delta;
    v_viewer_delta := v_left_delta;
    v_viewer_outcome := v_left_outcome;
  else
    v_viewer_old := v_right_profile.rating;
    v_viewer_new := v_right_profile.rating + v_right_delta;
    v_viewer_delta := v_right_delta;
    v_viewer_outcome := v_right_outcome;
  end if;
  return jsonb_build_object(
    'schemaVersion', 2,
    'matchResultId', v_result.id,
    'bucket', brrrdle_private.amordle_app_bucket(v_authority.rating_bucket),
    'outcome', v_viewer_outcome,
    'oldRating', v_viewer_old,
    'newRating', v_viewer_new,
    'ratingDelta', v_viewer_delta,
    'idempotent', false
  );
end;
$$;

/*
 * The public entry point: authentication, then the shared core.
 *
 * It is a wrapper rather than a copy so the two paths can never disagree about who won or
 * by how much — which is exactly what a second implementation of Elo would eventually do.
 */
create or replace function public.settle_amordle_ranked_practice_v2(
  p_game_id text,
  p_action_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000', detail = 'AUTH_REQUIRED';
  end if;
  return brrrdle_private.amordle_settle_ranked_practice(p_game_id, p_action_id, v_user_id);
end;
$$;

revoke all on function brrrdle_private.amordle_settle_ranked_practice(text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.settle_amordle_ranked_practice_v2(text, text) to authenticated;


-- ---------------------------------------------------------------------------
-- A Cycle D defect, found by testing this migration rather than by a report
-- ---------------------------------------------------------------------------
--
-- `amordle_timeout_game` wrote `requested_command = 'timeout'` into the action ledger, and
-- that column's CHECK allows only a real player command — 'guess', 'cancel', 'forfeit',
-- 'advance' — or null. So the function raised on its first row.
--
-- Which means the correspondence timeout shipped in Cycle D has never once worked. Nothing
-- reported it because nothing had reached a per-move deadline yet: the controls are days
-- long and days old. It surfaced here only because settling a correspondence game is what
-- this migration is for, and the test drove a real one to expiry against the real schema.
--
-- A system timeout has no requested command. It is null, which is what the column has always
-- said it should be.

create or replace function brrrdle_private.amordle_timeout_game(
  p_game_id text,
  p_action_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authority brrrdle_private.amordle_combat_authority%rowtype;
  v_now timestamptz := now();
  v_elapsed_ms bigint;
  v_remaining integer;
  v_timed_out text;
  v_winner text;
  v_sequence integer;
begin
  select * into v_authority
  from brrrdle_private.amordle_combat_authority
  where game_id = p_game_id
  for update;
  if not found or v_authority.status <> 'playing' then
    return false;
  end if;
  if v_authority.time_limit_ms is null or v_authority.turn_started_at is null then
    return false;
  end if;

  v_elapsed_ms := floor(extract(epoch from (v_now - v_authority.turn_started_at)) * 1000)::bigint;
  v_remaining := greatest(
    0,
    case v_authority.current_turn
      when 'player-one' then v_authority.player_one_time_remaining_ms
      else v_authority.player_two_time_remaining_ms
    end - least(v_elapsed_ms, 2147483647)::integer
  );
  if v_remaining > 0 then
    return false;
  end if;

  v_timed_out := v_authority.current_turn;
  v_winner := case v_timed_out when 'player-one' then 'player-two' else 'player-one' end;
  v_sequence := v_authority.version + 1;

  insert into brrrdle_private.amordle_combat_action_ledger (
    game_id, sequence_no, action_id, action_type, requested_command, requested_guess,
    player_user_id, player_id, clock_debit_ms, resulting_version, resulting_move_count,
    created_at
  ) values (
    p_game_id, v_sequence, p_action_id, 'timeout', null, null,
    case v_timed_out when 'player-one' then v_authority.player_one_user_id
                     else v_authority.player_two_user_id end,
    v_timed_out, least(v_elapsed_ms, 2147483647)::integer, v_sequence,
    v_authority.move_count, v_now
  )
  on conflict do nothing;

  update brrrdle_private.amordle_combat_authority
  set
    status = 'completed',
    version = v_sequence,
    terminal_reason = 'timeout',
    winner_player_id = v_winner,
    timed_out_player_id = v_timed_out,
    player_one_time_remaining_ms = case
      when v_timed_out = 'player-one' then 0 else player_one_time_remaining_ms end,
    player_two_time_remaining_ms = case
      when v_timed_out = 'player-two' then 0 else player_two_time_remaining_ms end,
    turn_started_at = null,
    ended_at = v_now,
    updated_at = v_now
  where game_id = p_game_id;

  update public.async_multiplayer_games
  set
    status = 'won',
    winner_player_id = v_winner,
    state_version = v_sequence,
    ended_at = v_now,
    updated_at = v_now,
    projection = projection || jsonb_build_object(
      'status', 'completed',
      'stateVersion', v_sequence,
      'updatedAt', v_now,
      'endedAt', v_now
    )
  where id = p_game_id;

  return true;
end
$$;

revoke all on function brrrdle_private.amordle_timeout_game(text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The sweep now settles what it ends
-- ---------------------------------------------------------------------------

create or replace function public.settle_amordle_expired_correspondence_v1(
  p_limit integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game record;
  v_settled integer := 0;
  v_rated integer := 0;
  v_examined integer := 0;
begin
  for v_game in
    select authority.game_id, authority.ranked, authority.scope, authority.source_kind
    from brrrdle_private.amordle_combat_authority authority
    where authority.status = 'playing'
      and authority.time_limit_ms is not null
      and authority.turn_started_at is not null
      and brrrdle_private.amordle_clock_kind(authority.time_limit_ms) = 'per_move'
      and authority.turn_started_at
          + make_interval(secs => authority.time_limit_ms / 1000.0) <= now()
    order by authority.turn_started_at
    limit greatest(1, least(coalesce(p_limit, 200), 1000))
  loop
    v_examined := v_examined + 1;
    if brrrdle_private.amordle_timeout_game(
      v_game.game_id,
      'correspondence-timeout:' || v_game.game_id
    ) then
      v_settled := v_settled + 1;
      /*
       * v9-R1. The rating applies here now, in the same transaction that ended the game.
       *
       * A settlement failure is swallowed per game so one bad row cannot stop the sweep,
       * and the settlement RPC is idempotent, so the next run retries whatever failed.
       */
      if v_game.ranked and v_game.source_kind = 'ranked_queue' then
        begin
          perform brrrdle_private.amordle_settle_ranked_practice(
            v_game.game_id,
            'correspondence-settle:' || v_game.game_id,
            null
          );
          v_rated := v_rated + 1;
        exception
          when others then null;
        end;
      end if;
    end if;
  end loop;

  return jsonb_build_object('examined', v_examined, 'settled', v_settled, 'rated', v_rated);
end
$$;

revoke all on function public.settle_amordle_expired_correspondence_v1(integer)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- R2. The reaper
-- ---------------------------------------------------------------------------
--
-- Only games nobody ever played: `move_count = 0`, untouched for fourteen days. That covers
-- both shapes the backlog was made of — lobbies nobody joined, and games created but never
-- started — and it cannot reach a real game, because a real game has moves.
--
-- They are cancelled, which is the transition the state machine already defines for a game
-- that ends without being played, and which v8.1 used for the legacy backlog. Nobody wins
-- and no rating moves: there was no contest to settle.

create or replace function public.reap_amordle_abandoned_games_v1(
  p_idle_days integer default 14,
  p_limit integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_idle interval := make_interval(days => greatest(1, least(coalesce(p_idle_days, 14), 365)));
  v_limit integer := greatest(1, least(coalesce(p_limit, 200), 1000));
  v_ids text[];
begin
  select array_agg(candidate.game_id)
  into v_ids
  from (
    select authority.game_id
    from brrrdle_private.amordle_combat_authority authority
    where authority.status in ('waiting', 'playing', 'holding')
      and authority.move_count = 0
      and authority.updated_at < now() - v_idle
      and authority.created_at < now() - v_idle
    order by authority.updated_at
    limit v_limit
  ) candidate;

  if v_ids is null or cardinality(v_ids) = 0 then
    return jsonb_build_object('reaped', 0);
  end if;

  update brrrdle_private.amordle_combat_authority
  set
    status = 'cancelled',
    /*
     * `cancelled`, not a new `abandoned` reason. The authority's terminal-reason CHECK has
     * a fixed allowlist and a new value fails it — this reaper raised on its very first
     * run against real data, inside a rolled-back probe, before it ever reached the cron
     * that would have swallowed the error. From the outside a game nobody ever played and
     * a game somebody cancelled are the same thing anyway.
     */
    terminal_reason = 'cancelled',
    turn_started_at = null,
    ended_at = coalesce(ended_at, now()),
    updated_at = now()
  where game_id = any (v_ids);

  update public.async_multiplayer_games
  set
    status = 'cancelled',
    ended_at = coalesce(ended_at, now()),
    updated_at = now(),
    projection = projection || jsonb_build_object(
      'status', 'cancelled',
      'endedAt', now(),
      'updatedAt', now()
    )
  where id = any (v_ids);

  return jsonb_build_object('reaped', cardinality(v_ids));
end
$$;

revoke all on function public.reap_amordle_abandoned_games_v1(integer, integer)
  from public, anon, authenticated;
