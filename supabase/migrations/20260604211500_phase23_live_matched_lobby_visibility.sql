-- Phase 23 Stage 3 follow-up: keep matched live lobbies selectable.
--
-- Supabase/PostgREST requires UPDATE targets to remain visible through SELECT
-- policies. Matched lobbies contain only lightweight routing metadata; match
-- details still live behind live_matches participant/host policies.

drop policy if exists "Authenticated users can read waiting live lobbies" on public.live_lobbies;
create policy "Authenticated users can read waiting live lobbies"
  on public.live_lobbies for select
  using (
    auth.role() = 'authenticated'
    and (
      status in ('waiting', 'matched')
      or host_user_id = auth.uid()
    )
  );
