-- Amordle: make the Daily unlock atomic, and move the entitlement out of the
-- owner-writable progress snapshot.
--
-- Before this migration a Daily unlock was two unrelated operations issued by
-- the browser: a 60-coin spend whose amount and operation id the client chose,
-- and a separate write of `dailyEntitlements` into `progress_snapshots`, a
-- table the owner may update directly (20260526012500_phase8_accounts.sql,
-- lines 43-44). Nothing tied the payment to the grant. Either could happen
-- without the other, and the entitlement is what `canLoadDailyAnswers` in
-- src/server/identity.ts consults before the server will render a past Daily's
-- answers.
--
-- After this migration the price is a server-side constant, the charge and the
-- grant happen in one transaction, and the entitlement lives in a table no
-- browser role can write.
--
-- Unlike the reward path, this one closes properly. The price is fixed rather
-- than a function of live Solo state, so the server needs nothing it does not
-- already have.

create table if not exists public.player_daily_entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  mode text not null check (mode in ('og', 'go')),
  state text not null default 'pending' check (state in ('pending', 'unlocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, local_date, mode)
);

alter table public.player_daily_entitlements enable row level security;

drop policy if exists "Daily entitlement owner read" on public.player_daily_entitlements;
create policy "Daily entitlement owner read" on public.player_daily_entitlements
  for select to authenticated using ((select auth.uid()) = user_id);

-- Same posture as player_economy_state: the policy documents ownership, and the
-- revoke is what actually keeps the browser out. Every read goes through the
-- listing RPC below and every write through the two RPCs below that.
revoke all on table public.player_daily_entitlements from public, anon, authenticated;

/*
 * The price, on the server, once.
 *
 * ECONOMY_PRICES.dailyUnlock in src/domain/economy.ts still carries 60 because
 * the confirmation dialog has to tell the player what they are about to spend
 * before they spend it. That copy is now a label. This one is the price.
 * tests/domain/daily-entitlement-contract.test.ts reads this file and requires
 * the two to agree.
 */
create or replace function brrrdle_private.amordle_daily_unlock_price()
returns integer
language sql
immutable
set search_path = ''
as $$ select 60; $$;

create or replace function public.unlock_daily_entitlement_v1(
  p_local_date date,
  p_mode text
)
returns table (
  applied boolean,
  coins integer,
  operation_id text,
  remove_incorrect_letters integer,
  reveal_one_letter integer,
  revision bigint,
  state text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_mode text := lower(btrim(coalesce(p_mode, '')));
  v_price integer := brrrdle_private.amordle_daily_unlock_price();
  v_operation_id text;
  v_existing public.player_daily_entitlements%rowtype;
  v_economy record;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if v_mode not in ('og', 'go') then
    raise exception 'Unsupported Daily mode' using errcode = '22023';
  end if;
  if p_local_date is null then
    raise exception 'Choose a Daily date' using errcode = '22023';
  end if;
  /*
   * The server cannot know the caller's local date, so it cannot enforce "must
   * be in the past" — that stays a client rule, and it is a UX rule rather than
   * a value rule, because today's Daily is free and a future one is refused by
   * DailyAccessGate whatever the entitlement says. What the server can do is
   * refuse a date that is in the future for every timezone on earth, which is
   * what this bound is. +1 day covers UTC+14.
   */
  if p_local_date > (current_date + 1) then
    raise exception 'That Daily has not happened yet' using errcode = '22023';
  end if;

  select * into v_existing
  from public.player_daily_entitlements
  where user_id = v_user_id and local_date = p_local_date and mode = v_mode;

  -- Already held. Charge nothing and report the balance, so a double tap on a
  -- slow connection cannot be billed twice.
  if found then
    perform public.phase57_ensure_player_economy_state(v_user_id);
    return query
    select
      false,
      economy_state.coins,
      ''::text,
      economy_state.remove_incorrect_letters,
      economy_state.reveal_one_letter,
      economy_state.revision,
      v_existing.state
    from public.player_economy_state economy_state
    where economy_state.user_id = v_user_id;
    return;
  end if;

  /*
   * Deterministic, so the charge is idempotent on the same terms the grant is.
   * This is the id the old client-side path used, which matters for a player
   * who paid before this migration and whose entitlement is backfilled below:
   * their operation row already exists, so a re-unlock cannot bill them again.
   */
  v_operation_id := 'daily-unlock:' || to_char(p_local_date, 'YYYY-MM-DD') || ':' || v_mode;

  -- One transaction. The spend raises 'Insufficient coins' and takes the insert
  -- with it, which is the whole point of the migration.
  select * into v_economy
  from public.phase57_apply_player_economy_operation(v_operation_id, 'spend', v_price);

  insert into public.player_daily_entitlements (user_id, local_date, mode, state)
  values (v_user_id, p_local_date, v_mode, 'pending')
  on conflict (user_id, local_date, mode) do nothing;

  return query select
    v_economy.applied,
    v_economy.coins,
    v_economy.operation_id,
    v_economy.remove_incorrect_letters,
    v_economy.reveal_one_letter,
    v_economy.revision,
    'pending'::text;
end;
$$;

/*
 * Pending becomes unlocked on the first accepted saved guess. No charge: the
 * coins were taken at unlock, and this only records that the player used what
 * they bought. It cannot create an entitlement, only advance one.
 */
create or replace function public.mark_daily_entitlement_unlocked_v1(
  p_local_date date,
  p_mode text
)
returns table (local_date date, mode text, state text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_mode text := lower(btrim(coalesce(p_mode, '')));
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if v_mode not in ('og', 'go') or p_local_date is null then
    raise exception 'Unsupported Daily' using errcode = '22023';
  end if;

  return query
  update public.player_daily_entitlements entitlement
  set state = 'unlocked', updated_at = now()
  where entitlement.user_id = v_user_id
    and entitlement.local_date = p_local_date
    and entitlement.mode = v_mode
    and entitlement.state = 'pending'
  returning entitlement.local_date, entitlement.mode, entitlement.state;
end;
$$;

create or replace function public.list_my_daily_entitlements_v1()
returns table (local_date date, mode text, state text)
language sql
stable
security definer
set search_path = ''
as $$
  select entitlement.local_date, entitlement.mode, entitlement.state
  from public.player_daily_entitlements entitlement
  where entitlement.user_id = (select auth.uid())
  order by entitlement.local_date desc, entitlement.mode;
$$;

/*
 * Backfill, so nobody loses a Daily they already paid for.
 *
 * Two sources, because two carry the field: the progress snapshot, and the
 * account-state continuity row in game_history that src/server/identity.ts
 * reads when the snapshot is missing. Unlocked wins over pending, so the
 * unlocked pass runs first and the pending pass takes the conflict as a no-op.
 *
 * Rows are filtered by shape rather than trusted: a key has to look like
 * `YYYY-MM-DD:og|go` and the value has to be one of the two known states.
 * These come out of an owner-writable column, so a malformed one is a fact
 * about the data, not an exception worth failing a migration for.
 */
insert into public.player_daily_entitlements (user_id, local_date, mode, state)
select
  source.user_id,
  (split_part(source.key, ':', 1))::date,
  split_part(source.key, ':', 2),
  'unlocked'
from (
  select snapshot.user_id, entitlement.key, entitlement.value
  from public.progress_snapshots snapshot
  cross join lateral jsonb_each(
    case
      when jsonb_typeof(snapshot.progress->'dailyEntitlements') = 'object'
        then snapshot.progress->'dailyEntitlements'
      else '{}'::jsonb
    end
  ) entitlement
  union all
  select history.user_id, entitlement.key, entitlement.value
  from public.game_history history
  cross join lateral jsonb_each(
    case
      when jsonb_typeof(history.entry->'progress'->'dailyEntitlements') = 'object'
        then history.entry->'progress'->'dailyEntitlements'
      else '{}'::jsonb
    end
  ) entitlement
  where history.id = 'amordle-account-state-v1:' || history.user_id::text
) source
where source.key ~ '^\d{4}-\d{2}-\d{2}:(og|go)$'
  and source.value #>> '{}' = 'unlocked'
on conflict (user_id, local_date, mode) do nothing;

insert into public.player_daily_entitlements (user_id, local_date, mode, state)
select
  source.user_id,
  (split_part(source.key, ':', 1))::date,
  split_part(source.key, ':', 2),
  'pending'
from (
  select snapshot.user_id, entitlement.key, entitlement.value
  from public.progress_snapshots snapshot
  cross join lateral jsonb_each(
    case
      when jsonb_typeof(snapshot.progress->'dailyEntitlements') = 'object'
        then snapshot.progress->'dailyEntitlements'
      else '{}'::jsonb
    end
  ) entitlement
  union all
  select history.user_id, entitlement.key, entitlement.value
  from public.game_history history
  cross join lateral jsonb_each(
    case
      when jsonb_typeof(history.entry->'progress'->'dailyEntitlements') = 'object'
        then history.entry->'progress'->'dailyEntitlements'
      else '{}'::jsonb
    end
  ) entitlement
  where history.id = 'amordle-account-state-v1:' || history.user_id::text
) source
where source.key ~ '^\d{4}-\d{2}-\d{2}:(og|go)$'
  and source.value #>> '{}' = 'pending'
on conflict (user_id, local_date, mode) do nothing;

revoke all on function brrrdle_private.amordle_daily_unlock_price()
  from public, anon, authenticated;
revoke all on function public.unlock_daily_entitlement_v1(date, text)
  from public, anon, authenticated;
revoke all on function public.mark_daily_entitlement_unlocked_v1(date, text)
  from public, anon, authenticated;
revoke all on function public.list_my_daily_entitlements_v1()
  from public, anon, authenticated;
grant execute on function public.unlock_daily_entitlement_v1(date, text) to authenticated;
grant execute on function public.mark_daily_entitlement_unlocked_v1(date, text) to authenticated;
grant execute on function public.list_my_daily_entitlements_v1() to authenticated;

comment on table public.player_daily_entitlements
  is 'Amordle 2026-08-18. Paid Daily access. No browser role can write this table; unlock_daily_entitlement_v1 charges and grants in one transaction.';
comment on function public.unlock_daily_entitlement_v1(date, text)
  is 'Amordle 2026-08-18. Charges the server-side Daily price and grants the entitlement in a single transaction. Idempotent on (user, date, mode).';
