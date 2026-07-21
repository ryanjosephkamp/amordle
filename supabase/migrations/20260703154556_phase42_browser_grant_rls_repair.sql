-- Phase 42 Stage 42.4E: partial browser grant/RLS boundary repair.
--
-- This migration removes active direct anonymous table/sequence access and
-- broad future postgres-owned browser-role default privileges while preserving
-- explicit RPC contracts. The linked migration role cannot alter
-- supabase_admin-owned default privileges, so those remain a documented
-- future-object residual risk for a separate owner-context security gate.
--
-- This does not alter RLS policies, public/guest spectator contracts, Daily
-- claim rules, ranked queue matching, trusted settlement, private matchmaking
-- lifecycle, gameplay rules, or Elo math.

alter default privileges for role postgres in schema public
  revoke all privileges on tables from anon;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from anon;
alter default privileges for role postgres in schema public
  revoke all privileges on functions from anon;
alter default privileges for role postgres in schema public
  revoke all privileges on tables from authenticated;
alter default privileges for role postgres in schema public
  revoke all privileges on sequences from authenticated;
alter default privileges for role postgres in schema public
  revoke all privileges on functions from authenticated;

revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;

-- Preserve explicitly intended public RPC contracts.
grant execute on function public.get_live_multiplayer_server_time()
  to anon, authenticated;
grant execute on function public.get_public_player_profile(uuid)
  to anon, authenticated;
grant execute on function public.get_public_player_profiles(uuid[])
  to anon, authenticated;
grant execute on function public.get_public_live_v1_spectator_games_v1(integer, integer, text)
  to anon, authenticated;
grant execute on function public.get_public_site_stats_v1()
  to anon, authenticated;

-- Preserve explicitly intended authenticated-only RPC contracts.
grant execute on function public.get_my_public_player_profile()
  to authenticated;
grant execute on function public.upsert_my_public_player_profile(text, text, text, text, text, text)
  to authenticated;
grant execute on function public.claim_daily_multiplayer_participation(text, text, text, text, text, text)
  to authenticated;
grant execute on function public.get_public_ranked_leaderboard(text, integer, integer)
  to authenticated;
grant execute on function public.get_multiplayer_participant_identity_summaries(text, text)
  to authenticated;
grant execute on function public.get_admin_operational_dashboard_v1()
  to authenticated;

grant execute on function public.create_ranked_async_matchmaking_request(text, integer, boolean, text, text, integer, timestamptz)
  to authenticated;
grant execute on function public.cancel_ranked_async_matchmaking_request(text)
  to authenticated;
grant execute on function public.claim_ranked_async_matchmaking_pair(text, text)
  to authenticated;
grant execute on function public.get_ranked_async_matchmaking_status(text)
  to authenticated;
grant execute on function public.finalize_ranked_async_matchmaking_game(text, text, jsonb, text)
  to authenticated;
grant execute on function public.settle_ranked_async_multiplayer_match(text, text)
  to authenticated;

grant execute on function public.create_private_multiplayer_match_request(uuid, text, integer, boolean, integer, integer, text, timestamptz)
  to authenticated;
grant execute on function public.get_private_multiplayer_match_requests(text, integer)
  to authenticated;
grant execute on function public.cancel_private_multiplayer_match_request(text)
  to authenticated;
grant execute on function public.decline_private_multiplayer_match_request(text)
  to authenticated;
grant execute on function public.accept_private_multiplayer_match_request_v2(text, jsonb, text)
  to authenticated;
