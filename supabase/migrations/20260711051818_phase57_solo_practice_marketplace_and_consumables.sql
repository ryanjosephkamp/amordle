-- Phase 57: private, idempotent coin and Solo-Practice consumable authority.

create table if not exists public.player_economy_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  coins integer not null default 0 check (coins >= 0),
  reveal_one_letter integer not null default 0 check (reveal_one_letter >= 0),
  remove_incorrect_letters integer not null default 0 check (remove_incorrect_letters >= 0),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.player_economy_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id text not null,
  operation_type text not null check (operation_type in ('award', 'spend', 'purchase', 'consume')),
  consumable_type text check (consumable_type is null or consumable_type in ('revealOneLetter', 'removeIncorrectLetters')),
  amount integer not null default 0 check (amount >= 0),
  coins integer not null check (coins >= 0),
  reveal_one_letter integer not null check (reveal_one_letter >= 0),
  remove_incorrect_letters integer not null check (remove_incorrect_letters >= 0),
  revision bigint not null check (revision >= 0),
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id),
  constraint player_economy_operations_id_length check (char_length(operation_id) between 1 and 200)
);

create index if not exists player_economy_operations_user_created_idx
  on public.player_economy_operations (user_id, created_at desc);

alter table public.player_economy_state enable row level security;
alter table public.player_economy_operations enable row level security;

drop policy if exists "Economy state owner read" on public.player_economy_state;
create policy "Economy state owner read" on public.player_economy_state
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Economy operation owner read" on public.player_economy_operations;
create policy "Economy operation owner read" on public.player_economy_operations
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.player_economy_state from public, anon, authenticated;
revoke all on table public.player_economy_operations from public, anon, authenticated;

create or replace function public.phase57_ensure_player_economy_state(p_user_id uuid)
returns public.player_economy_state
language plpgsql security definer set search_path = ''
as $$
declare v_state public.player_economy_state%rowtype; v_progress jsonb;
begin
  if p_user_id is null or p_user_id is distinct from (select auth.uid()) then raise exception 'Authentication required'; end if;
  select progress into v_progress from public.progress_snapshots where user_id = p_user_id;
  insert into public.player_economy_state (user_id, coins, reveal_one_letter, remove_incorrect_letters, revision)
  values (
    p_user_id,
    greatest(0, coalesce((v_progress->'progression'->>'coins')::integer, 0)),
    greatest(0, coalesce((v_progress->'progression'->'consumables'->>'revealOneLetter')::integer, 0)),
    greatest(0, coalesce((v_progress->'progression'->'consumables'->>'removeIncorrectLetters')::integer, 0)),
    greatest(0, coalesce((v_progress->'progression'->>'economyRevision')::bigint, 0))
  ) on conflict (user_id) do nothing;
  select * into v_state from public.player_economy_state where user_id = p_user_id;
  return v_state;
end;
$$;

create or replace function public.phase57_apply_player_economy_operation(
  p_operation_id text, p_operation_type text, p_amount integer default 0,
  p_consumable_type text default null, p_scope text default null
)
returns table (
  applied boolean, coins integer, operation_id text, remove_incorrect_letters integer,
  reveal_one_letter integer, revision bigint
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_state public.player_economy_state%rowtype;
  v_existing public.player_economy_operations%rowtype;
  v_cost integer := 0;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_operation_id is null or char_length(btrim(p_operation_id)) not between 1 and 200 then raise exception 'Invalid operation'; end if;
  perform public.phase57_ensure_player_economy_state(v_user_id);
  select * into v_state from public.player_economy_state where user_id = v_user_id for update;
  select * into v_existing from public.player_economy_operations
    where user_id = v_user_id and player_economy_operations.operation_id = p_operation_id;
  if found then
    return query select false, v_existing.coins, v_existing.operation_id,
      v_existing.remove_incorrect_letters, v_existing.reveal_one_letter, v_existing.revision;
    return;
  end if;
  if p_operation_type = 'award' then
    if p_amount <= 0 or p_amount > 10000 then raise exception 'Invalid amount'; end if;
    v_state.coins := v_state.coins + p_amount;
  elsif p_operation_type = 'spend' then
    if p_amount <= 0 or p_amount > 10000 then raise exception 'Invalid amount'; end if;
    if v_state.coins < p_amount then raise exception 'Insufficient coins'; end if;
    v_state.coins := v_state.coins - p_amount;
  elsif p_operation_type = 'purchase' then
    v_cost := case p_consumable_type
      when 'revealOneLetter' then 25
      when 'removeIncorrectLetters' then 40
      else 0
    end;
    if v_cost = 0 then raise exception 'Invalid consumable'; end if;
    if v_state.coins < v_cost then raise exception 'Insufficient coins'; end if;
    v_state.coins := v_state.coins - v_cost;
    if p_consumable_type = 'revealOneLetter' then v_state.reveal_one_letter := v_state.reveal_one_letter + 1;
    else v_state.remove_incorrect_letters := v_state.remove_incorrect_letters + 1; end if;
  elsif p_operation_type = 'consume' then
    if p_scope is null or p_scope <> 'practice' then raise exception 'Practice only'; end if;
    if p_consumable_type = 'revealOneLetter' then
      if v_state.reveal_one_letter <= 0 then raise exception 'Insufficient inventory'; end if;
      v_state.reveal_one_letter := v_state.reveal_one_letter - 1;
    elsif p_consumable_type = 'removeIncorrectLetters' then
      if v_state.remove_incorrect_letters <= 0 then raise exception 'Insufficient inventory'; end if;
      v_state.remove_incorrect_letters := v_state.remove_incorrect_letters - 1;
    else raise exception 'Invalid consumable'; end if;
  else raise exception 'Invalid operation'; end if;
  v_state.revision := v_state.revision + 1;
  v_state.updated_at := now();
  update public.player_economy_state set
    coins = v_state.coins, reveal_one_letter = v_state.reveal_one_letter,
    remove_incorrect_letters = v_state.remove_incorrect_letters,
    revision = v_state.revision, updated_at = v_state.updated_at
  where user_id = v_user_id;
  insert into public.player_economy_operations (
    user_id, operation_id, operation_type, consumable_type, amount,
    coins, reveal_one_letter, remove_incorrect_letters, revision
  ) values (
    v_user_id, p_operation_id, p_operation_type, p_consumable_type,
    case when p_operation_type = 'purchase' then v_cost else greatest(0, coalesce(p_amount, 0)) end,
    v_state.coins, v_state.reveal_one_letter, v_state.remove_incorrect_letters, v_state.revision
  );
  return query select true, v_state.coins, p_operation_id,
    v_state.remove_incorrect_letters, v_state.reveal_one_letter, v_state.revision;
end;
$$;

create or replace function public.get_player_economy_state()
returns table (applied boolean, coins integer, operation_id text, remove_incorrect_letters integer, reveal_one_letter integer, revision bigint)
language plpgsql security definer set search_path = ''
as $$
declare v_state public.player_economy_state%rowtype;
begin
  v_state := public.phase57_ensure_player_economy_state((select auth.uid()));
  return query select false, v_state.coins, ''::text, v_state.remove_incorrect_letters, v_state.reveal_one_letter, v_state.revision;
end;
$$;

create or replace function public.credit_player_economy_coins(p_amount integer, p_operation_id text)
returns table (applied boolean, coins integer, operation_id text, remove_incorrect_letters integer, reveal_one_letter integer, revision bigint)
language sql security definer set search_path = '' as $$
  select * from public.phase57_apply_player_economy_operation(p_operation_id, 'award', p_amount);
$$;
create or replace function public.spend_player_economy_coins(p_amount integer, p_operation_id text)
returns table (applied boolean, coins integer, operation_id text, remove_incorrect_letters integer, reveal_one_letter integer, revision bigint)
language sql security definer set search_path = '' as $$
  select * from public.phase57_apply_player_economy_operation(p_operation_id, 'spend', p_amount);
$$;
create or replace function public.purchase_solo_practice_consumable(p_consumable_type text, p_operation_id text)
returns table (applied boolean, coins integer, operation_id text, remove_incorrect_letters integer, reveal_one_letter integer, revision bigint)
language sql security definer set search_path = '' as $$
  select * from public.phase57_apply_player_economy_operation(p_operation_id, 'purchase', 0, p_consumable_type);
$$;
create or replace function public.consume_solo_practice_consumable(p_consumable_type text, p_operation_id text, p_scope text)
returns table (applied boolean, coins integer, operation_id text, remove_incorrect_letters integer, reveal_one_letter integer, revision bigint)
language sql security definer set search_path = '' as $$
  select * from public.phase57_apply_player_economy_operation(p_operation_id, 'consume', 0, p_consumable_type, p_scope);
$$;

revoke all on function public.phase57_ensure_player_economy_state(uuid) from public, anon, authenticated;
revoke all on function public.phase57_apply_player_economy_operation(text, text, integer, text, text) from public, anon, authenticated;
revoke all on function public.get_player_economy_state() from public, anon, authenticated;
revoke all on function public.credit_player_economy_coins(integer, text) from public, anon, authenticated;
revoke all on function public.spend_player_economy_coins(integer, text) from public, anon, authenticated;
revoke all on function public.purchase_solo_practice_consumable(text, text) from public, anon, authenticated;
revoke all on function public.consume_solo_practice_consumable(text, text, text) from public, anon, authenticated;
grant execute on function public.get_player_economy_state() to authenticated;
grant execute on function public.credit_player_economy_coins(integer, text) to authenticated;
grant execute on function public.spend_player_economy_coins(integer, text) to authenticated;
grant execute on function public.purchase_solo_practice_consumable(text, text) to authenticated;
grant execute on function public.consume_solo_practice_consumable(text, text, text) to authenticated;
