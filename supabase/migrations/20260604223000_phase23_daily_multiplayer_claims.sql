-- Phase 23 stabilization follow-up: Daily Multiplayer claims and live host profiles.
-- Apply after the Phase 23 online-multiplayer stabilization migrations. The
-- app also enforces these rules client-side, but this migration gives Supabase
-- the same "one Daily Multiplayer claim per user/day/transport/mode" invariant.

alter table public.live_lobbies
  add column if not exists host_profile jsonb;

create table if not exists public.multiplayer_daily_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  transport text not null check (transport in ('async', 'live')),
  mode text not null check (mode in ('og', 'go')),
  daily_date_key text not null,
  source_kind text not null,
  source_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, transport, mode, daily_date_key)
);

alter table public.multiplayer_daily_claims enable row level security;

drop policy if exists "Users can read own daily multiplayer claims" on public.multiplayer_daily_claims;
create policy "Users can read own daily multiplayer claims"
  on public.multiplayer_daily_claims for select
  using (auth.uid() = user_id);

create or replace function public.claim_daily_multiplayer_participation(
  p_user_id text,
  p_transport text,
  p_mode text,
  p_daily_date_key text,
  p_source_kind text,
  p_source_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if p_user_id is null or p_user_id = '' or p_daily_date_key is null or p_daily_date_key = '' or p_source_id is null or p_source_id = '' then
    return;
  end if;

  begin
    v_user_id := p_user_id::uuid;
  exception
    when invalid_text_representation then
      return;
  end;

  insert into public.multiplayer_daily_claims (
    user_id,
    transport,
    mode,
    daily_date_key,
    source_kind,
    source_id,
    updated_at
  )
  values (
    v_user_id,
    p_transport,
    p_mode,
    p_daily_date_key,
    p_source_kind,
    p_source_id,
    now()
  )
  on conflict (user_id, transport, mode, daily_date_key)
  do update set
    source_kind = excluded.source_kind,
    source_id = excluded.source_id,
    updated_at = now()
  where public.multiplayer_daily_claims.source_id = excluded.source_id;

  if not found then
    raise exception 'Daily Multiplayer already claimed for user %, transport %, mode %, date %',
      v_user_id,
      p_transport,
      p_mode,
      p_daily_date_key
      using errcode = '23505';
  end if;
end;
$$;

create or replace function public.enforce_async_daily_multiplayer_claim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.scope = 'daily' then
    perform public.claim_daily_multiplayer_participation(new.host_user_id::text, 'async', new.mode, new.daily_date_key, 'async_game', new.id);
    perform public.claim_daily_multiplayer_participation(new.player_one_user_id::text, 'async', new.mode, new.daily_date_key, 'async_game', new.id);
    perform public.claim_daily_multiplayer_participation(new.player_two_user_id::text, 'async', new.mode, new.daily_date_key, 'async_game', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_async_daily_multiplayer_claim_trigger on public.async_multiplayer_games;
create trigger enforce_async_daily_multiplayer_claim_trigger
  before insert or update of scope, mode, daily_date_key, host_user_id, player_one_user_id, player_two_user_id
  on public.async_multiplayer_games
  for each row
  execute function public.enforce_async_daily_multiplayer_claim();

create or replace function public.enforce_live_lobby_daily_multiplayer_claim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.scope = 'daily' then
    perform public.claim_daily_multiplayer_participation(new.host_user_id::text, 'live', new.mode, new.daily_date_key, 'live_lobby', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_live_lobby_daily_multiplayer_claim_trigger on public.live_lobbies;
create trigger enforce_live_lobby_daily_multiplayer_claim_trigger
  before insert or update of scope, mode, daily_date_key, host_user_id
  on public.live_lobbies
  for each row
  execute function public.enforce_live_lobby_daily_multiplayer_claim();

create or replace function public.enforce_live_match_daily_multiplayer_claim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_id text;
begin
  if new.scope = 'daily' then
    v_source_id := coalesce(new.lobby_id, new.id);
    perform public.claim_daily_multiplayer_participation(new.projection #>> '{playerUserIds,player-one}', 'live', new.mode, new.daily_date_key, 'live_match', v_source_id);
    perform public.claim_daily_multiplayer_participation(new.projection #>> '{playerUserIds,player-two}', 'live', new.mode, new.daily_date_key, 'live_match', v_source_id);
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_live_match_daily_multiplayer_claim_trigger on public.live_matches;
create trigger enforce_live_match_daily_multiplayer_claim_trigger
  before insert or update of scope, mode, daily_date_key, projection
  on public.live_matches
  for each row
  execute function public.enforce_live_match_daily_multiplayer_claim();

grant select on table public.multiplayer_daily_claims to authenticated;
grant execute on function public.claim_daily_multiplayer_participation(text, text, text, text, text, text) to authenticated;
