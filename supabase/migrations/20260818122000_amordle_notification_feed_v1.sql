-- Amordle: one round trip for the notification feed.
--
-- WHAT THIS REPLACES.
--
-- loadNotificationFeed in src/components/notification-center.tsx issued four
-- parallel requests every 30 seconds — settings, active COMBAT, legacy games,
-- private requests — and then, for up to twenty terminal Practice games, one
-- further request each to collect rematch state. So a single poll cycle was
-- four to twenty-four requests, and the component is mounted in app-shell.tsx
-- on every page, for every signed-in player, whatever they are doing.
--
-- This function does the same work inside the database and returns it once.
-- The shapes are deliberately unchanged: the client parses the same schemas it
-- always did, so this is a transport change rather than a behaviour change.
--
-- The one behavioural difference is an intentional saving. When a player has
-- notifications switched off the old code fetched everything and then threw it
-- away; this returns the empty feed without reading a game.

create or replace function public.get_player_notification_feed_v1(
  p_limit integer default 100
)
returns jsonb
security definer
set search_path = ''
language plpgsql
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 100);
  v_enabled boolean;
  v_combat jsonb;
  v_legacy jsonb;
  v_requests jsonb;
  v_rematches jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  /*
   * The settings row is absent for an account that has never opened Settings,
   * and the app's default is on — normalizePlayerSettings does the same thing
   * on the client. A missing row must not mean a silent notification blackout.
   */
  select coalesce((setting.settings->>'notifications')::boolean, true)
  into v_enabled
  from public.settings setting
  where setting.user_id = v_user_id;
  v_enabled := coalesce(v_enabled, true);

  if not v_enabled then
    return jsonb_build_object(
      'notificationsEnabled', false,
      'combat', '[]'::jsonb,
      'legacy', '[]'::jsonb,
      'requests', '[]'::jsonb,
      'rematches', '[]'::jsonb
    );
  end if;

  select coalesce(jsonb_agg(projection.value), '[]'::jsonb)
  into v_combat
  from public.list_amordle_combat_active_v2(v_limit) as projection(value);

  /*
   * The legacy lane. These are authority_version = 0 rows — games created
   * before the v2 combat authority — and the client read them through
   * PostgREST with the same predicate on every poll, forever. The query is
   * kept because those games are still real for the accounts that hold them,
   * but it is bounded here rather than run open-ended: a legacy row that has
   * not moved in ninety days is not news, and nothing in the feed can act on
   * it. See tests/domain/notification-feed-contract.test.ts.
   */
  select coalesce(jsonb_agg(row_json order by row_json->>'updated_at' desc), '[]'::jsonb)
  into v_legacy
  from (
    select to_jsonb(legacy_row) - 'authority_version' as row_json
    from (
      select
        game.id, game.scope, game.mode, game.status, game.current_turn,
        game.word_length, game.difficulty, game.go_puzzle_count,
        game.host_user_id, game.player_one_user_id, game.player_two_user_id,
        game.ranked, game.projection, game.state_version, game.move_count,
        game.created_at, game.updated_at
      from public.async_multiplayer_games game
      where game.authority_version = 0
        and game.scope = 'practice'
        and game.ranked is false
        and game.status in ('waiting', 'playing', 'holding', 'won', 'lost', 'cancelled')
        and (game.player_one_user_id = v_user_id or game.player_two_user_id = v_user_id)
        and game.updated_at > (now() - interval '90 days')
      order by game.updated_at desc
      limit v_limit
    ) legacy_row
  ) legacy_rows;

  select coalesce(jsonb_agg(to_jsonb(request)), '[]'::jsonb)
  into v_requests
  from public.get_private_multiplayer_match_requests(null, v_limit) as request;

  /*
   * The rematch fan-out, collapsed. The client took the terminal Practice games
   * out of the two lists above, capped the set at twenty, and issued one
   * request per id. The same set is derived here and joined laterally, so the
   * twenty round trips become twenty index lookups in one statement.
   */
  with terminal_games as (
    select projection.value->>'id' as game_id
    from jsonb_array_elements(v_combat) as projection(value)
    where (projection.value->'outcome'->>'terminal')::boolean is true
      and projection.value->>'scope' = 'practice'
    union
    select legacy.value->>'id'
    from jsonb_array_elements(v_legacy) as legacy(value)
    where legacy.value->>'status' in ('won', 'lost', 'cancelled')
      and jsonb_array_length(coalesce(legacy.value->'projection'->'moves', '[]'::jsonb)) > 0
    limit 20
  )
  select coalesce(jsonb_agg(to_jsonb(rematch)), '[]'::jsonb)
  into v_rematches
  from terminal_games
  cross join lateral public.get_practice_multiplayer_rematch_requests(terminal_games.game_id, 20)
    as rematch;

  return jsonb_build_object(
    'notificationsEnabled', true,
    'combat', coalesce(v_combat, '[]'::jsonb),
    'legacy', coalesce(v_legacy, '[]'::jsonb),
    'requests', coalesce(v_requests, '[]'::jsonb),
    'rematches', coalesce(v_rematches, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_player_notification_feed_v1(integer)
  from public, anon, authenticated;
grant execute on function public.get_player_notification_feed_v1(integer) to authenticated;

comment on function public.get_player_notification_feed_v1(integer)
  is 'Amordle 2026-08-18. The whole notification feed in one round trip, replacing four to twenty-four. Returns an empty feed without reading a game when the player has notifications off.';
