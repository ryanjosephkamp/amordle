-- Phase 23 Stage 4: Daily lobby cancellation and Live spectator foundations.
-- Apply after the Phase 23 Daily Multiplayer claims migration.

alter table public.async_multiplayer_games
  drop constraint if exists async_multiplayer_games_status_check;

alter table public.async_multiplayer_games
  add constraint async_multiplayer_games_status_check
  check (status in ('waiting', 'playing', 'won', 'lost', 'expired', 'cancelled'));

create table if not exists public.live_match_spectators (
  match_id text not null references public.live_matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  profile jsonb,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

create index if not exists live_match_spectators_user_idx
  on public.live_match_spectators (user_id, match_id);

alter table public.live_match_spectators enable row level security;

drop policy if exists "Users can read own live spectator rows" on public.live_match_spectators;
create policy "Users can read own live spectator rows"
  on public.live_match_spectators for select
  using (auth.uid() = user_id);

drop policy if exists "Users can join live matches as spectators" on public.live_match_spectators;
create policy "Users can join live matches as spectators"
  on public.live_match_spectators for insert
  with check (
    auth.uid() = user_id
    and not exists (
      select 1
      from public.live_match_participants participant
      where participant.match_id = live_match_spectators.match_id
        and participant.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update own live spectator row" on public.live_match_spectators;
create policy "Users can update own live spectator row"
  on public.live_match_spectators for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and not exists (
      select 1
      from public.live_match_participants participant
      where participant.match_id = live_match_spectators.match_id
        and participant.user_id = auth.uid()
    )
  );

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
    or exists (
      select 1
      from public.live_match_spectators spectator
      where spectator.match_id = live_matches.id
        and spectator.user_id = auth.uid()
    )
  );

grant select, insert, update on table public.live_match_spectators to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.live_match_spectators;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
