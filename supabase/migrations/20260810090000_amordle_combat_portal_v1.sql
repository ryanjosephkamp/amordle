-- Amordle v8 Cycle D: correspondence clocks, concurrency limits, live occupancy, and a
-- settlement backstop for games nobody comes back to.
--
-- Authorised by the owner against reports/v8-cycle-d-migration-decision-2026-08-10.md,
-- with the recommended answers to all five decisions. Forward-only, one transaction.
--
--   1. Three correspondence controls — 1, 3 and 7 days per move — taking the ladder to
--      ten and the bucket count to forty.
--   2. Concurrency limits on games in progress, which nothing enforced before.
--   3. A banded occupancy projection, so the portal can show where players are without
--      handing out numbers precise enough to identify one.
--   4. A settlement backstop for correspondence games that are simply abandoned.
--
-- Correspondence is deliberately NOT a second clock system. The authority already stamps
-- `turn_started_at` on every turn, so a per-move deadline is a budget that refills at the
-- start of each turn — the materialisation that already exists then produces per-move
-- semantics with no branch of its own.

-- ---------------------------------------------------------------------------
-- 1. The correspondence controls
-- ---------------------------------------------------------------------------

alter table brrrdle_private.amordle_rating_bucket
  add column if not exists clock_kind text not null default 'budget';

do $$
begin
  alter table brrrdle_private.amordle_rating_bucket
    drop constraint if exists amordle_rating_bucket_clock_kind_check;
  alter table brrrdle_private.amordle_rating_bucket
    add constraint amordle_rating_bucket_clock_kind_check
    check (clock_kind in ('budget', 'per_move'));
end
$$;

-- 1, 3 and 7 days per move. Not eight hours: the backstop below runs daily, and an
-- eight-hour deadline settled up to a day late on an abandoned game would be a game
-- design decided by how often the platform lets a job run. Every one of these is still
-- enforced the instant either player opens the game; the job is only for the case where
-- nobody ever does.
insert into brrrdle_private.amordle_rating_bucket
  (bucket, scope, mode, time_limit_ms, hard_mode, active, sort_order, clock_kind)
select
  format(
    'async:%s:%s:%s:v4',
    clock.mode,
    clock.label,
    case when hard.hard_mode then 'hard' else 'std' end
  ),
  'practice',
  clock.mode,
  clock.time_limit_ms,
  hard.hard_mode,
  true,
  clock.sort_order * 10 + case when clock.mode = 'go' then 1 else 0 end,
  'per_move'
from (
  select ladder.label, ladder.time_limit_ms, ladder.sort_order, mode.mode
  from (
    values
      ('1d', 86400000, 200),
      ('3d', 259200000, 210),
      ('7d', 604800000, 220)
  ) as ladder(label, time_limit_ms, sort_order)
  cross join (values ('og'), ('go')) as mode(mode)
) as clock
cross join (values (false), (true)) as hard(hard_mode)
on conflict (bucket) do nothing;

/*
 * Which kind of clock a duration is, derived from the duration itself rather than from a
 * column on the game.
 *
 * That matters because unranked games carry no rating bucket, and the correspondence
 * controls are offered for unranked play too. Deriving from `time_limit_ms` means one
 * answer for ranked and unranked alike, and no new column on the authority.
 */
create or replace function brrrdle_private.amordle_clock_kind(p_time_limit_ms integer)
returns text
language sql
stable
set search_path = ''
as $$
  select clock_kind
  from brrrdle_private.amordle_rating_bucket
  where active and time_limit_ms is not distinct from p_time_limit_ms
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- 2. Concurrency limits
-- ---------------------------------------------------------------------------
--
-- Two limits existed before this: five queued-or-matched ranked requests, and five
-- waiting public lobbies. Neither counted games in PROGRESS, so nothing stopped a player
-- holding twenty live matches at once.
--
-- One per rating bucket applies to ranked only. Two unranked friendlies at the same time
-- control are not a rating problem, and refusing them would be surprising.

create or replace function brrrdle_private.amordle_assert_combat_capacity(
  p_user_id uuid,
  p_ranked boolean,
  p_time_limit_ms integer,
  p_rating_bucket text
)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_kind text := coalesce(brrrdle_private.amordle_clock_kind(p_time_limit_ms), 'budget');
  v_overall integer;
  v_same_kind integer;
  v_same_bucket integer;
begin
  if p_user_id is null then
    return;
  end if;

  select
    count(*),
    count(*) filter (
      where coalesce(brrrdle_private.amordle_clock_kind(authority.time_limit_ms), 'budget') = v_kind
    ),
    count(*) filter (
      where p_ranked
        and authority.ranked
        and authority.rating_bucket is not distinct from p_rating_bucket
    )
  into v_overall, v_same_kind, v_same_bucket
  from brrrdle_private.amordle_combat_authority authority
  where authority.status in ('waiting', 'playing', 'holding')
    and (
      authority.player_one_user_id = p_user_id
      or authority.player_two_user_id = p_user_id
    );

  if v_overall >= 10 then
    raise exception 'COMBAT_LIMIT'
      using errcode = '54000', detail = 'COMBAT_LIMIT_OVERALL';
  end if;
  if v_same_kind >= 5 then
    raise exception 'COMBAT_LIMIT'
      using errcode = '54000',
      detail = case when v_kind = 'per_move' then 'COMBAT_LIMIT_CORRESPONDENCE'
                    else 'COMBAT_LIMIT_TIMED' end;
  end if;
  if p_ranked and p_rating_bucket is not null and v_same_bucket >= 1 then
    raise exception 'COMBAT_LIMIT'
      using errcode = '54000', detail = 'COMBAT_LIMIT_BUCKET';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. One timeout implementation, callable without a caller
-- ---------------------------------------------------------------------------
--
-- The inline timeout inside `save_amordle_combat_command_v2` needs an authenticated,
-- seated player. The backstop below has neither. Rather than write the transition twice
-- — which is how two implementations drift until they disagree about who won — it lives
-- here once, and both paths call it.

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
    p_game_id, v_sequence, p_action_id, 'timeout', 'timeout', null,
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
-- 4. The backstop
-- ---------------------------------------------------------------------------
--
-- Correspondence is exactly the case where nobody's browser is open, so it is the only
-- case a scheduled job can answer. Called once a day from the existing cron route, which
-- keeps the sanctioned HTTP interface count at three.
--
-- What this job does NOT do, stated plainly: it does not apply the rating.
--
-- Settlement is written once, in `settle_amordle_ranked_practice_v2`, and that function
-- narrows its receipt to `auth.uid()` — a job has no caller. The alternatives were a
-- second copy of three hundred lines of Elo maths, which is how two implementations
-- drift until they disagree about who won, or loosening the authentication on the one
-- that exists. Neither is worth it.
--
-- So the job ends the game, and the rating applies the moment either player next opens
-- it, with no button, through the client path Cycle A built. For a correspondence
-- timeout that is a weak dependency: the player who did NOT abandon the game is the one
-- who wins it, and they are by definition still turning up. The stronger fix is a
-- system-callable settlement, and it belongs in its own change rather than smuggled into
-- this one.

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
  v_examined integer := 0;
begin
  for v_game in
    select authority.game_id, authority.ranked, authority.scope
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
    end if;
  end loop;

  return jsonb_build_object('examined', v_examined, 'settled', v_settled);
end
$$;

revoke all on function public.settle_amordle_expired_correspondence_v1(integer)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Live occupancy, in bands
-- ---------------------------------------------------------------------------
--
-- Raw counts leak identity at a small player base: "one player queued at 3m OG", plus
-- knowing where a friend is, tells you who. Bands carry everything a player can act on —
-- is anyone here, are there many — and nothing they cannot.

create or replace function brrrdle_private.amordle_occupancy_band(p_count bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_count, 0) <= 0 then 'none'
    when p_count <= 2 then 'few'
    when p_count <= 5 then 'some'
    when p_count <= 10 then 'many'
    else 'busy'
  end
$$;

create or replace function public.get_amordle_combat_occupancy_v1()
returns table (
  bucket text,
  mode text,
  time_limit_ms integer,
  hard_mode boolean,
  clock_kind text,
  sort_order integer,
  queued_band text,
  playing_band text
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    ladder.bucket,
    ladder.mode,
    ladder.time_limit_ms,
    ladder.hard_mode,
    ladder.clock_kind,
    ladder.sort_order,
    brrrdle_private.amordle_occupancy_band(coalesce(queued.total, 0)),
    brrrdle_private.amordle_occupancy_band(coalesce(playing.total, 0))
  from brrrdle_private.amordle_rating_bucket ladder
  left join (
    select rating_bucket, count(*) as total
    from public.multiplayer_matchmaking_queue
    where status = 'queued'
    group by rating_bucket
  ) queued on queued.rating_bucket = ladder.bucket
  left join (
    select rating_bucket, count(*) as total
    from brrrdle_private.amordle_combat_authority
    where status in ('waiting', 'playing', 'holding')
    group by rating_bucket
  ) playing on playing.rating_bucket = ladder.bucket
  where ladder.active and ladder.scope = 'practice'
  order by ladder.sort_order
$$;

grant execute on function public.get_amordle_combat_occupancy_v1() to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 6. The functions that gain a capacity gate and the per-move refill
-- ---------------------------------------------------------------------------
--
-- Reproduced from their current definitions with targeted changes, so anything not
-- described here is byte-identical to what is deployed today.

-- >>> per-move refill
create or replace function public.save_amordle_combat_command_v2(
  p_game_id text,
  p_action_id text,
  p_expected_version integer,
  p_expected_move_count integer,
  p_command text,
  p_guess text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_command text := lower(coalesce(p_command, ''));
  v_guess text := lower(nullif(btrim(p_guess), ''));
  v_authority brrrdle_private.amordle_combat_authority%rowtype;
  v_public public.async_multiplayer_games%rowtype;
  v_existing brrrdle_private.amordle_combat_action_ledger%rowtype;
  v_player_id text;
  v_other_player_id text;
  v_player_user_id uuid;
  v_other_user_id uuid;
  v_active_time integer;
  v_clock_debit integer := 0;
  v_now timestamptz := now();
  v_answer text;
  v_tiles jsonb;
  v_solved boolean := false;
  v_attempts integer;
  v_other_attempts integer;
  v_attempt_budget integer;
  v_points integer := 0;
  v_next_status text;
  v_next_turn text;
  v_next_puzzle integer;
  v_next_hold timestamptz;
  v_next_started timestamptz;
  v_next_ended timestamptz;
  v_terminal_reason text;
  v_winner text;
  v_forfeited text;
  v_timed_out text;
  v_left_points integer;
  v_right_points integer;
  v_sequence integer;
  v_next_move_count integer;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000', detail = 'AUTH_REQUIRED';
  end if;
  if nullif(p_game_id, '') is null or nullif(p_action_id, '') is null
    or length(p_action_id) > 200
    or p_expected_version is null or p_expected_move_count is null
    or v_command not in ('guess', 'cancel', 'forfeit', 'advance', 'timeout')
    or (v_command = 'guess' and v_guess is null)
    or (v_command <> 'guess' and v_guess is not null)
  then
    raise exception 'INVALID_ARGUMENT' using errcode = '22023', detail = 'INVALID_ARGUMENT';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('amordle-combat-command:' || p_game_id, 0));
  select * into v_authority
  from brrrdle_private.amordle_combat_authority authority
  where authority.game_id = p_game_id
  for update;
  select * into v_public
  from public.async_multiplayer_games public_game
  where public_game.id = p_game_id
  for update;
  if v_authority.game_id is null or v_public.id is null or v_public.authority_version <> 2 then
    raise exception 'NOT_FOUND' using errcode = 'P0002', detail = 'NOT_FOUND';
  end if;
  if v_user_id = v_authority.player_one_user_id then
    v_player_id := 'player-one';
    v_other_player_id := 'player-two';
    v_player_user_id := v_authority.player_one_user_id;
    v_other_user_id := v_authority.player_two_user_id;
  elsif v_user_id = v_authority.player_two_user_id then
    v_player_id := 'player-two';
    v_other_player_id := 'player-one';
    v_player_user_id := v_authority.player_two_user_id;
    v_other_user_id := v_authority.player_one_user_id;
  else
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'FORBIDDEN';
  end if;

  select * into v_existing
  from brrrdle_private.amordle_combat_action_ledger action
  where action.game_id = p_game_id and action.action_id = p_action_id;
  if found then
    if v_existing.requested_command is distinct from v_command
      or v_existing.requested_guess is distinct from v_guess
    then
      raise exception 'IDEMPOTENCY_CONFLICT'
        using errcode = '23505', detail = 'IDEMPOTENCY_CONFLICT';
    end if;
    return brrrdle_private.amordle_participant_projection(p_game_id, v_user_id)
      || jsonb_build_object('idempotent', true);
  end if;

  if v_authority.status in ('completed', 'cancelled') then
    raise exception 'TERMINAL' using errcode = '22023', detail = 'TERMINAL';
  end if;
  if v_authority.version <> p_expected_version
    or v_authority.move_count <> p_expected_move_count
    or v_public.state_version <> v_authority.version
    or v_public.move_count <> v_authority.move_count
  then
    raise exception 'STATE_CONFLICT' using errcode = '40001', detail = 'STATE_CONFLICT';
  end if;

  -- Materialize the running player-owned clock before considering the command.
  if v_authority.status = 'playing' and v_authority.time_limit_ms is not null
    and v_authority.turn_started_at is not null
  then
    v_clock_debit := greatest(
      0,
      floor(extract(epoch from (v_now - v_authority.turn_started_at)) * 1000)::integer
    );
    if v_authority.current_turn = 'player-one' then
      v_active_time := greatest(0, v_authority.player_one_time_remaining_ms - v_clock_debit);
      v_authority.player_one_time_remaining_ms := v_active_time;
    else
      v_active_time := greatest(0, v_authority.player_two_time_remaining_ms - v_clock_debit);
      v_authority.player_two_time_remaining_ms := v_active_time;
    end if;
    if v_active_time = 0 then
      v_timed_out := v_authority.current_turn;
      v_winner := case v_timed_out when 'player-one' then 'player-two' else 'player-one' end;
      v_sequence := v_authority.version + 1;
      insert into brrrdle_private.amordle_combat_action_ledger (
        game_id, sequence_no, action_id, action_type, requested_command, requested_guess, player_user_id, player_id,
        clock_debit_ms, resulting_version, resulting_move_count, created_at
      ) values (
        p_game_id,
        v_sequence,
        p_action_id,
        'timeout',
        v_command,
        v_guess,
        case v_timed_out when 'player-one' then v_authority.player_one_user_id else v_authority.player_two_user_id end,
        v_timed_out,
        v_clock_debit,
        v_sequence,
        v_authority.move_count,
        v_now
      );
      update brrrdle_private.amordle_combat_authority
      set
        status = 'completed',
        version = v_sequence,
        terminal_reason = 'timeout',
        winner_player_id = v_winner,
        timed_out_player_id = v_timed_out,
        player_one_time_remaining_ms = v_authority.player_one_time_remaining_ms,
        player_two_time_remaining_ms = v_authority.player_two_time_remaining_ms,
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
          'moveCount', move_count,
          'updatedAt', v_now,
          'endedAt', v_now
        )
      where id = p_game_id;

      /*
       * v8-C. Settlement happens here, not on a button.
       *
       * Every writer of a rating used to be reachable only from UPDATE RATING, so a
       * losing player could decline the result by closing the tab. The terminal
       * transition is caused by a command, and a command comes through this function,
       * so settling here means the result lands whatever either client does next.
       *
       * Safe to call more than once: the settlement takes an advisory lock on the game
       * and derives its idempotency key internally, so the client-side auto-settle
       * kept from Cycle A is a harmless replay rather than a second application.
       * Failures are swallowed deliberately — a rating that cannot be written must
       * never roll back the move that was legitimately played.
       */
      if v_authority.ranked and v_authority.scope = 'practice' then
        begin
          perform public.settle_amordle_ranked_practice_v2(
            p_game_id,
            p_action_id || ':auto-settle'
          );
        exception
          when others then null;
        end;
      end if;
      return brrrdle_private.amordle_participant_projection(p_game_id, v_user_id)
        || jsonb_build_object('idempotent', false);
    end if;
  end if;

  v_sequence := v_authority.version + 1;
  v_next_move_count := v_authority.move_count;
  v_next_status := v_authority.status;
  v_next_turn := v_authority.current_turn;
  v_next_puzzle := v_authority.current_puzzle_index;
  v_next_hold := v_authority.hold_until;
  v_next_started := case when v_authority.time_limit_ms is not null then v_now else null end;
  v_attempt_budget := brrrdle_private.amordle_attempt_budget(v_authority.current_puzzle_index);

  if v_command = 'timeout' then
    raise exception 'TIMEOUT_PENDING'
      using errcode = '22023', detail = 'TIMEOUT_PENDING';
  elsif v_command = 'cancel' then
    if v_authority.move_count <> 0 or v_authority.status not in ('waiting', 'playing') then
      raise exception 'TERMINAL' using errcode = '22023', detail = 'CANCEL_NOT_ALLOWED';
    end if;
    v_next_status := 'cancelled';
    v_terminal_reason := 'cancelled';
    v_next_ended := v_now;
    v_next_started := null;
    insert into brrrdle_private.amordle_combat_action_ledger (
      game_id, sequence_no, action_id, action_type, requested_command, requested_guess, player_user_id, player_id,
      clock_debit_ms, resulting_version, resulting_move_count, created_at
    ) values (
      p_game_id, v_sequence, p_action_id, 'cancel', v_command, v_guess, v_user_id, v_player_id,
      v_clock_debit, v_sequence, v_next_move_count, v_now
    );
  elsif v_command = 'forfeit' then
    if v_authority.move_count = 0 or v_authority.status not in ('playing', 'holding') then
      raise exception 'TERMINAL' using errcode = '22023', detail = 'FORFEIT_NOT_ALLOWED';
    end if;
    v_next_status := 'completed';
    v_terminal_reason := 'forfeit';
    v_forfeited := v_player_id;
    v_winner := v_other_player_id;
    v_next_ended := v_now;
    v_next_started := null;
    v_next_hold := null;
    insert into brrrdle_private.amordle_combat_action_ledger (
      game_id, sequence_no, action_id, action_type, requested_command, requested_guess, player_user_id, player_id,
      clock_debit_ms, resulting_version, resulting_move_count, created_at
    ) values (
      p_game_id, v_sequence, p_action_id, 'forfeit', v_command, v_guess, v_user_id, v_player_id,
      v_clock_debit, v_sequence, v_next_move_count, v_now
    );
  elsif v_command = 'advance' then
    if v_authority.status <> 'holding' or v_authority.hold_until is null
      or v_now < v_authority.hold_until
    then
      raise exception 'HOLD_ACTIVE' using errcode = '22023', detail = 'HOLD_ACTIVE';
    end if;
    if v_authority.current_puzzle_index + 1 >= cardinality(v_authority.answers) then
      raise exception 'TERMINAL' using errcode = '22023', detail = 'TERMINAL';
    end if;
    v_next_status := 'playing';
    v_next_puzzle := v_authority.current_puzzle_index + 1;
    v_next_hold := null;
    insert into brrrdle_private.amordle_combat_action_ledger (
      game_id, sequence_no, action_id, action_type, requested_command, requested_guess, player_user_id, player_id,
      puzzle_index, resulting_version, resulting_move_count, created_at
    ) values (
      p_game_id, v_sequence, p_action_id, 'advance', v_command, v_guess, v_user_id, v_player_id,
      v_next_puzzle, v_sequence, v_next_move_count, v_now
    );
  else
    if v_authority.status <> 'playing' then
      raise exception 'HOLD_ACTIVE' using errcode = '22023', detail = 'HOLD_ACTIVE';
    end if;
    if v_authority.current_turn <> v_player_id then
      raise exception 'NOT_YOUR_TURN' using errcode = '22023', detail = 'NOT_YOUR_TURN';
    end if;
    if length(v_guess) <> v_authority.word_length or v_guess !~ '^[a-z]+$' then
      raise exception 'INVALID_GUESS' using errcode = '22023', detail = 'INVALID_GUESS_LENGTH';
    end if;
    if not exists (
      select 1
      from brrrdle_private.amordle_word_catalogs catalog
      where catalog.revision = v_authority.catalog_revision
        and catalog.word_length = v_authority.word_length
        and v_guess = any(catalog.valid_guesses)
    ) then
      raise exception 'INVALID_GUESS' using errcode = '22023', detail = 'INVALID_GUESS_WORD';
    end if;
    if v_authority.hard_mode
      and not brrrdle_private.amordle_hard_mode_guess_is_valid(
        p_game_id, v_authority.current_puzzle_index, v_guess
      )
    then
      raise exception 'HARD_MODE_VIOLATION'
        using errcode = '22023', detail = 'HARD_MODE_VIOLATION';
    end if;
    v_attempts := brrrdle_private.amordle_player_attempts(
      p_game_id, v_player_id, v_authority.current_puzzle_index
    );
    if v_attempts >= v_attempt_budget then
      raise exception 'TERMINAL' using errcode = '22023', detail = 'NO_ATTEMPTS';
    end if;
    v_answer := v_authority.answers[v_authority.current_puzzle_index + 1];
    v_tiles := brrrdle_private.amordle_tiles(v_guess, v_answer);
    v_solved := v_guess = v_answer;
    v_attempts := v_attempts + 1;
    v_points := brrrdle_private.amordle_action_points(
      v_tiles,
      v_solved,
      v_attempt_budget - v_attempts,
      v_authority.hard_mode
    );
    v_next_move_count := v_authority.move_count + 1;
    insert into brrrdle_private.amordle_combat_action_ledger (
      game_id, sequence_no, action_id, action_type, requested_command, requested_guess, player_user_id, player_id,
      puzzle_index, guess, tiles, points_awarded, clock_debit_ms,
      resulting_version, resulting_move_count, created_at
    ) values (
      p_game_id, v_sequence, p_action_id, 'guess', v_command, v_guess, v_user_id, v_player_id,
      v_authority.current_puzzle_index, v_guess, v_tiles, v_points, v_clock_debit,
      v_sequence, v_next_move_count, v_now
    );
    v_other_attempts := brrrdle_private.amordle_player_attempts(
      p_game_id, v_other_player_id, v_authority.current_puzzle_index
    );

    if v_authority.mode = 'og' and v_solved then
      v_next_status := 'completed';
      v_terminal_reason := 'solve';
      v_winner := v_player_id;
      v_next_ended := v_now;
      v_next_started := null;
    elsif v_authority.mode = 'go' and v_solved
      and v_authority.current_puzzle_index + 1 < cardinality(v_authority.answers)
    then
      v_next_status := 'holding';
      v_next_turn := v_other_player_id;
      v_next_hold := v_now + interval '2 seconds';
      v_next_started := null;
    elsif v_authority.mode = 'go' and v_solved then
      v_next_status := 'completed';
      v_terminal_reason := 'points';
      v_next_ended := v_now;
      v_next_started := null;
    elsif v_attempts >= v_attempt_budget and v_other_attempts >= v_attempt_budget then
      v_next_status := 'completed';
      v_terminal_reason := 'points';
      v_next_ended := v_now;
      v_next_started := null;
    elsif v_attempts >= v_attempt_budget then
      v_next_turn := v_other_player_id;
    elsif v_other_attempts >= v_attempt_budget then
      v_next_turn := v_player_id;
    else
      v_next_turn := v_other_player_id;
    end if;
  end if;

  if v_next_status = 'completed' and v_winner is null then
    v_left_points := brrrdle_private.amordle_player_points(p_game_id, 'player-one');
    v_right_points := brrrdle_private.amordle_player_points(p_game_id, 'player-two');
    if v_left_points > v_right_points then
      v_winner := 'player-one';
    elsif v_right_points > v_left_points then
      v_winner := 'player-two';
    else
      v_terminal_reason := 'draw';
    end if;
  end if;

  update brrrdle_private.amordle_combat_authority
  set
    status = v_next_status,
    current_turn = v_next_turn,
    current_puzzle_index = v_next_puzzle,
    hold_until = v_next_hold,
    player_one_time_remaining_ms = case
      when time_limit_ms is null then null
      -- v8-D. A per-move clock is a budget that refills at the start of every turn.
      -- Writing the full allowance back to both seats here is what makes that true, and
      -- it is why the materialisation above needs no branch of its own: it keeps
      -- decrementing against `turn_started_at` exactly as it always has.
      when brrrdle_private.amordle_clock_kind(time_limit_ms) = 'per_move' then time_limit_ms
      when v_authority.current_turn = 'player-one' then v_authority.player_one_time_remaining_ms
      else player_one_time_remaining_ms
    end,
    player_two_time_remaining_ms = case
      when time_limit_ms is null then null
      when brrrdle_private.amordle_clock_kind(time_limit_ms) = 'per_move' then time_limit_ms
      when v_authority.current_turn = 'player-two' then v_authority.player_two_time_remaining_ms
      else player_two_time_remaining_ms
    end,
    turn_started_at = case when v_next_status = 'playing' then v_next_started else null end,
    version = v_sequence,
    move_count = v_next_move_count,
    terminal_reason = v_terminal_reason,
    winner_player_id = v_winner,
    forfeited_player_id = v_forfeited,
    timed_out_player_id = v_timed_out,
    ended_at = v_next_ended,
    updated_at = v_now
  where game_id = p_game_id;

  update public.async_multiplayer_games
  set
    status = case
      when v_next_status = 'waiting' then 'waiting'
      when v_next_status in ('playing', 'holding') then 'playing'
      when v_next_status = 'cancelled' then 'cancelled'
      when v_winner is null then 'lost'
      else 'won'
    end,
    current_turn = v_next_turn,
    winner_player_id = v_winner,
    ended_at = v_next_ended,
    state_version = v_sequence,
    move_count = v_next_move_count,
    updated_at = v_now,
    projection = projection || jsonb_strip_nulls(jsonb_build_object(
      'status', v_next_status,
      'currentTurn', case when v_next_status in ('playing', 'holding') then v_next_turn else null end,
      'currentPuzzleIndex', v_next_puzzle,
      'holdUntil', v_next_hold,
      'stateVersion', v_sequence,
      'moveCount', v_next_move_count,
      'updatedAt', v_now,
      'endedAt', v_next_ended
    ))
  where id = p_game_id and authority_version = 2;

  if v_next_status = 'completed' then

    /*
     * v8-C. Settlement happens here, not on a button.
     *
     * Every writer of a rating used to be reachable only from UPDATE RATING, so a
     * losing player could decline the result by closing the tab. The terminal
     * transition is caused by a command, and a command comes through this function,
     * so settling here means the result lands whatever either client does next.
     *
     * Safe to call more than once: the settlement takes an advisory lock on the game
     * and derives its idempotency key internally, so the client-side auto-settle
     * kept from Cycle A is a harmless replay rather than a second application.
     * Failures are swallowed deliberately — a rating that cannot be written must
     * never roll back the move that was legitimately played.
     */
    if v_authority.ranked and v_authority.scope = 'practice' then
      begin
        perform public.settle_amordle_ranked_practice_v2(
          p_game_id,
          p_action_id || ':auto-settle'
        );
      exception
        when others then null;
      end;
    end if;
  end if;

  return brrrdle_private.amordle_participant_projection(p_game_id, v_user_id)
    || jsonb_build_object('idempotent', false);
end;
$$;

-- >>> creation capacity
create or replace function brrrdle_private.amordle_create_combat_v3(
  p_game_id text,
  p_creation_key text,
  p_source_kind text,
  p_visibility_kind text,
  p_scope text,
  p_mode text,
  p_word_length integer,
  p_difficulty text,
  p_hard_mode boolean,
  p_go_puzzle_count integer,
  p_time_limit_ms integer,
  p_ranked boolean,
  p_rating_bucket text,
  p_player_one_user_id uuid,
  p_player_two_user_id uuid,
  p_status text,
  p_daily_date_key text default null,
  p_matchmaking_request_id text default null,
  p_created_at timestamptz default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope text := lower(coalesce(p_scope, ''));
  v_mode text := lower(coalesce(p_mode, ''));
  v_difficulty text := lower(coalesce(p_difficulty, ''));
  v_source text := lower(coalesce(p_source_kind, ''));
  v_visibility text := lower(coalesce(p_visibility_kind, ''));
  v_status text := lower(coalesce(p_status, ''));
  v_revision text;
  v_answers text[];
  v_answer_count integer;
  v_now timestamptz := coalesce(p_created_at, now());
  v_deadline timestamptz;
begin
  if nullif(btrim(coalesce(p_game_id, '')), '') is null
    or length(p_game_id) > 200
    or nullif(btrim(coalesce(p_creation_key, '')), '') is null
    or length(p_creation_key) > 200
    or v_source not in (
      'public_lobby',
      'ranked_queue',
      'daily_lobby',
      'private_request',
      'rematch'
    )
    or v_visibility not in ('public', 'restricted')
    or v_scope not in ('practice', 'daily')
    or v_mode not in ('og', 'go')
    or p_word_length not between 2 and 35
    or v_difficulty not in ('casual', 'standard', 'expert')
    or p_hard_mode is null
    or not brrrdle_private.amordle_clock_is_playable(p_time_limit_ms)
    or p_ranked is null
    or v_status not in ('waiting', 'playing')
    or p_player_one_user_id is null
    or p_player_two_user_id = p_player_one_user_id
    or (v_status = 'waiting' and p_player_two_user_id is not null)
    or (v_status = 'playing' and p_player_two_user_id is null)
    or (v_mode = 'og' and p_go_puzzle_count is not null)
    or (v_mode = 'go' and p_go_puzzle_count not in (5, 7, 10))
    or (p_ranked and nullif(coalesce(p_rating_bucket, ''), '') is null)
    or (not p_ranked and p_rating_bucket is not null)
    or (v_scope = 'daily' and (
      p_word_length <> 5
      or v_difficulty <> 'expert'
      or p_time_limit_ms is not null
      or p_daily_date_key is null
      or p_daily_date_key !~ '^\d{4}-\d{2}-\d{2}$'
    ))
    or (v_scope = 'practice' and p_daily_date_key is not null)
  then
    raise exception 'INVALID_ARGUMENT'
      using errcode = '22023', detail = 'INVALID_ARGUMENT';
  end if;

  if exists (
    select 1
    from brrrdle_private.amordle_combat_authority authority
    where authority.game_id = p_game_id
       or authority.creation_key = p_creation_key
  ) then
    raise exception 'IDEMPOTENCY_CONFLICT'
      using errcode = '23505', detail = 'IDEMPOTENCY_CONFLICT';
  end if;

  select max(catalog.revision)
  into v_revision
  from brrrdle_private.amordle_word_catalogs catalog
  where catalog.word_length = p_word_length;
  if v_revision is null then
    raise exception 'WORD_CATALOG_UNAVAILABLE'
      using errcode = '55000', detail = 'WORD_CATALOG_UNAVAILABLE';
  end if;

  v_answer_count := case when v_mode = 'go' then p_go_puzzle_count else 1 end;
  v_answers := brrrdle_private.amordle_select_answers(
    v_revision,
    p_word_length,
    v_difficulty,
    v_answer_count
  );
  if cardinality(v_answers) <> v_answer_count then
    raise exception 'WORD_CATALOG_UNAVAILABLE'
      using errcode = '55000', detail = 'WORD_CATALOG_UNAVAILABLE';
  end if;

  v_deadline := case
    when v_scope = 'daily'
      then ((p_daily_date_key::date + 1)::timestamp at time zone 'UTC')
    else null
  end;

  /*
   * v8-D. Capacity, for both seats, before anything is written.
   *
   * Ten games overall, five of each clock kind, and one ranked game per rating bucket.
   * Nothing counted games in progress before this — the two limits that existed counted
   * queued requests and waiting lobbies — so a player could hold as many live matches as
   * they could open tabs.
   */
  perform brrrdle_private.amordle_assert_combat_capacity(
    p_player_one_user_id, p_ranked, p_time_limit_ms, p_rating_bucket
  );
  perform brrrdle_private.amordle_assert_combat_capacity(
    p_player_two_user_id, p_ranked, p_time_limit_ms, p_rating_bucket
  );

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
    updated_at,
    authority_version,
    source_kind,
    visibility_kind,
    state_version,
    move_count
  ) values (
    p_game_id,
    v_scope,
    v_mode,
    p_daily_date_key,
    v_status,
    'player-one',
    p_word_length,
    v_difficulty,
    p_go_puzzle_count,
    p_player_one_user_id,
    p_player_one_user_id,
    p_player_two_user_id,
    p_ranked,
    p_rating_bucket,
    p_matchmaking_request_id,
    null,
    null,
    v_deadline,
    null,
    jsonb_strip_nulls(jsonb_build_object(
      'schemaVersion', 2,
      'authorityVersion', 2,
      'id', p_game_id,
      'scope', v_scope,
      'mode', v_mode,
      'dailyDateKey', p_daily_date_key,
      'sourceKind', replace(v_source, '_', '-'),
      'visibilityKind', v_visibility,
      'status', v_status,
      'ranked', p_ranked,
      'ratingBucket', brrrdle_private.amordle_app_bucket(p_rating_bucket),
      'wordLength', p_word_length,
      'difficulty', v_difficulty,
      'hardMode', p_hard_mode,
      'goPuzzleCount', p_go_puzzle_count,
      'timeLimitMs', p_time_limit_ms,
      'stateVersion', 0,
      'moveCount', 0,
      'createdAt', v_now,
      'updatedAt', v_now
    )),
    v_now,
    v_now,
    2,
    v_source,
    v_visibility,
    0,
    0
  );

  insert into brrrdle_private.amordle_combat_authority (
    game_id,
    creation_key,
    source_kind,
    visibility_kind,
    scope,
    mode,
    word_length,
    difficulty,
    hard_mode,
    go_puzzle_count,
    time_limit_ms,
    ranked,
    rating_bucket,
    catalog_revision,
    answers,
    player_one_user_id,
    player_two_user_id,
    status,
    current_turn,
    player_one_time_remaining_ms,
    player_two_time_remaining_ms,
    turn_started_at,
    created_at,
    started_at,
    updated_at
  ) values (
    p_game_id,
    p_creation_key,
    v_source,
    v_visibility,
    v_scope,
    v_mode,
    p_word_length,
    v_difficulty,
    p_hard_mode,
    p_go_puzzle_count,
    p_time_limit_ms,
    p_ranked,
    p_rating_bucket,
    v_revision,
    v_answers,
    p_player_one_user_id,
    p_player_two_user_id,
    v_status,
    'player-one',
    p_time_limit_ms,
    p_time_limit_ms,
    case when v_status = 'playing' and p_time_limit_ms is not null then v_now else null end,
    v_now,
    case when v_status = 'playing' then v_now else null end,
    v_now
  );

  return p_game_id;
end;
$$;

-- >>> ranked finalize capacity
create or replace function public.finalize_amordle_ranked_practice_v2(
  p_request_id text,
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
  v_reservation brrrdle_private.amordle_ranked_practice_reservations%rowtype;
  v_request public.multiplayer_matchmaking_queue%rowtype;
  v_existing brrrdle_private.amordle_combat_authority%rowtype;
  v_revision text;
  v_answers text[];
  v_count integer;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000', detail = 'AUTH_REQUIRED';
  end if;
  select * into v_reservation
  from brrrdle_private.amordle_ranked_practice_reservations reservation
  where reservation.game_id = p_game_id
  for update;
  if not found or p_request_id not in (v_reservation.request_one_id, v_reservation.request_two_id)
    or v_user_id not in (v_reservation.player_one_user_id, v_reservation.player_two_user_id)
  then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'FORBIDDEN';
  end if;
  select * into v_request
  from public.multiplayer_matchmaking_queue queue_row
  where queue_row.id = p_request_id;
  if not found or v_request.status <> 'matched'
    or v_request.authority_version <> 2
    or coalesce(v_request.matched_game_id, v_request.matched_match_id) <> p_game_id
    or v_request.mode <> v_reservation.mode
    or v_request.word_length <> v_reservation.word_length
    or v_request.difficulty <> v_reservation.difficulty
    or v_request.hard_mode is distinct from v_reservation.hard_mode
    or v_request.go_puzzle_count is distinct from v_reservation.go_puzzle_count
    or v_request.time_limit_ms is distinct from v_reservation.time_limit_ms
    or v_request.rating_bucket <> v_reservation.rating_bucket
  then
    raise exception 'INVALID_ARGUMENT' using errcode = '22023', detail = 'RESERVATION_MISMATCH';
  end if;

  select * into v_existing
  from brrrdle_private.amordle_combat_authority authority
  where authority.game_id = p_game_id;
  if found then
    return brrrdle_private.amordle_participant_projection(p_game_id, v_user_id)
      || jsonb_build_object('idempotent', true);
  end if;

  select max(catalog.revision) into v_revision
  from brrrdle_private.amordle_word_catalogs catalog
  where catalog.word_length = v_reservation.word_length;
  v_count := case when v_reservation.mode = 'go' then v_reservation.go_puzzle_count else 1 end;
  v_answers := brrrdle_private.amordle_select_answers(
    v_revision,
    v_reservation.word_length,
    v_reservation.difficulty,
    v_count
  );

  -- v8-D. Ranked finalize inserts the game directly rather than routing through
  -- `amordle_create_combat_v3`, so the capacity gate is stated here too.
  perform brrrdle_private.amordle_assert_combat_capacity(
    v_reservation.player_one_user_id, true, v_request.time_limit_ms, v_request.rating_bucket
  );
  perform brrrdle_private.amordle_assert_combat_capacity(
    v_reservation.player_two_user_id, true, v_request.time_limit_ms, v_request.rating_bucket
  );

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
    projection,
    created_at,
    updated_at,
    authority_version,
    source_kind,
    visibility_kind,
    state_version,
    move_count
  ) values (
    p_game_id,
    'practice',
    v_reservation.mode,
    null,
    'playing',
    'player-one',
    v_reservation.word_length,
    v_reservation.difficulty,
    v_reservation.go_puzzle_count,
    v_reservation.player_one_user_id,
    v_reservation.player_one_user_id,
    v_reservation.player_two_user_id,
    true,
    v_reservation.rating_bucket,
    p_request_id,
    null,
    jsonb_build_object(
      'schemaVersion', 2,
      'authorityVersion', 2,
      'id', p_game_id,
      'scope', 'practice',
      'mode', v_reservation.mode,
      'status', 'playing',
      'ranked', true,
      'wordLength', v_reservation.word_length,
      'difficulty', v_reservation.difficulty,
      'hardMode', v_reservation.hard_mode,
      'goPuzzleCount', v_reservation.go_puzzle_count,
      'timeLimitMs', v_reservation.time_limit_ms,
      'stateVersion', 0,
      'moveCount', 0,
      'createdAt', v_reservation.matched_at,
      'updatedAt', v_now
    ),
    v_reservation.matched_at,
    v_now,
    2,
    'ranked_queue',
    'public',
    0,
    0
  );
  insert into brrrdle_private.amordle_combat_authority (
    game_id,
    creation_key,
    source_kind,
    visibility_kind,
    scope,
    mode,
    word_length,
    difficulty,
    hard_mode,
    go_puzzle_count,
    time_limit_ms,
    ranked,
    rating_bucket,
    catalog_revision,
    answers,
    player_one_user_id,
    player_two_user_id,
    status,
    current_turn,
    player_one_time_remaining_ms,
    player_two_time_remaining_ms,
    turn_started_at,
    created_at,
    started_at,
    updated_at
  ) values (
    p_game_id,
    'ranked-practice:' || p_game_id,
    'ranked_queue',
    'public',
    'practice',
    v_reservation.mode,
    v_reservation.word_length,
    v_reservation.difficulty,
    v_reservation.hard_mode,
    v_reservation.go_puzzle_count,
    v_reservation.time_limit_ms,
    true,
    v_reservation.rating_bucket,
    v_revision,
    v_answers,
    v_reservation.player_one_user_id,
    v_reservation.player_two_user_id,
    'playing',
    'player-one',
    v_reservation.time_limit_ms,
    v_reservation.time_limit_ms,
    case when v_reservation.time_limit_ms is not null then v_now else null end,
    v_reservation.matched_at,
    v_now,
    v_now
  );
  update brrrdle_private.amordle_ranked_practice_reservations
  set finalized_at = v_now where game_id = p_game_id;
  return brrrdle_private.amordle_participant_projection(p_game_id, v_user_id)
    || jsonb_build_object('idempotent', false);
end;
$$;

