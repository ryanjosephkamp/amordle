-- Amordle v8.2: teach the public ranked surfaces the v4 rating lanes.
--
-- Cycle C renamed every ranked Practice rating pool to
-- `async:<mode>:<clock>:<hard|std>:v4` and reset the ratings. It repaired the authority and
-- `get_public_site_stats_v1`, and stopped there. Three public read functions still carried
-- the pre-Cycle-C names, hardcoded in three places each — a whitelist, a mapping and a
-- filter — and were never re-emitted:
--
--   * `get_public_ranked_leaderboard` filtered on `async:og:amordle:v2`, which now matches
--     no row at all, and rejected any v4 lane id outright. The leaderboard was empty and
--     had no way to ask for a lane that exists.
--   * `list_public_player_directory_v1` carried the same whitelist, so ranked filtering in
--     the player directory was dead.
--   * `get_public_player_profile_stats_v1` mapped buckets with a `case` whose every arm was
--     a retired name, so a profile's ratings projected as null.
--
-- Confirmed against the live database before writing this: two rating profiles exist, both
-- `async:og:5m:std:v4`, and none of the three could see them.
--
-- The repair is the one Cycle C used everywhere else: read the bucket table instead of a
-- literal list, so the next time the ladder changes these functions follow it for free.

-- ---------------------------------------------------------------------------
-- The lane vocabulary, in one place
-- ---------------------------------------------------------------------------
--
-- A v4 bucket name is already self-describing, so it doubles as the public lane id and
-- there is no second naming scheme to keep in step. The two Daily v1 lanes keep their
-- `multiplayer:` app ids because they predate the table and are not in it.

create or replace function brrrdle_private.amordle_lane_is_public(p_bucket text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_bucket in ('async:og:daily:v1', 'async:go:daily:v1')
    or exists (
      select 1
      from brrrdle_private.amordle_rating_bucket ladder
      where ladder.bucket = p_bucket and ladder.active
    )
$$;

/** Storage bucket to the id the public surfaces speak. Identity for v4 lanes. */
create or replace function brrrdle_private.amordle_lane_public_id(p_bucket text)
returns text
language sql
stable
set search_path = ''
as $$
  select case p_bucket
    when 'async:og:daily:v1' then 'multiplayer:og:daily:v1'
    when 'async:go:daily:v1' then 'multiplayer:go:daily:v1'
    else p_bucket
  end
$$;

/**
 * A requested lane id to its storage bucket, or null when the lane is not one we serve.
 *
 * The two retired practice ids are still accepted and mapped to their old storage names.
 * They match no rows, which is the truth, but a saved link or a cached client asking for
 * `multiplayer:og` gets an empty leaderboard rather than an error.
 */
create or replace function brrrdle_private.amordle_public_lane_storage(p_lane text)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_lane is null then null
    when p_lane = 'multiplayer:og:daily:v1' then 'async:og:daily:v1'
    when p_lane = 'multiplayer:go:daily:v1' then 'async:go:daily:v1'
    when p_lane = 'multiplayer:og' then 'async:og:amordle:v2'
    when p_lane = 'multiplayer:go' then 'async:go:amordle:v2'
    when exists (
      select 1
      from brrrdle_private.amordle_rating_bucket ladder
      where ladder.bucket = p_lane and ladder.active
    ) then p_lane
    else null
  end
$$;

/** Which leaderboard a lane belongs to. */
create or replace function brrrdle_private.amordle_lane_key(p_bucket text)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_bucket in ('async:og:daily:v1', 'async:go:daily:v1') then 'ranked-daily-v1'
    else 'ranked-practice-v1'
  end
$$;

-- ---------------------------------------------------------------------------
-- The three functions, reproduced with only those substitutions
-- ---------------------------------------------------------------------------
--
-- Anything not described above is byte-identical to what is deployed today.

-- >>> get_public_ranked_leaderboard
create or replace function public.get_public_ranked_leaderboard(
  p_bucket text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  leaderboard_key text,
  rank integer,
  bucket text,
  public_profile_id uuid,
  display_name text,
  accent_color text,
  flair_key text,
  avatar_url text,
  rating integer,
  games_played integer,
  wins integer,
  losses integer,
  draws integer,
  provisional boolean,
  latest_rating_delta integer,
  latest_rating_movement_at timestamptz,
  peak_rating integer,
  profile_updated_at timestamptz,
  leaderboard_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_bucket text := nullif(btrim(p_bucket), '');
  v_limit integer := coalesce(p_limit, 50);
  v_offset integer := coalesce(p_offset, 0);
  v_storage_bucket text;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;
  if v_bucket is not null and brrrdle_private.amordle_public_lane_storage(v_bucket) is null then
    raise exception 'Unsupported leaderboard bucket.' using errcode = '22023';
  end if;
  if v_limit < 1 or v_limit > 100 then
    raise exception 'Leaderboard limit must be between 1 and 100.' using errcode = '22023';
  end if;
  if v_offset < 0 or v_offset > 1000 then
    raise exception 'Leaderboard offset must be between 0 and 1000.' using errcode = '22023';
  end if;

  -- v8.2-P3. Table-driven. The v4 name is already self-describing, so it is the public
  -- lane id as well as the storage key and nothing has to be kept in step by hand.
  v_storage_bucket := brrrdle_private.amordle_public_lane_storage(v_bucket);

  return query
  with eligible_rows as (
    select
      brrrdle_private.amordle_lane_key(rating_profile.bucket)::text as row_leaderboard_key,
      brrrdle_private.amordle_lane_public_id(rating_profile.bucket) as row_bucket,
      public_profile.public_profile_id as row_public_profile_id,
      public_profile.display_name as row_display_name,
      public_profile.accent_color as row_accent_color,
      public_profile.flair_key as row_flair_key,
      public_profile.avatar_url as row_avatar_url,
      rating_profile.rating as row_rating,
      rating_profile.games_played as row_games_played,
      rating_profile.wins as row_wins,
      rating_profile.losses as row_losses,
      rating_profile.draws as row_draws,
      rating_profile.provisional as row_provisional,
      coalesce(latest_transaction.rating_delta, 0)::integer as row_latest_rating_delta,
      latest_transaction.created_at as row_latest_rating_movement_at,
      greatest(
        rating_profile.rating,
        coalesce(peak_transaction.peak_transaction_rating, rating_profile.rating)
      )::integer as row_peak_rating,
      public_profile.updated_at as row_profile_updated_at,
      rating_profile.updated_at as row_leaderboard_updated_at
    from public.multiplayer_rating_profiles rating_profile
    join public.public_player_profiles public_profile
      on public_profile.user_id = rating_profile.user_id
    left join lateral (
      select transaction_row.rating_delta, transaction_row.created_at
      from public.multiplayer_rating_transactions transaction_row
      where transaction_row.user_id = rating_profile.user_id
        and transaction_row.bucket = rating_profile.bucket
      order by transaction_row.created_at desc, transaction_row.id desc
      limit 1
    ) latest_transaction on true
    left join lateral (
      select max(greatest(transaction_row.old_rating, transaction_row.new_rating))::integer as peak_transaction_rating
      from public.multiplayer_rating_transactions transaction_row
      where transaction_row.user_id = rating_profile.user_id
        and transaction_row.bucket = rating_profile.bucket
    ) peak_transaction on true
    where brrrdle_private.amordle_lane_is_public(rating_profile.bucket)
      and (v_storage_bucket is null or rating_profile.bucket = v_storage_bucket)
      and rating_profile.games_played > 0
      and public_profile.visibility = 'public'
      and public_profile.moderation_status = 'active'
      and public_profile.display_name is not null
  ),
  ranked_rows as (
    select
      eligible_rows.*,
      row_number() over (
        partition by eligible_rows.row_bucket
        order by
          eligible_rows.row_rating desc,
          eligible_rows.row_games_played desc,
          eligible_rows.row_peak_rating desc,
          eligible_rows.row_leaderboard_updated_at desc,
          eligible_rows.row_public_profile_id asc
      )::integer as row_rank
    from eligible_rows
  )
  select
    ranked_rows.row_leaderboard_key,
    ranked_rows.row_rank,
    ranked_rows.row_bucket,
    ranked_rows.row_public_profile_id,
    ranked_rows.row_display_name,
    ranked_rows.row_accent_color,
    ranked_rows.row_flair_key,
    ranked_rows.row_avatar_url,
    ranked_rows.row_rating,
    ranked_rows.row_games_played,
    ranked_rows.row_wins,
    ranked_rows.row_losses,
    ranked_rows.row_draws,
    ranked_rows.row_provisional,
    ranked_rows.row_latest_rating_delta,
    ranked_rows.row_latest_rating_movement_at,
    ranked_rows.row_peak_rating,
    ranked_rows.row_profile_updated_at,
    ranked_rows.row_leaderboard_updated_at
  from ranked_rows
  order by ranked_rows.row_bucket, ranked_rows.row_rank
  offset v_offset
  limit v_limit;
end;
$$;

-- >>> list_public_player_directory_v1
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
  if v_bucket is not null and brrrdle_private.amordle_public_lane_storage(v_bucket) is null then
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

  -- v8.2-P3. Table-driven. The v4 name is already self-describing, so it is the public
  -- lane id as well as the storage key and nothing has to be kept in step by hand.
  v_storage_bucket := brrrdle_private.amordle_public_lane_storage(v_bucket);

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

-- >>> get_public_player_profile_stats_v1
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
        -- v8.2-P3. Every arm of this `case` named a pre-Cycle-C bucket, so after the
        -- rename a profile's ratings projected as null rather than as its lanes.
        'bucket', brrrdle_private.amordle_lane_public_id(rating_profile.bucket),
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
      and brrrdle_private.amordle_lane_is_public(rating_profile.bucket)
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

