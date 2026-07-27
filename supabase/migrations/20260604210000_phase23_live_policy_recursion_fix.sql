-- Phase 23 Stage 3 follow-up: remove recursive live multiplayer RLS checks.
--
-- The original live lobby and participant select policies referenced each
-- other through live_match_participants, which can recurse when Postgres
-- evaluates RLS. Keep lobby visibility simple and let live_matches determine
-- participant access through the participant's own row.

drop policy if exists "Authenticated users can read waiting live lobbies" on public.live_lobbies;
create policy "Authenticated users can read waiting live lobbies"
  on public.live_lobbies for select
  using (
    auth.role() = 'authenticated'
    and (
      status = 'waiting'
      or host_user_id = auth.uid()
    )
  );

drop policy if exists "Participants can read participants for their matches" on public.live_match_participants;
create policy "Participants can read own participant row"
  on public.live_match_participants for select
  using (user_id = auth.uid());
