-- Amordle: bound the coin award path.
--
-- WHAT THIS DOES, AND WHAT IT DOES NOT DO.
--
-- Before this migration `credit_player_economy_coins(p_amount, p_operation_id)`
-- was granted to `authenticated`. The browser chose both the amount and the
-- operation id, so a signed-in caller could award themselves up to 10000 coins
-- per call and repeat with a fresh operation id indefinitely. The reward
-- amount was never derived from anything the server held.
--
-- After this migration the award is derived server-side from the
-- `game_history` row the client has already written, and the operation id is
-- derived from that row's id rather than accepted from the caller — so one
-- recorded game can be paid exactly once, forever.
--
-- THIS BOUNDS THE EXPOSURE. IT DOES NOT REMOVE IT.
--
-- `game_history` is owner-insertable and owner-updatable under the RLS added in
-- 20260526012500_phase8_accounts.sql (lines 46-48), and `entry` is free-form
-- jsonb. A determined caller can therefore still write a plausible game row and
-- claim its reward. What changes is the ceiling and the effort:
--
--   before:  10000 coins per call, unbounded calls, nothing written down
--   after:   at most 48 coins per fabricated row (a won GO game with all ten
--            puzzles solved: 8 + 10 * 4), one payment per row id, and the
--            fabricated row is visible in the player's own History
--
-- Closing it completely means the server holding the Solo session — a Solo
-- authority table, guesses written server-side, and the loss of offline play.
-- That is deliberately out of scope; see the assessment recorded in
-- progress/run_state.json under serverSidePricingAssessment. Do not describe
-- this migration as making the economy tamper-proof. It does not.
--
-- The continuation spend stays client-priced on purpose, so
-- `spend_player_economy_coins` keeps its grant.

/*
 * The reward formula, mirroring soloReward() in src/adapters/cloud/solo.ts.
 *
 * Two copies of an arithmetic rule drift silently, which is what happened to
 * the consumable vocabulary before v10 caught it. So this one is pinned by
 * tests/domain/solo-reward-contract.test.ts, which reads THIS FILE and compares
 * it against the TypeScript — not against a restated copy of either.
 *
 * Only Solo earns coins. Combat rows are written with rewardCoins 0 by
 * match-controller.tsx and settle their value as rating instead, so any
 * non-Solo kind derives to zero here rather than being rejected: a zero-value
 * claim is not an error, it is simply nothing to pay.
 */
create or replace function brrrdle_private.amordle_solo_reward_coins(p_entry jsonb)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_kind text := p_entry->>'kind';
  v_mode text := p_entry->>'mode';
  v_result text := p_entry->>'result';
  v_go_count integer;
  v_max_puzzles integer;
  v_solved integer;
begin
  if v_kind is null or v_kind not in ('solo-practice', 'solo-daily') then
    return 0;
  end if;
  if v_result is null or v_result not in ('won', 'lost') then
    return 0;
  end if;

  /*
   * The clamp is the point. `puzzlesSolved` arrives from the same owner-writable
   * row as everything else, so it is bounded by what the declared mode could
   * physically have produced before it is allowed to price anything. A v1 entry
   * carries no goPuzzleCount, so a GO game without one is capped at the largest
   * legal chain rather than trusted.
   */
  begin
    v_go_count := nullif(p_entry->>'goPuzzleCount', '')::integer;
  exception when others then
    v_go_count := null;
  end;

  if v_mode = 'go' then
    v_max_puzzles := case when v_go_count in (5, 7, 10) then v_go_count else 10 end;
  else
    v_max_puzzles := 1;
  end if;

  begin
    v_solved := coalesce(nullif(p_entry->>'puzzlesSolved', '')::integer, 0);
  exception when others then
    v_solved := 0;
  end;
  v_solved := greatest(0, least(v_solved, v_max_puzzles));

  if v_result = 'won' then
    return 8 + v_solved * 4;
  end if;
  return least(4, v_solved);
end;
$$;

/*
 * The operation id is derived, never accepted.
 *
 * This reproduces rewardOperationId() in src/adapters/cloud/account.ts on
 * purpose rather than inventing a cleaner scheme. Every reward already paid
 * under the old client-side path is recorded in player_economy_operations under
 * exactly these ids, and the operations table's primary key is
 * (user_id, operation_id). Matching the old scheme means a historical game
 * claimed through the new RPC finds its existing operation row and returns
 * applied = false. Inventing a new scheme would have paid every game in every
 * account's history a second time, once, silently.
 */
create or replace function brrrdle_private.amordle_reward_operation_id(p_history_row_id text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_history_row_id like 'solo:%'
      then 'solo-reward:' || substring(p_history_row_id from 6)
    else 'completion-reward:' || p_history_row_id
  end;
$$;

create or replace function public.claim_game_reward_v1(p_history_row_id text)
returns table (
  applied boolean,
  coins integer,
  operation_id text,
  remove_incorrect_letters integer,
  reveal_one_letter integer,
  revision bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_entry jsonb;
  v_coins integer;
  v_operation_id text;
  v_state public.player_economy_state%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_history_row_id is null or char_length(btrim(p_history_row_id)) not between 1 and 180 then
    raise exception 'Invalid game' using errcode = '22023';
  end if;

  -- Owner-scoped by the predicate as well as by RLS. The function is security
  -- definer, so the predicate is the thing actually doing the work here.
  select history.entry
  into v_entry
  from public.game_history history
  where history.id = p_history_row_id
    and history.user_id = v_user_id;

  if v_entry is null then
    raise exception 'Unknown game' using errcode = '22023';
  end if;

  v_coins := brrrdle_private.amordle_solo_reward_coins(v_entry);
  v_operation_id := brrrdle_private.amordle_reward_operation_id(p_history_row_id);

  -- Nothing to pay is a normal outcome, not a failure: every COMBAT row and
  -- every scoreless loss lands here. Return the current balance unchanged so
  -- the caller can still refresh its cache from one round trip.
  if v_coins <= 0 then
    perform public.phase57_ensure_player_economy_state(v_user_id);
    select * into v_state from public.player_economy_state where user_id = v_user_id;
    return query select
      false,
      v_state.coins,
      v_operation_id,
      v_state.remove_incorrect_letters,
      v_state.reveal_one_letter,
      v_state.revision;
    return;
  end if;

  return query
  select *
  from public.phase57_apply_player_economy_operation(v_operation_id, 'award', v_coins);
end;
$$;

comment on function public.claim_game_reward_v1(text)
  is 'Amordle 2026-08-18. Awards the coins a recorded game is worth, derived server-side from the stored game_history entry and keyed on a server-derived operation id so one row pays once. Bounds the award path; does not make it unforgeable, because game_history.entry is owner-writable.';

revoke all on function brrrdle_private.amordle_solo_reward_coins(jsonb)
  from public, anon, authenticated;
revoke all on function brrrdle_private.amordle_reward_operation_id(text)
  from public, anon, authenticated;
revoke all on function public.claim_game_reward_v1(text)
  from public, anon, authenticated;
grant execute on function public.claim_game_reward_v1(text) to authenticated;

-- The open award path closes here. Nothing in the application called it except
-- finalizeAccountHistoryRow, which now calls claim_game_reward_v1 instead.
-- The function itself is left in place rather than dropped: the internal
-- apply-operation function is what actually performs an award, and dropping a
-- function that a future migration might reasonably re-grant is a louder change
-- than removing the grant that made it reachable.
revoke all on function public.credit_player_economy_coins(integer, text)
  from public, anon, authenticated;

comment on function public.credit_player_economy_coins(integer, text)
  is 'Amordle 2026-08-18: NO LONGER GRANTED to authenticated. The browser chose its own award amount here. Coin awards now go through claim_game_reward_v1, which derives the amount from the recorded game. Do not re-grant this to a browser role.';
