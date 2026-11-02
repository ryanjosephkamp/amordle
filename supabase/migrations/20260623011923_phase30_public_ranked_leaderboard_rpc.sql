-- Phase 30 Stage 30.3: public ranked Practice leaderboard projection.
--
-- Additive migration only. The RPC is authenticated-only, live-computed from
-- trusted rating/profile tables, and returns an explicit allow-list of public
-- identity plus aggregate ranked Practice rating fields.

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
  if auth.role() <> 'authenticated' or auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  if v_bucket is not null and v_bucket not in ('multiplayer:og', 'multiplayer:go') then
    raise exception 'Unsupported leaderboard bucket.' using errcode = '22023';
  end if;

  if v_limit < 1 or v_limit > 100 then
    raise exception 'Leaderboard limit must be between 1 and 100.' using errcode = '22023';
  end if;

  if v_offset < 0 or v_offset > 1000 then
    raise exception 'Leaderboard offset must be between 0 and 1000.' using errcode = '22023';
  end if;

  v_storage_bucket := case v_bucket
    when 'multiplayer:og' then 'async:og'
    when 'multiplayer:go' then 'async:go'
    else null
  end;

  return query
  with eligible_rows as (
    select
      'ranked-practice-v1'::text as row_leaderboard_key,
      case rating_profile.bucket
        when 'async:og' then 'multiplayer:og'
        when 'async:go' then 'multiplayer:go'
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
    from public.multiplayer_rating_profiles as rating_profile
    join public.public_player_profiles as public_profile
      on public_profile.user_id = rating_profile.user_id
    left join lateral (
      select
        transaction_row.rating_delta,
        transaction_row.created_at
      from public.multiplayer_rating_transactions as transaction_row
      where transaction_row.user_id = rating_profile.user_id
        and transaction_row.bucket = rating_profile.bucket
      order by transaction_row.created_at desc, transaction_row.id desc
      limit 1
    ) as latest_transaction on true
    left join lateral (
      select max(greatest(transaction_row.old_rating, transaction_row.new_rating))::integer as peak_transaction_rating
      from public.multiplayer_rating_transactions as transaction_row
      where transaction_row.user_id = rating_profile.user_id
        and transaction_row.bucket = rating_profile.bucket
    ) as peak_transaction on true
    where rating_profile.bucket in ('async:og', 'async:go')
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
  is 'Phase 30 authenticated-only public ranked Practice leaderboard projection with allow-listed public profile identity and aggregate rating fields.';

revoke all on function public.get_public_ranked_leaderboard(text, integer, integer) from public;
revoke all on function public.get_public_ranked_leaderboard(text, integer, integer) from anon;
revoke all on function public.get_public_ranked_leaderboard(text, integer, integer) from authenticated;

grant execute on function public.get_public_ranked_leaderboard(text, integer, integer) to authenticated;
