-- Phase 23 Stage 3 competitive multiplayer foundation.
-- Apply after 20260604024500_phase23_live_multiplayer.sql.
-- This migration is additive: it records ranked/unranked metadata, matchmaking
-- queues, custom-game lobbies, immutable match results, player results, and
-- rating transaction audit rows without weakening the existing live projection
-- tables. Rating mutations should happen through trusted RPC/server flows; the
-- browser must not directly write arbitrary ELO deltas.

create extension if not exists pgcrypto with schema extensions;

alter table public.live_lobbies
  add column if not exists ranked boolean not null default false,
  add column if not exists rating_bucket text check (rating_bucket in ('async:og', 'async:go', 'live:og', 'live:go')),
  add column if not exists matchmaking_request_id text,
  add column if not exists custom_game_code text;

alter table public.live_matches
  add column if not exists ranked boolean not null default false,
  add column if not exists rating_bucket text check (rating_bucket in ('async:og', 'async:go', 'live:og', 'live:go')),
  add column if not exists matchmaking_request_id text,
  add column if not exists custom_game_code text;

create table if not exists public.multiplayer_rating_profiles (
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null check (bucket in ('async:og', 'async:go', 'live:og', 'live:go')),
  rating integer not null default 1200,
  games_played integer not null default 0 check (games_played >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  draws integer not null default 0 check (draws >= 0),
  provisional boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, bucket)
);

create table if not exists public.multiplayer_match_results (
  id text primary key default ('mp-result-' || gen_random_uuid()::text),
  source_match_id text not null,
  source_transport text not null check (source_transport in ('async', 'live')),
  mode text not null check (mode in ('og', 'go')),
  scope text not null check (scope in ('practice', 'daily')),
  daily_date_key text,
  ranked boolean not null default false,
  rating_bucket text check (rating_bucket in ('async:og', 'async:go', 'live:og', 'live:go')),
  terminal_status text not null check (terminal_status in ('completed', 'aborted', 'expired', 'corrupt')),
  winner_user_id uuid references auth.users(id) on delete set null,
  summary text not null default '',
  idempotency_key text not null unique,
  settled_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.multiplayer_player_results (
  match_result_id text not null references public.multiplayer_match_results(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  player_id text not null check (player_id in ('player-one', 'player-two')),
  outcome text not null check (outcome in ('win', 'loss', 'draw')),
  attempts_used integer not null default 0 check (attempts_used >= 0),
  puzzles_solved integer not null default 0 check (puzzles_solved >= 0),
  completed_at timestamptz,
  summary text not null default '',
  primary key (match_result_id, user_id),
  unique (match_result_id, player_id)
);

create table if not exists public.multiplayer_rating_transactions (
  id text primary key default ('mp-rating-' || gen_random_uuid()::text),
  match_result_id text not null references public.multiplayer_match_results(id) on delete cascade,
  bucket text not null check (bucket in ('async:og', 'async:go', 'live:og', 'live:go')),
  user_id uuid not null references auth.users(id) on delete cascade,
  opponent_user_id uuid not null references auth.users(id) on delete cascade,
  outcome text not null check (outcome in ('win', 'loss', 'draw')),
  old_rating integer not null,
  new_rating integer not null,
  rating_delta integer not null,
  expected_score numeric not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  unique (match_result_id, bucket, user_id)
);

create table if not exists public.multiplayer_matchmaking_queue (
  id text primary key default ('mp-queue-' || gen_random_uuid()::text),
  user_id uuid not null references auth.users(id) on delete cascade,
  transport text not null check (transport in ('async', 'live')),
  mode text not null check (mode in ('og', 'go')),
  scope text not null check (scope in ('practice', 'daily')),
  daily_date_key text,
  word_length integer,
  rating_bucket text not null check (rating_bucket in ('async:og', 'async:go', 'live:og', 'live:go')),
  rating_snapshot integer not null default 1200,
  ranked boolean not null default true,
  status text not null default 'queued' check (status in ('queued', 'matched', 'cancelled', 'expired')),
  matched_match_id text,
  idempotency_key text not null unique,
  queued_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.custom_game_lobbies (
  id text primary key default ('custom-game-' || gen_random_uuid()::text),
  code text not null unique,
  creator_user_id uuid references auth.users(id) on delete set null,
  transport text not null check (transport in ('async', 'live')),
  mode text not null check (mode in ('og', 'go')),
  scope text not null check (scope in ('practice', 'daily')),
  daily_date_key text,
  word_length integer,
  ranked boolean not null default false,
  status text not null default 'waiting' check (status in ('waiting', 'matched', 'expired', 'cancelled')),
  match_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index if not exists multiplayer_rating_profiles_bucket_rating_idx
  on public.multiplayer_rating_profiles (bucket, rating desc);

create index if not exists multiplayer_match_results_lookup_idx
  on public.multiplayer_match_results (source_transport, mode, scope, daily_date_key, settled_at desc);

create index if not exists multiplayer_player_results_user_idx
  on public.multiplayer_player_results (user_id, match_result_id);

create index if not exists multiplayer_rating_transactions_user_idx
  on public.multiplayer_rating_transactions (user_id, bucket, created_at desc);

create index if not exists multiplayer_matchmaking_queue_lookup_idx
  on public.multiplayer_matchmaking_queue (transport, mode, scope, daily_date_key, rating_bucket, status, queued_at);

create index if not exists custom_game_lobbies_code_idx
  on public.custom_game_lobbies (code, status, expires_at);

alter table public.multiplayer_rating_profiles enable row level security;
alter table public.multiplayer_match_results enable row level security;
alter table public.multiplayer_player_results enable row level security;
alter table public.multiplayer_rating_transactions enable row level security;
alter table public.multiplayer_matchmaking_queue enable row level security;
alter table public.custom_game_lobbies enable row level security;

drop policy if exists "Authenticated users can read rating profiles" on public.multiplayer_rating_profiles;
create policy "Authenticated users can read rating profiles"
  on public.multiplayer_rating_profiles for select
  using (auth.role() = 'authenticated');

drop policy if exists "Users can read own match results" on public.multiplayer_match_results;
create policy "Users can read own match results"
  on public.multiplayer_match_results for select
  using (
    exists (
      select 1
      from public.multiplayer_player_results player_result
      where player_result.match_result_id = multiplayer_match_results.id
        and player_result.user_id = auth.uid()
    )
  );

drop policy if exists "Users can read own player results" on public.multiplayer_player_results;
create policy "Users can read own player results"
  on public.multiplayer_player_results for select
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.multiplayer_player_results self
      where self.match_result_id = multiplayer_player_results.match_result_id
        and self.user_id = auth.uid()
    )
  );

drop policy if exists "Users can read own rating transactions" on public.multiplayer_rating_transactions;
create policy "Users can read own rating transactions"
  on public.multiplayer_rating_transactions for select
  using (user_id = auth.uid() or opponent_user_id = auth.uid());

drop policy if exists "Users can create own matchmaking requests" on public.multiplayer_matchmaking_queue;
create policy "Users can create own matchmaking requests"
  on public.multiplayer_matchmaking_queue for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can read compatible queued requests" on public.multiplayer_matchmaking_queue;
create policy "Users can read compatible queued requests"
  on public.multiplayer_matchmaking_queue for select
  using (
    auth.role() = 'authenticated'
    and (
      user_id = auth.uid()
      or status = 'queued'
    )
  );

drop policy if exists "Users can cancel own matchmaking requests" on public.multiplayer_matchmaking_queue;
create policy "Users can cancel own matchmaking requests"
  on public.multiplayer_matchmaking_queue for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Authenticated users can read active custom lobbies" on public.custom_game_lobbies;
create policy "Authenticated users can read active custom lobbies"
  on public.custom_game_lobbies for select
  using (
    auth.role() = 'authenticated'
    and (
      status = 'waiting'
      or creator_user_id = auth.uid()
    )
  );

drop policy if exists "Users can create own custom lobbies" on public.custom_game_lobbies;
create policy "Users can create own custom lobbies"
  on public.custom_game_lobbies for insert
  with check (creator_user_id is null or creator_user_id = auth.uid());

drop policy if exists "Users can update own custom lobbies" on public.custom_game_lobbies;
create policy "Users can update own custom lobbies"
  on public.custom_game_lobbies for update
  using (creator_user_id = auth.uid())
  with check (creator_user_id = auth.uid());

-- No insert/update/delete policies are granted on rating profiles, match
-- results, player results, or rating transactions. Those rows are intended for
-- trusted RPC/server-side settlement so clients cannot forge ELO changes.
