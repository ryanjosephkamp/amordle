-- Phase 42 Stage 42.4F: ranked result RLS recursion repair.
--
-- The original ranked result SELECT policies were public-role policies and the
-- player-result policy self-queried multiplayer_player_results. Anonymous
-- zero-row probes could therefore reach recursive RLS evaluation even after
-- direct anonymous table grants were removed. Keep result access authenticated
-- and participant-scoped without broadening grants, gameplay, settlement, or
-- Elo authority.

drop policy if exists "Users can read own player results"
  on public.multiplayer_player_results;

create policy "Users can read own player results"
  on public.multiplayer_player_results
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can read own match results"
  on public.multiplayer_match_results;

create policy "Users can read own match results"
  on public.multiplayer_match_results
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.multiplayer_player_results as player_result
      where player_result.match_result_id = multiplayer_match_results.id
        and player_result.user_id = auth.uid()
    )
  );
