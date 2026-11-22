-- Amordle: let guests read the public ranked leaderboard.
--
-- /leaderboards is titled "Public ranked Practice results", but a guest got "leaderboard
-- unavailable": `get_public_ranked_leaderboard_v2` was granted to `authenticated` only,
-- so PostgREST answered 401, and the v1 function it reads raised "Authentication
-- required." for any caller without a user id.
--
-- The rows were never private. Each is a profile its owner set to public, active under
-- moderation, with a display name, and `list_public_player_directory_v2` already serves
-- the same names, accents, ratings, and records to `anon`. So the leaderboard follows the
-- directory:
--
--   * `get_public_ranked_leaderboard` is reproduced from
--     20260814010000_amordle_public_ranked_lanes_v4.sql with only the user-id check and
--     its variable removed. Its own grant is unchanged: authenticated only, as before.
--   * `get_public_ranked_leaderboard_v2`, the function the page calls, is granted to
--     `anon` as well. It is security definer, so it reads v1 as its owner.

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
  v_bucket text := nullif(btrim(p_bucket), '');
  v_limit integer := coalesce(p_limit, 50);
  v_offset integer := coalesce(p_offset, 0);
  v_storage_bucket text;
begin
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

comment on function public.get_public_ranked_leaderboard_v2(text, integer, integer) is
  'Public leaderboard v2 projection adding only the validated active accent hex. Readable by guests, like the player directory.';

-- Reassert the exact grants after replacement.
revoke all on function public.get_public_ranked_leaderboard(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_public_ranked_leaderboard(text, integer, integer)
  to authenticated;

revoke all on function public.get_public_ranked_leaderboard_v2(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_public_ranked_leaderboard_v2(text, integer, integer)
  to anon, authenticated;
