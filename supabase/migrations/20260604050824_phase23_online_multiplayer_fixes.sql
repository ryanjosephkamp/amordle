-- Phase 23 Stage 3 stabilization: true online async/live transport fixes.
-- Apply after the Stage 2 live migration and Stage 3 competitive migration.
-- This keeps gameplay/rating logic client-facing but moves async match state
-- into durable Supabase rows and allows a second authenticated user to claim a
-- waiting live lobby.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.async_multiplayer_games (
  id text primary key default ('async-game-' || gen_random_uuid()::text),
  scope text not null check (scope in ('practice', 'daily')),
  mode text not null check (mode in ('og', 'go')),
  daily_date_key text,
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'won', 'lost', 'expired')),
  current_turn text not null default 'player-one' check (current_turn in ('player-one', 'player-two')),
  word_length integer not null default 5,
  difficulty text not null default 'medium',
  go_puzzle_count integer,
  host_user_id uuid not null references auth.users(id) on delete cascade,
  player_one_user_id uuid references auth.users(id) on delete cascade,
  player_two_user_id uuid references auth.users(id) on delete cascade,
  ranked boolean not null default false,
  rating_bucket text check (rating_bucket in ('async:og', 'async:go', 'live:og', 'live:go')),
  matchmaking_request_id text,
  custom_game_code text,
  winner_player_id text check (winner_player_id in ('player-one', 'player-two')),
  deadline_at timestamptz,
  ended_at timestamptz,
  projection jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (player_one_user_id is null or player_two_user_id is null or player_one_user_id <> player_two_user_id)
);

create index if not exists async_multiplayer_games_lookup_idx
  on public.async_multiplayer_games (scope, mode, status, daily_date_key, updated_at desc);

create index if not exists async_multiplayer_games_player_one_idx
  on public.async_multiplayer_games (player_one_user_id, updated_at desc);

create index if not exists async_multiplayer_games_player_two_idx
  on public.async_multiplayer_games (player_two_user_id, updated_at desc);

alter table public.async_multiplayer_games enable row level security;

drop policy if exists "Authenticated users can read async games" on public.async_multiplayer_games;
create policy "Authenticated users can read async games"
  on public.async_multiplayer_games for select
  using (
    auth.role() = 'authenticated'
    and (
      status = 'waiting'
      or host_user_id = auth.uid()
      or player_one_user_id = auth.uid()
      or player_two_user_id = auth.uid()
    )
  );

drop policy if exists "Users can create own async games" on public.async_multiplayer_games;
create policy "Users can create own async games"
  on public.async_multiplayer_games for insert
  with check (
    auth.uid() = host_user_id
    and (player_one_user_id is null or player_one_user_id = auth.uid())
    and player_two_user_id is null
  );

drop policy if exists "Async participants can update their games" on public.async_multiplayer_games;
create policy "Async participants can update their games"
  on public.async_multiplayer_games for update
  using (
    host_user_id = auth.uid()
    or player_one_user_id = auth.uid()
    or player_two_user_id = auth.uid()
    or status = 'waiting'
  )
  with check (
    host_user_id = auth.uid()
    or player_one_user_id = auth.uid()
    or player_two_user_id = auth.uid()
  );

drop policy if exists "Lobby owners can update own live lobbies" on public.live_lobbies;
drop policy if exists "Lobby owners and joiners can update live lobbies" on public.live_lobbies;
create policy "Lobby owners and joiners can update live lobbies"
  on public.live_lobbies for update
  using (
    auth.uid() = host_user_id
    or (
      auth.role() = 'authenticated'
      and status = 'waiting'
      and host_user_id <> auth.uid()
    )
  )
  with check (
    auth.uid() = host_user_id
    or (
      auth.role() = 'authenticated'
      and status = 'matched'
      and host_user_id <> auth.uid()
    )
  );

do $$
begin
  alter publication supabase_realtime add table public.async_multiplayer_games;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
