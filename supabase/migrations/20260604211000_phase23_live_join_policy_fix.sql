-- Phase 23 Stage 3 follow-up: allow a signed-in second player to claim a
-- waiting live lobby without requiring insert-style checks on the updated row.

drop policy if exists "Lobby owners and joiners can update live lobbies" on public.live_lobbies;
create policy "Lobby owners and joiners can update live lobbies"
  on public.live_lobbies for update
  using (
    auth.uid() = host_user_id
    or (
      auth.uid() is not null
      and status = 'waiting'
      and host_user_id <> auth.uid()
    )
  )
  with check (
    auth.uid() = host_user_id
    or (
      auth.uid() is not null
      and status = 'matched'
    )
  );
