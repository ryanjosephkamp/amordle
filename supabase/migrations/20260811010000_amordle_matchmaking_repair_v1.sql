-- Amordle v8.1: repair ranked matchmaking.
--
-- Authorised by the owner against the approved v8.1 plan, including the retirement of five
-- abandoned legacy games. Forward-only, one transaction.
--
-- Cycle D added concurrency limits and, in doing so, broke ranked matchmaking. The limit was
-- enforced in `finalize_amordle_ranked_practice_v2` — which runs AFTER `claim` has already
-- paired the players, flipped both queue rows to `matched` and reserved a game id. A refusal
-- at that point could not undo any of it, so both players were left holding a row pointing at
-- a game that was never created, retrying every five seconds forever.
--
-- The live database showed it plainly: four queue rows in `matched` whose `matched_game_id`
-- has no game, and one account sitting in twelve live games against a limit of ten — eight of
-- them `playing` with zero moves, abandoned weeks earlier and never cleaned up.
--
--   M1  capacity is decided in `claim`, before anything is written
--   M2  the limit counts games actually being played, not lobbies and abandoned shells
--   M3  `finalize` loses the gate that could strand a pair
--   M4  the four existing phantom rows are made honest
--   M5  the five abandoned legacy games are retired

-- ---------------------------------------------------------------------------
-- M2. What counts as a game in progress
-- ---------------------------------------------------------------------------
--
-- The Cycle D version counted every game in `waiting`, `playing` or `holding` regardless of
-- whether a move had ever been made. That swept up open lobbies nobody had joined and shells
-- abandoned weeks ago, so a player could be locked out of ranked play by games they had never
-- actually played. Open lobbies are already capped separately at five, which is the right
-- place for that limit and not this one.
--
-- Returning the failing code rather than raising lets `claim` ask "is this player full?"
-- about someone else without catching an exception to find out.

create or replace function brrrdle_private.amordle_combat_capacity_block(
  p_user_id uuid,
  p_ranked boolean,
  p_time_limit_ms integer,
  p_rating_bucket text
)
returns text
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
    return null;
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
  where authority.status in ('playing', 'holding')
    and authority.move_count > 0
    and (
      authority.player_one_user_id = p_user_id
      or authority.player_two_user_id = p_user_id
    );

  if v_overall >= 10 then
    return 'COMBAT_LIMIT_OVERALL';
  end if;
  if v_same_kind >= 5 then
    return case when v_kind = 'per_move' then 'COMBAT_LIMIT_CORRESPONDENCE'
                else 'COMBAT_LIMIT_TIMED' end;
  end if;
  if p_ranked and p_rating_bucket is not null and v_same_bucket >= 1 then
    return 'COMBAT_LIMIT_BUCKET';
  end if;
  return null;
end
$$;

-- The raising form, kept for `amordle_create_combat_v3` and stated in terms of the one above
-- so the two can never disagree about who is full.
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
  v_block text := brrrdle_private.amordle_combat_capacity_block(
    p_user_id, p_ranked, p_time_limit_ms, p_rating_bucket
  );
begin
  if v_block is not null then
    raise exception 'COMBAT_LIMIT' using errcode = '54000', detail = v_block;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- M4. Make the existing phantom rows honest
-- ---------------------------------------------------------------------------
--
-- Four rows claim a match against a game id that has no game. They are the wreckage of the
-- deadlock above. Expiring them is the truthful state: the match they name never happened,
-- and the players are free to search again.

update public.multiplayer_matchmaking_queue queue_row
set status = 'expired'
where queue_row.status = 'matched'
  and queue_row.matched_game_id is not null
  and not exists (
    select 1 from public.async_multiplayer_games game
    where game.id = queue_row.matched_game_id
  );

-- ---------------------------------------------------------------------------
-- M5. Retire the abandoned legacy games
-- ---------------------------------------------------------------------------
--
-- Five games left `playing` with zero moves since July, in the pre-v2 legacy format, which is
-- why `/combat/active` never showed them and the owner could not reach them to cancel them
-- himself. Authorised explicitly.
--
-- They are CANCELLED rather than deleted. Cancelling is the transition the game's own state
-- machine defines for a game that ends without being played, it is what the owner would have
-- done through the UI had it reached them, and it leaves the action ledger referring to a row
-- that still exists. The predicate is deliberately narrow — legacy source, no moves, created
-- before August — so it cannot touch a real game.

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
where status = 'playing'
  and source_kind = 'legacy'
  and move_count = 0
  and created_at < timestamptz '2026-08-01';

update brrrdle_private.amordle_combat_authority
set
  status = 'cancelled',
  terminal_reason = 'cancelled',
  turn_started_at = null,
  ended_at = coalesce(ended_at, now()),
  updated_at = now()
where status in ('waiting', 'playing', 'holding')
  and move_count = 0
  and created_at < timestamptz '2026-08-01'
  and game_id in (
    select id from public.async_multiplayer_games
    where status = 'cancelled' and source_kind = 'legacy'
  );

-- ---------------------------------------------------------------------------
-- M1 + M3. The two functions that decide a match
-- ---------------------------------------------------------------------------
--
-- Reproduced from their current definitions with the changes described above, so anything not
-- described here is byte-identical to what is deployed today.

-- >>> finalize without the stranding gate
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

  /*
   * v8.1-M3. The Cycle D capacity gate that lived here is GONE, deliberately.
   *
   * By the time finalize runs, `claim` has already paired the players, marked both queue
   * rows `matched` and written a reservation. A refusal at this point therefore could not
   * undo any of that — it left both players holding a row that pointed at a game which was
   * never created, retrying every five seconds forever. That is not a limit, it is a
   * deadlock, and it is what the owner reported as "matchmaking doesn't connect us".
   *
   * The check now runs inside `claim`, before anything at all is written, where a refusal
   * costs nothing. Keeping a second copy here would only restore the ability to strand a
   * pair between the two calls.
   */
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

-- >>> claim with capacity first
create or replace function public.claim_amordle_ranked_practice_v2(
  p_request_id text,
  p_action_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.multiplayer_matchmaking_queue%rowtype;
  v_candidate public.multiplayer_matchmaking_queue%rowtype;
  v_scan public.multiplayer_matchmaking_queue%rowtype;
  v_block text;
  v_game_id text;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000', detail = 'AUTH_REQUIRED';
  end if;
  if nullif(p_request_id, '') is null or nullif(p_action_id, '') is null then
    raise exception 'INVALID_ARGUMENT' using errcode = '22023', detail = 'INVALID_ARGUMENT';
  end if;
  select * into v_request
  from public.multiplayer_matchmaking_queue queue_row
  where queue_row.id = p_request_id
  for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002', detail = 'NOT_FOUND';
  end if;
  if v_request.user_id <> v_user_id or v_request.authority_version <> 2
    or v_request.scope <> 'practice'
  then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'FORBIDDEN';
  end if;
  if v_request.status = 'matched' then
    return jsonb_build_object(
      'schemaVersion', 2,
      'requestId', v_request.id,
      'status', 'matched',
      'matchedGameId', coalesce(v_request.matched_game_id, v_request.matched_match_id),
      'idempotent', true
    );
  end if;
  if v_request.status <> 'queued' or coalesce(v_request.expires_at, now()) <= now() then
    if v_request.status = 'queued' then
      update public.multiplayer_matchmaking_queue set status = 'expired'
      where id = v_request.id;
    end if;
    return jsonb_build_object(
      'schemaVersion', 2,
      'requestId', v_request.id,
      'status', case when v_request.status = 'queued' then 'expired' else v_request.status end,
      'idempotent', false
    );
  end if;

  /*
   * v8.1-M1. Capacity is decided here, before a single row is written.
   *
   * It used to be decided in `finalize`, after this function had already paired the
   * players and reserved a game id — so a refusal stranded both of them on a match that
   * would never exist. Refusing here costs nothing: the caller simply stays queued and is
   * told why.
   */
  v_block := brrrdle_private.amordle_combat_capacity_block(
    v_user_id, true, v_request.time_limit_ms, v_request.rating_bucket
  );
  if v_block is not null then
    raise exception 'COMBAT_LIMIT' using errcode = '54000', detail = v_block;
  end if;

  /*
   * The opponent's capacity is checked too, and a full one is SKIPPED rather than
   * refused. Pairing with them would fail the same way; refusing outright would let one
   * player at their limit block the whole queue for everyone behind them.
   */
  v_candidate := null;
  for v_scan in
    select *
    from public.multiplayer_matchmaking_queue candidate
    where candidate.authority_version = 2
      and candidate.status = 'queued'
      and candidate.id <> v_request.id
      and candidate.user_id <> v_user_id
      and coalesce(candidate.expires_at, now() + interval '1 second') > now()
      and candidate.transport = 'async'
      and candidate.scope = 'practice'
      and candidate.mode = v_request.mode
      and candidate.word_length = v_request.word_length
      and candidate.difficulty = v_request.difficulty
      and candidate.hard_mode is not distinct from v_request.hard_mode
      and candidate.go_puzzle_count is not distinct from v_request.go_puzzle_count
      and candidate.time_limit_ms is not distinct from v_request.time_limit_ms
      and candidate.rating_bucket = v_request.rating_bucket
    order by candidate.queued_at, candidate.id
    for update skip locked
    limit 20
  loop
    if brrrdle_private.amordle_combat_capacity_block(
      v_scan.user_id, true, v_request.time_limit_ms, v_request.rating_bucket
    ) is null then
      v_candidate := v_scan;
      exit;
    end if;
  end loop;

  if v_candidate.id is null then
    return jsonb_build_object(
      'schemaVersion', 2,
      'requestId', v_request.id,
      'status', 'queued',
      'queuedAt', v_request.queued_at,
      'expiresAt', v_request.expires_at,
      'idempotent', false
    );
  end if;

  v_game_id := 'amordle-combat-v2-' || extensions.gen_random_uuid()::text;
  insert into brrrdle_private.amordle_ranked_practice_reservations (
    game_id,
    request_one_id,
    request_two_id,
    player_one_user_id,
    player_two_user_id,
    mode,
    word_length,
    difficulty,
    hard_mode,
    go_puzzle_count,
    time_limit_ms,
    rating_bucket
  ) values (
    v_game_id,
    case when v_candidate.queued_at < v_request.queued_at
      or (v_candidate.queued_at = v_request.queued_at and v_candidate.id < v_request.id)
      then v_candidate.id else v_request.id end,
    case when v_candidate.queued_at < v_request.queued_at
      or (v_candidate.queued_at = v_request.queued_at and v_candidate.id < v_request.id)
      then v_request.id else v_candidate.id end,
    case when v_candidate.queued_at < v_request.queued_at
      or (v_candidate.queued_at = v_request.queued_at and v_candidate.id < v_request.id)
      then v_candidate.user_id else v_request.user_id end,
    case when v_candidate.queued_at < v_request.queued_at
      or (v_candidate.queued_at = v_request.queued_at and v_candidate.id < v_request.id)
      then v_request.user_id else v_candidate.user_id end,
    v_request.mode,
    v_request.word_length,
    v_request.difficulty,
    v_request.hard_mode,
    v_request.go_puzzle_count,
    v_request.time_limit_ms,
    v_request.rating_bucket
  );
  update public.multiplayer_matchmaking_queue
  set
    status = 'matched',
    matched_match_id = v_game_id,
    matched_game_id = v_game_id,
    matched_at = now()
  where id in (v_request.id, v_candidate.id);

  return jsonb_build_object(
    'schemaVersion', 2,
    'requestId', v_request.id,
    'status', 'matched',
    'matchedGameId', v_game_id,
    'idempotent', false
  );
end;
$$;

