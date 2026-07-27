-- Phase 27 Stage 27.3B: corrective settlement RPC replacement.
--
-- The Stage 27.3 settlement RPC returned columns named user_id and bucket,
-- which caused the profile upsert conflict target to collide with PL/pgSQL
-- output parameters. This migration replaces only the applied settlement RPC
-- definition and leaves queue authority, grants, RLS, and table shapes intact.

do $$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef('public.settle_ranked_async_multiplayer_match(text,text)'::regprocedure)
  into v_definition;

  if v_definition is null then
    raise exception 'settle_ranked_async_multiplayer_match(text,text) is not installed.';
  end if;

  v_updated := replace(
    v_definition,
    'on conflict (user_id, bucket) do nothing;',
    'on conflict on constraint multiplayer_rating_profiles_pkey do nothing;'
  );

  if v_updated = v_definition then
    raise exception 'Expected profile upsert conflict target was not found in settlement RPC.';
  end if;

  v_updated := replace(
    v_updated,
    'update public.multiplayer_rating_profiles
  set
    rating = v_left_new_rating,
    games_played = v_left_new_games,
    wins = wins + case when v_left_outcome = ''win'' then 1 else 0 end,
    losses = losses + case when v_left_outcome = ''loss'' then 1 else 0 end,
    draws = draws + case when v_left_outcome = ''draw'' then 1 else 0 end,
    provisional = v_left_new_provisional,
    updated_at = now()
  where user_id = v_left_user_id
    and bucket = v_bucket;',
    'update public.multiplayer_rating_profiles as profile
  set
    rating = v_left_new_rating,
    games_played = v_left_new_games,
    wins = profile.wins + case when v_left_outcome = ''win'' then 1 else 0 end,
    losses = profile.losses + case when v_left_outcome = ''loss'' then 1 else 0 end,
    draws = profile.draws + case when v_left_outcome = ''draw'' then 1 else 0 end,
    provisional = v_left_new_provisional,
    updated_at = now()
  where profile.user_id = v_left_user_id
    and profile.bucket = v_bucket;'
  );

  v_updated := replace(
    v_updated,
    'update public.multiplayer_rating_profiles
  set
    rating = v_right_new_rating,
    games_played = v_right_new_games,
    wins = wins + case when v_right_outcome = ''win'' then 1 else 0 end,
    losses = losses + case when v_right_outcome = ''loss'' then 1 else 0 end,
    draws = draws + case when v_right_outcome = ''draw'' then 1 else 0 end,
    provisional = v_right_new_provisional,
    updated_at = now()
  where user_id = v_right_user_id
    and bucket = v_bucket;',
    'update public.multiplayer_rating_profiles as profile
  set
    rating = v_right_new_rating,
    games_played = v_right_new_games,
    wins = profile.wins + case when v_right_outcome = ''win'' then 1 else 0 end,
    losses = profile.losses + case when v_right_outcome = ''loss'' then 1 else 0 end,
    draws = profile.draws + case when v_right_outcome = ''draw'' then 1 else 0 end,
    provisional = v_right_new_provisional,
    updated_at = now()
  where profile.user_id = v_right_user_id
    and profile.bucket = v_bucket;'
  );

  if position('on conflict on constraint multiplayer_rating_profiles_pkey do nothing;' in v_updated) = 0
    or position('where profile.user_id = v_left_user_id' in v_updated) = 0
    or position('where profile.user_id = v_right_user_id' in v_updated) = 0
  then
    raise exception 'Settlement RPC corrective replacement did not produce the expected unambiguous profile references.';
  end if;

  execute v_updated;
end $$;

revoke all on function public.settle_ranked_async_multiplayer_match(text, text) from public;
revoke all on function public.settle_ranked_async_multiplayer_match(text, text) from anon;
revoke all on function public.settle_ranked_async_multiplayer_match(text, text) from authenticated;
grant execute on function public.settle_ranked_async_multiplayer_match(text, text) to authenticated;

comment on function public.settle_ranked_async_multiplayer_match(text, text)
  is 'Phase 27 trusted ranked Practice settlement RPC with unambiguous profile upsert/update references.';
