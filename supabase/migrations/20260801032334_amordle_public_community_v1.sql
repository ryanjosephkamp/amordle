-- Amordle v6.2 public community authority.
--
-- This additive migration keeps account identifiers and private account data
-- behind security-definer projections. It adds public player discovery,
-- public COMBAT-only statistics, supported self-selected flair values, and a
-- versioned public Practice spectator projection containing only sanctioned
-- public profile identifiers.

alter table public.public_player_profiles
  drop constraint if exists public_player_profiles_flair_key_check;

alter table public.public_player_profiles
  add constraint public_player_profiles_flair_key_check
  check (flair_key in ('none', 'daily', 'combat'));

alter table public.public_player_profiles
  alter column accent_color set default 'cyan';

create or replace function public.phase29_validate_public_profile_accent_color(
  p_accent_color text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_accent text := lower(coalesce(nullif(btrim(p_accent_color), ''), 'cyan'));
begin
  if v_accent not in ('ice', 'aurora', 'cyan', 'violet', 'rose', 'amber') then
    raise exception 'Unsupported public profile accent color.' using errcode = '22023';
  end if;

  return v_accent;
end;
$$;

create or replace function public.phase29_validate_public_profile_flair_key(
  p_flair_key text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_flair text := lower(coalesce(nullif(btrim(p_flair_key), ''), 'none'));
begin
  if v_flair not in ('none', 'daily', 'combat') then
    raise exception 'Unsupported public profile flair.' using errcode = '22023';
  end if;

  return v_flair;
end;
$$;

create index if not exists public_player_profiles_public_name_idx
  on public.public_player_profiles (
    lower(display_name) text_pattern_ops,
    public_profile_id
  )
  where visibility = 'public'
    and moderation_status = 'active'
    and display_name is not null;

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
    when 'multiplayer:og' then 'async:og'
    when 'multiplayer:go' then 'async:go'
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

  with completed as (
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
          when 'async:og' then 'multiplayer:og'
          when 'async:go' then 'multiplayer:go'
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
        'async:og',
        'async:go',
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

create or replace function public.get_amordle_public_practice_spectator_v4(
  p_game_id text default null,
  p_limit integer default 50,
  p_terminal_window_seconds integer default 15
)
returns table (
  id text,
  scope text,
  mode text,
  status text,
  word_length integer,
  go_puzzle_count integer,
  hard_mode boolean,
  ranked boolean,
  current_turn_seat text,
  created_at timestamptz,
  updated_at timestamptz,
  terminal_at timestamptz,
  players jsonb,
  moves jsonb,
  progress jsonb,
  outcome jsonb,
  spectator_capabilities jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with settings as (
    select
      nullif(left(btrim(coalesce(p_game_id, '')), 200), '') as target_game_id,
      least(greatest(coalesce(p_limit, 50), 0), 50)::integer as row_limit,
      least(greatest(coalesce(p_terminal_window_seconds, 15), 0), 30)::integer
        as terminal_window_seconds
  )
  select
    authority.game_id,
    authority.scope,
    authority.mode,
    case
      when authority.status in ('playing', 'holding') then 'playing'
      when authority.status = 'cancelled' then 'cancelled'
      else 'won'
    end,
    authority.word_length,
    authority.go_puzzle_count,
    authority.hard_mode,
    authority.ranked,
    case
      when authority.status in ('playing', 'holding') then authority.current_turn
      else null
    end,
    authority.created_at,
    authority.updated_at,
    authority.ended_at,
    player_projection.players,
    move_projection.moves,
    jsonb_strip_nulls(jsonb_build_object(
      'moveCount', move_projection.move_count,
      'currentPuzzleIndex', authority.current_puzzle_index,
      'solvedPuzzleCount', move_projection.solved_puzzle_count,
      'latestMoveAt', move_projection.latest_move_at
    )),
    jsonb_strip_nulls(jsonb_build_object(
      'terminal', authority.status in ('completed', 'cancelled'),
      'status', case
        when authority.status in ('playing', 'holding') then 'playing'
        when authority.status = 'cancelled' then 'cancelled'
        else 'won'
      end,
      'winnerSeat', authority.winner_player_id,
      'forfeitedSeat', authority.forfeited_player_id,
      'terminationReason', authority.terminal_reason,
      'label', case
        when authority.status in ('playing', 'holding') then 'In progress'
        when authority.status = 'cancelled' then 'Match cancelled'
        when authority.winner_player_id = 'player-one' then 'Player one won'
        when authority.winner_player_id = 'player-two' then 'Player two won'
        else 'Match drawn'
      end,
      'terminalAt', authority.ended_at
    )),
    jsonb_build_object(
      'canSubmitGuess', false,
      'canForfeit', false,
      'canCancel', false,
      'canJoin', false,
      'canMutate', false,
      'canClaimDaily', false,
      'canQueue', false,
      'canSettleRating', false,
      'canNotify', false
    )
  from brrrdle_private.amordle_combat_authority authority
  cross join settings
  cross join lateral (
    select coalesce(jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'seat', seat.seat,
        'label', coalesce(
          nullif(profile.display_name, ''),
          initcap(replace(seat.seat, '-', ' '))
        ),
        'profile', case
          when profile.public_profile_id is not null then
            jsonb_strip_nulls(jsonb_build_object(
              'publicProfileId', profile.public_profile_id,
              'displayName', nullif(profile.display_name, ''),
              'avatarUrl', nullif(profile.avatar_url, ''),
              'accentColor', nullif(profile.accent_color, ''),
              'initials', nullif(
                upper(left(regexp_replace(
                  coalesce(profile.display_name, ''),
                  '[^[:alnum:]]',
                  '',
                  'g'
                ), 2)),
                ''
              )
            ))
          else null
        end
      ))
      order by seat.sort_order
    ), '[]'::jsonb) as players
    from (
      values
        ('player-one', 1, authority.player_one_user_id),
        ('player-two', 2, authority.player_two_user_id)
    ) seat(seat, sort_order, participant_user_id)
    left join public.public_player_profiles profile
      on profile.user_id = seat.participant_user_id
      and profile.visibility = 'public'
      and profile.moderation_status = 'active'
  ) player_projection
  cross join lateral (
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'seat', action.player_id,
        'puzzleIndex', action.puzzle_index,
        'guess', upper(action.guess),
        'tiles', action.tiles,
        'createdAt', action.created_at
      ) order by action.sequence_no) filter (
        where action.action_type = 'guess'
      ), '[]'::jsonb) as moves,
      count(*) filter (where action.action_type = 'guess')::integer as move_count,
      count(distinct action.puzzle_index) filter (
        where action.action_type = 'guess'
          and not exists (
            select 1
            from jsonb_array_elements(action.tiles) tile
            where tile ->> 'state' <> 'correct'
          )
      )::integer as solved_puzzle_count,
      max(action.created_at) filter (
        where action.action_type = 'guess'
      ) as latest_move_at
    from brrrdle_private.amordle_combat_action_ledger action
    where action.game_id = authority.game_id
  ) move_projection
  where authority.source_kind = 'public_lobby'
    and authority.visibility_kind = 'public'
    and authority.scope = 'practice'
    and not authority.ranked
    and authority.player_two_user_id is not null
    and authority.player_one_user_id <> authority.player_two_user_id
    and (
      settings.target_game_id is null
      or authority.game_id = settings.target_game_id
    )
    and (
      authority.status in ('playing', 'holding')
      or (
        authority.status in ('completed', 'cancelled')
        and authority.ended_at >= now()
          - (settings.terminal_window_seconds * interval '1 second')
      )
    )
  order by authority.updated_at desc, authority.game_id
  limit (
    select case
      when target_game_id is not null then 1
      else row_limit
    end
    from settings
  )
$$;

comment on function public.list_public_player_directory_v1(
  text, text, integer, integer, text, integer, integer
) is
  'Lists bounded active public profiles with one optional public ranked bucket and no account identifiers.';
comment on function public.get_public_player_profile_stats_v1(uuid) is
  'Returns public COMBAT aggregates and rating buckets for one active public profile.';
comment on function public.get_amordle_public_practice_spectator_v4(
  text, integer, integer
) is
  'Returns privacy-safe public Practice spectation with sanctioned public profile identifiers.';

revoke all on function public.list_public_player_directory_v1(
  text, text, integer, integer, text, integer, integer
) from public, anon, authenticated;
revoke all on function public.get_public_player_profile_stats_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.get_amordle_public_practice_spectator_v4(
  text, integer, integer
) from public, anon, authenticated;

grant execute on function public.list_public_player_directory_v1(
  text, text, integer, integer, text, integer, integer
) to anon, authenticated;
grant execute on function public.get_public_player_profile_stats_v1(uuid)
  to anon, authenticated;
grant execute on function public.get_amordle_public_practice_spectator_v4(
  text, integer, integer
) to anon, authenticated;

revoke all on all tables in schema brrrdle_private
  from public, anon, authenticated;
