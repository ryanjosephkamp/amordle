-- Phase 38 Stage 38.3B: close pre-existing anonymous Daily claim RPC execution.
--
-- The Daily claim helper is invoked by trusted security-definer trigger paths
-- and remains available to authenticated callers. Anonymous/public execution is
-- explicitly revoked so public/guest spectator readiness cannot reach Daily
-- claim mutation authority.

revoke all on function public.claim_daily_multiplayer_participation(text, text, text, text, text, text)
  from public;

revoke all on function public.claim_daily_multiplayer_participation(text, text, text, text, text, text)
  from anon;

revoke all on function public.claim_daily_multiplayer_participation(text, text, text, text, text, text)
  from authenticated;

grant execute on function public.claim_daily_multiplayer_participation(text, text, text, text, text, text)
  to authenticated;

comment on function public.claim_daily_multiplayer_participation(text, text, text, text, text, text)
  is 'Claims one Daily Multiplayer participation bucket for authenticated/internal trusted paths; anonymous/public execution is revoked as of Phase 38 Stage 38.3B.';
