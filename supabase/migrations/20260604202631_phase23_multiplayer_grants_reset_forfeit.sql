-- Phase 23 Stage 3 follow-up: expose RLS-protected multiplayer tables to
-- Supabase's Data API roles. Newer Supabase projects may not grant table
-- privileges automatically, so RLS policies alone are not enough for clients
-- to see or join waiting lobbies.

grant usage on schema public to anon, authenticated;

grant execute on function public.get_live_multiplayer_server_time() to anon, authenticated;

grant select, insert, update on table public.async_multiplayer_games to authenticated;

grant select, insert, update on table public.live_lobbies to authenticated;
grant select, insert, update on table public.live_matches to authenticated;
grant select, insert, update on table public.live_match_participants to authenticated;
grant select, insert on table public.live_match_events to authenticated;
