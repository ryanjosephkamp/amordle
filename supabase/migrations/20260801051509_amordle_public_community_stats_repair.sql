-- Amordle v6.2 public community projection repair.
--
-- Forward-only correction for two defects found by protected hosted acceptance:
--   * public COMBAT totals omitted authoritative unranked games because the
--     projection read settlement rows only;
--   * public Practice rating filters still referenced legacy pre-v2 buckets.
--
-- The repair changes no tables, grants, routes, game rules, rating rules, or
-- browser-visible identifiers. The existing versioned RPC signatures remain
-- stable and direct private-schema access remains revoked.

create or replace function public.list_public_player_directory_v1(
  p_search text default null,
  p_bucket text default 'multiplayer:og',
  p_min_rating integer default null,
  p_max_rating integer default null,
  p_sort text default 'rating',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  public_profile_id uuid,
  display_name text,
  accent_color text,
  flair_key text,
  profile_updated_at timestamptz,
  bucket text,
  rating integer,
  games_played integer,
  wins integer,
  losses integer,
  draws integer,
  provisional boolean,
  rating_updated_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := lower(nullif(left(btrim(coalesce(p_search, '')), 50), ''));
  v_bucket text := nullif(btrim(coalesce(p_bucket, '')), '');
  v_storage_bucket text;
  v_sort text := lower(coalesce(nullif(btrim(p_sort), ''), 'rating'));
  v_limit integer := coalesce(p_limit, 50);
  v_offset integer := coalesce(p_offset, 0);
begin
  if v_bucket is not null and v_bucket not in (
    'multiplayer:og',
    'multiplayer:go',
    'multiplayer:og:daily:v1',
    'multiplayer:go:daily:v1'
  ) then
    raise exception 'Unsupported player directory rating bucket.' using errcode = '22023';
  end if;
  if v_sort not in ('rating', 'games', 'name', 'recent') then
    raise exception 'Unsupported player directory sort.' using errcode = '22023';
  end if;
  if v_limit < 1 or v_limit > 50 then
    raise exception 'Player directory limit must be between 1 and 50.' using errcode = '22023';
  end if;
  if v_offset < 0 or v_offset > 5000 then
    raise exception 'Player directory offset must be between 0 and 5000.' using errcode = '22023';
  end if;
  if p_min_rating is not null and (p_min_rating < 0 or p_min_rating > 10000) then
    raise exception 'Minimum rating must be between 0 and 10000.' using errcode = '22023';
  end if;
  if p_max_rating is not null and (p_max_rating < 0 or p_max_rating > 10000) then
    raise exception 'Maximum rating must be between 0 and 10000.' using errcode = '22023';
  end if;
  if p_min_rating is not null and p_max_rating is not null and p_min_rating > p_max_rating then
    raise exception 'Minimum rating cannot exceed maximum rating.' using errcode = '22023';
  end if;
  if v_bucket is null and (p_min_rating is not null or p_max_rating is not null) then
    raise exception 'Rating filters require a rating bucket.' using errcode = '22023';
  end if;

  v_storage_bucket := case v_bucket
    when 'multiplayer:og' then 'async:og:amordle:v2'
    when 'multiplayer:go' then 'async:go:amordle:v2'
    when 'multiplayer:og:daily:v1' then 'async:og:daily:v1'
    when 'multiplayer:go:daily:v1' then 'async:go:daily:v1'
    else null
  end;

  return query
  with directory_rows as (
    select
      profile.public_profile_id,
      profile.display_name,
      profile.accent_color,
      profile.flair_key,
      profile.updated_at as profile_updated_at,
      v_bucket as bucket,
      rating_profile.rating,
      rating_profile.games_played,
      rating_profile.wins,
      rating_profile.losses,
      rating_profile.draws,
      rating_profile.provisional,
      rating_profile.updated_at as rating_updated_at
    from public.public_player_profiles profile
    left join public.multiplayer_rating_profiles rating_profile
      on rating_profile.user_id = profile.user_id
      and rating_profile.bucket = v_storage_bucket
    where profile.visibility = 'public'
      and profile.moderation_status = 'active'
      and profile.display_name is not null
      and (v_search is null or lower(profile.display_name) like v_search || '%')
      and (p_min_rating is null or rating_profile.rating >= p_min_rating)
      and (p_max_rating is null or rating_profile.rating <= p_max_rating)
  )
  select
    directory_rows.public_profile_id,
    directory_rows.display_name,
    directory_rows.accent_color,
    directory_rows.flair_key,
    directory_rows.profile_updated_at,
    directory_rows.bucket,
    directory_rows.rating,
    directory_rows.games_played,
    directory_rows.wins,
    directory_rows.losses,
    directory_rows.draws,
    directory_rows.provisional,
    directory_rows.rating_updated_at,
    count(*) over () as total_count
  from directory_rows
  order by
    case when v_sort = 'rating' then directory_rows.rating end desc nulls last,
    case when v_sort = 'games' then directory_rows.games_played end desc nulls last,
    case when v_sort = 'name' then lower(directory_rows.display_name) end asc,
    case when v_sort = 'recent' then directory_rows.profile_updated_at end desc,
    lower(directory_rows.display_name) asc,
    directory_rows.public_profile_id asc
  offset v_offset
  limit v_limit;
end;
$$;

create or replace function public.get_public_player_profile_stats_v1(
  p_public_profile_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_result jsonb;
begin
  select profile.user_id
  into v_user_id
  from public.public_player_profiles profile
  where p_public_profile_id is not null
    and profile.public_profile_id = p_public_profile_id
    and profile.visibility = 'public'
    and profile.moderation_status = 'active'
  limit 1;

  if v_user_id is null then
    return null;
  end if;

  with authority_completed as (
    select
      case
        when authority.winner_player_id is null then 'draw'
        when authority.winner_player_id = viewer.player_id then 'win'
        else 'loss'
      end as outcome,
      coalesce(action_totals.attempts, 0)::integer as attempts_used,
      coalesce(action_totals.puzzles, 0)::integer as puzzles_solved,
      authority.scope,
      authority.mode,
      authority.ranked,
      coalesce(authority.ended_at, authority.updated_at) as completed_at
    from brrrdle_private.amordle_combat_authority authority
    cross join lateral (
      select case
        when authority.player_one_user_id = v_user_id then 'player-one'
        when authority.player_two_user_id = v_user_id then 'player-two'
      end as player_id
    ) viewer
    left join lateral (
      select
        count(*)::integer as attempts,
        count(*) filter (
          where not exists (
            select 1
            from jsonb_array_elements(action.tiles) tile
            where tile ->> 'state' <> 'correct'
          )
        )::integer as puzzles
      from brrrdle_private.amordle_combat_action_ledger action
      where action.game_id = authority.game_id
        and action.action_type = 'guess'
        and action.player_id = viewer.player_id
    ) action_totals on true
    where authority.status = 'completed'
      and viewer.player_id is not null
  ),
  legacy_completed as (
    select
      player_result.outcome,
      player_result.attempts_used,
      player_result.puzzles_solved,
      match_result.scope,
      match_result.mode,
      match_result.ranked,
      coalesce(player_result.completed_at, match_result.settled_at) as completed_at
    from public.multiplayer_player_results player_result
    join public.multiplayer_match_results match_result
      on match_result.id = player_result.match_result_id
    where player_result.user_id = v_user_id
      and match_result.terminal_status = 'completed'
      and not exists (
        select 1
        from brrrdle_private.amordle_combat_authority authority
        where authority.game_id = match_result.source_match_id
      )
  ),
  completed as (
    select * from authority_completed
    union all
    select * from legacy_completed
  ),
  overall as (
    select
      count(*)::integer as games,
      count(*) filter (where outcome = 'win')::integer as wins,
      count(*) filter (where outcome = 'loss')::integer as losses,
      count(*) filter (where outcome = 'draw')::integer as draws,
      coalesce(sum(attempts_used), 0)::integer as attempts,
      coalesce(sum(puzzles_solved), 0)::integer as puzzles,
      max(completed_at) as latest_completed_at
    from completed
  ),
  rating_rows as (
    select jsonb_agg(
      jsonb_build_object(
        'bucket', case rating_profile.bucket
          when 'async:og:amordle:v2' then 'multiplayer:og'
          when 'async:go:amordle:v2' then 'multiplayer:go'
          when 'async:og:daily:v1' then 'multiplayer:og:daily:v1'
          when 'async:go:daily:v1' then 'multiplayer:go:daily:v1'
        end,
        'rating', rating_profile.rating,
        'peakRating', greatest(
          rating_profile.rating,
          coalesce(peak.peak_rating, rating_profile.rating)
        ),
        'gamesPlayed', rating_profile.games_played,
        'wins', rating_profile.wins,
        'losses', rating_profile.losses,
        'draws', rating_profile.draws,
        'provisional', rating_profile.provisional,
        'updatedAt', rating_profile.updated_at
      ) order by rating_profile.bucket
    ) as ratings,
    max(rating_profile.updated_at) as latest_rating_at
    from public.multiplayer_rating_profiles rating_profile
    left join lateral (
      select max(greatest(transaction.old_rating, transaction.new_rating))::integer as peak_rating
      from public.multiplayer_rating_transactions transaction
      where transaction.user_id = rating_profile.user_id
        and transaction.bucket = rating_profile.bucket
    ) peak on true
    where rating_profile.user_id = v_user_id
      and rating_profile.bucket in (
        'async:og:amordle:v2',
        'async:go:amordle:v2',
        'async:og:daily:v1',
        'async:go:daily:v1'
      )
  )
  select jsonb_build_object(
    'schemaVersion', 1,
    'overall', jsonb_build_object(
      'gamesCompleted', overall.games,
      'wins', overall.wins,
      'losses', overall.losses,
      'draws', overall.draws,
      'acceptedGuesses', overall.attempts,
      'puzzlesSolved', overall.puzzles
    ),
    'breakdowns', jsonb_build_object(
      'practice', (select count(*)::integer from completed where scope = 'practice'),
      'daily', (select count(*)::integer from completed where scope = 'daily'),
      'og', (select count(*)::integer from completed where mode = 'og'),
      'go', (select count(*)::integer from completed where mode = 'go'),
      'ranked', (select count(*)::integer from completed where ranked),
      'unranked', (select count(*)::integer from completed where not ranked)
    ),
    'ratings', coalesce(rating_rows.ratings, '[]'::jsonb),
    'updatedAt', greatest(overall.latest_completed_at, rating_rows.latest_rating_at)
  )
  into v_result
  from overall
  cross join rating_rows;

  return v_result;
end;
$$;

comment on function public.list_public_player_directory_v1(
  text, text, integer, integer, text, integer, integer
) is 'Bounded public player directory using current Amordle rating buckets.';

comment on function public.get_public_player_profile_stats_v1(uuid) is
  'Public COMBAT-only aggregate derived from authoritative terminal games and current rating buckets.';

revoke all on function public.list_public_player_directory_v1(
  text, text, integer, integer, text, integer, integer
) from public;
revoke all on function public.get_public_player_profile_stats_v1(uuid)
  from public;

grant execute on function public.list_public_player_directory_v1(
  text, text, integer, integer, text, integer, integer
) to anon, authenticated;
grant execute on function public.get_public_player_profile_stats_v1(uuid)
  to anon, authenticated;

revoke all on all tables in schema brrrdle_private from public, anon, authenticated;
