-- Phase 23 Stage 2 live multiplayer foundation.
-- Apply after the Phase 8 account/sync migration. This schema keeps live
-- lobby/match state durable while Supabase Realtime broadcasts lightweight
-- projections to connected clients.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.live_lobbies (
  id text primary key default ('live-lobby-' || gen_random_uuid()::text),
  scope text not null check (scope in ('practice', 'daily')),
  mode text not null check (mode in ('og', 'go')),
  daily_date_key text,
  status text not null default 'waiting' check (status in ('waiting', 'matched', 'cancelled', 'expired')),
  difficulty text not null default 'medium',
  go_puzzle_count integer,
  host_user_id uuid not null references auth.users(id) on delete cascade,
  match_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.live_matches (
  id text primary key default ('live-match-' || gen_random_uuid()::text),
  lobby_id text references public.live_lobbies(id) on delete set null,
  scope text not null check (scope in ('practice', 'daily')),
  mode text not null check (mode in ('og', 'go')),
  daily_date_key text,
  phase text not null check (phase in ('word-length-selection', 'countdown', 'playing', 'finished', 'aborted', 'expired')),
  selected_word_length integer,
  difficulty text not null default 'medium',
  go_puzzle_count integer,
  first_player_id text check (first_player_id in ('player-one', 'player-two')),
  winner_player_id text check (winner_player_id in ('player-one', 'player-two')),
  deadline_at timestamptz,
  countdown_ends_at timestamptz,
  ended_at timestamptz,
  projection jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.live_match_participants (
  match_id text not null references public.live_matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  player_id text not null check (player_id in ('player-one', 'player-two')),
  display_label text not null default 'Player',
  connected boolean not null default true,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (match_id, user_id),
  unique (match_id, player_id)
);

create table if not exists public.live_match_events (
  id text primary key default ('live-event-' || gen_random_uuid()::text),
  match_id text not null references public.live_matches(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists live_lobbies_lookup_idx
  on public.live_lobbies (scope, mode, status, daily_date_key, created_at);

create index if not exists live_matches_daily_lookup_idx
  on public.live_matches (scope, mode, daily_date_key, phase, created_at);

create index if not exists live_match_participants_user_idx
  on public.live_match_participants (user_id, match_id);

create index if not exists live_match_events_match_created_idx
  on public.live_match_events (match_id, created_at);

create or replace function public.get_live_multiplayer_server_time()
returns text
language sql
stable
as $$
  select to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

alter table public.live_lobbies enable row level security;
alter table public.live_matches enable row level security;
alter table public.live_match_participants enable row level security;
alter table public.live_match_events enable row level security;

drop policy if exists "Authenticated users can read waiting live lobbies" on public.live_lobbies;
create policy "Authenticated users can read waiting live lobbies"
  on public.live_lobbies for select
  using (
    auth.role() = 'authenticated'
    and (
      status = 'waiting'
      or host_user_id = auth.uid()
      or exists (
        select 1
        from public.live_match_participants participant
        where participant.user_id = auth.uid()
          and participant.match_id = live_lobbies.match_id
      )
    )
  );

drop policy if exists "Users can create own live lobbies" on public.live_lobbies;
create policy "Users can create own live lobbies"
  on public.live_lobbies for insert
  with check (auth.uid() = host_user_id);

drop policy if exists "Lobby owners can update own live lobbies" on public.live_lobbies;
create policy "Lobby owners can update own live lobbies"
  on public.live_lobbies for update
  using (auth.uid() = host_user_id)
  with check (auth.uid() = host_user_id);

drop policy if exists "Participants can read live matches" on public.live_matches;
create policy "Participants can read live matches"
  on public.live_matches for select
  using (
    exists (
      select 1
      from public.live_match_participants participant
      where participant.match_id = live_matches.id
        and participant.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.live_lobbies lobby
      where lobby.id = live_matches.lobby_id
        and lobby.host_user_id = auth.uid()
    )
  );

drop policy if exists "Authenticated users can create live matches" on public.live_matches;
create policy "Authenticated users can create live matches"
  on public.live_matches for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "Participants can update live matches" on public.live_matches;
create policy "Participants can update live matches"
  on public.live_matches for update
  using (
    exists (
      select 1
      from public.live_match_participants participant
      where participant.match_id = live_matches.id
        and participant.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.live_lobbies lobby
      where lobby.id = live_matches.lobby_id
        and lobby.host_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.live_match_participants participant
      where participant.match_id = live_matches.id
        and participant.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.live_lobbies lobby
      where lobby.id = live_matches.lobby_id
        and lobby.host_user_id = auth.uid()
    )
  );

drop policy if exists "Participants can read participants for their matches" on public.live_match_participants;
create policy "Participants can read participants for their matches"
  on public.live_match_participants for select
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.live_match_participants self
      where self.match_id = live_match_participants.match_id
        and self.user_id = auth.uid()
    )
  );

drop policy if exists "Users can join live matches as themselves" on public.live_match_participants;
create policy "Users can join live matches as themselves"
  on public.live_match_participants for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own live participant row" on public.live_match_participants;
create policy "Users can update own live participant row"
  on public.live_match_participants for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Participants can read live match events" on public.live_match_events;
create policy "Participants can read live match events"
  on public.live_match_events for select
  using (
    exists (
      select 1
      from public.live_match_participants participant
      where participant.match_id = live_match_events.match_id
        and participant.user_id = auth.uid()
    )
  );

drop policy if exists "Participants can create live match events" on public.live_match_events;
create policy "Participants can create live match events"
  on public.live_match_events for insert
  with check (
    actor_user_id = auth.uid()
    and exists (
      select 1
      from public.live_match_participants participant
      where participant.match_id = live_match_events.match_id
        and participant.user_id = auth.uid()
    )
  );

do $$
begin
  alter publication supabase_realtime add table public.live_lobbies;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.live_matches;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.live_match_participants;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.live_match_events;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
