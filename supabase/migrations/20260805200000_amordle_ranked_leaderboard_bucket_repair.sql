-- Amordle ranked leaderboard rating-bucket repair (W-11).
--
-- `get_public_ranked_leaderboard` was last defined in
-- 20260710061039_phase55_ranked_daily_multiplayer.sql and still resolves
-- `multiplayer:og` / `multiplayer:go` to the pre-v2 storage buckets `async:og` and
-- `async:go`. Current ranked Practice writes `async:og:amordle:v2` /
-- `async:go:amordle:v2`: `brrrdle_private.amordle_app_bucket`
-- (20260730193000_amordle_combat_authority_v3.sql) recognizes only the `amordle:v2`
-- and `daily:v1` keys, and `amordle_create_combat_v3` rejects a ranked game whose
-- bucket maps to null, so plain `async:og` is unreachable for any v3 ranked game.
--
-- Consequence: rows in `async:*:amordle:v2` resolved to a null `row_bucket` and could
-- never match the filter, so the Leaderboards OG and GO lanes could not display any
-- rating earned under the current ranked Practice authority (ACC-12.b/d).
--
-- 20260801051509_amordle_public_community_stats_repair.sql already made exactly this
-- correction for `list_public_player_directory_v2` and the public stats RPC — it opens
-- with "public Practice rating filters still referenced legacy pre-v2 buckets" — but
-- did not cover the leaderboard. This migration applies the same repair, with the same
-- bucket set, so all three public projections agree.
--
-- Forward-only and additive. No column, table, grant, role, or RLS policy changes, and
-- the function signature is unchanged, so the `_v2` wrapper and its existing grants
-- keep working untouched. Rollback is a `create or replace` back to the prior body; no
-- data is written.
--
-- Legacy `async:og` / `async:go` rows are intentionally NOT included. The v2 authority
-- migration seeded the new buckets from existing ratings once, so admitting both would
-- list a player twice in the same lane. This matches the directory repair exactly.

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
  if v_bucket is not null and v_bucket not in (
    'multiplayer:og',
    'multiplayer:go',
    'multiplayer:og:daily:v1',
    'multiplayer:go:daily:v1'
  ) then
    raise exception 'Unsupported leaderboard bucket.' using errcode = '22023';
  end if;
  if v_limit < 1 or v_limit > 100 then
    raise exception 'Leaderboard limit must be between 1 and 100.' using errcode = '22023';
  end if;
  if v_offset < 0 or v_offset > 1000 then
    raise exception 'Leaderboard offset must be between 0 and 1000.' using errcode = '22023';
  end if;

  -- Repaired: current Amordle v2 ranked Practice storage buckets.
  v_storage_bucket := case v_bucket
    when 'multiplayer:og' then 'async:og:amordle:v2'
    when 'multiplayer:go' then 'async:go:amordle:v2'
    when 'multiplayer:og:daily:v1' then 'async:og:daily:v1'
    when 'multiplayer:go:daily:v1' then 'async:go:daily:v1'
    else null
  end;

  return query
  with eligible_rows as (
    select
      case
        when rating_profile.bucket in ('async:og:daily:v1', 'async:go:daily:v1') then 'ranked-daily-v1'
        else 'ranked-practice-v1'
      end::text as row_leaderboard_key,
      case rating_profile.bucket
        when 'async:og:amordle:v2' then 'multiplayer:og'
        when 'async:go:amordle:v2' then 'multiplayer:go'
        when 'async:og:daily:v1' then 'multiplayer:og:daily:v1'
        when 'async:go:daily:v1' then 'multiplayer:go:daily:v1'
      end as row_bucket,
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
    where rating_profile.bucket in (
        'async:og:amordle:v2',
        'async:go:amordle:v2',
        'async:og:daily:v1',
        'async:go:daily:v1'
      )
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

comment on function public.get_public_ranked_leaderboard(text, integer, integer)
  is 'Authenticated public-safe ranked Practice and ranked Daily leaderboard projection using current Amordle v2 rating buckets.';
