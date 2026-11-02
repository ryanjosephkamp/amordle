-- Phase 26 Stage 26.5B: authenticated Live v1 spectator projection.
-- This migration intentionally does not broaden raw async_multiplayer_games
-- SELECT access. Nonparticipant spectators call the sanitized RPC below.

create index if not exists async_multiplayer_games_live_v1_spectator_idx
  on public.async_multiplayer_games (updated_at desc)
  where status = 'playing'
    and player_one_user_id is not null
    and player_two_user_id is not null;

create or replace function public.get_authenticated_live_v1_spectator_games(p_limit integer default 50)
returns table (
  id text,
  scope text,
  mode text,
  status text,
  daily_date_key text,
  word_length integer,
  difficulty text,
  go_puzzle_count integer,
  hard_mode boolean,
  ranked boolean,
  rating_bucket text,
  current_turn_seat text,
  created_at timestamptz,
  updated_at timestamptz,
  deadline_at timestamptz,
  time_limit_ms integer,
  players jsonb,
  moves jsonb,
  progress jsonb,
  spectator_capabilities jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with authorized as (
    select
      (select auth.uid()) as viewer_id,
      (select auth.role()) as viewer_role
  ),
  eligible as (
    select game.*
    from public.async_multiplayer_games game
    cross join authorized
    where authorized.viewer_role = 'authenticated'
      and authorized.viewer_id is not null
      and game.status = 'playing'
      and game.player_one_user_id is not null
      and game.player_two_user_id is not null
      and game.player_one_user_id <> authorized.viewer_id
      and game.player_two_user_id <> authorized.viewer_id
      and game.host_user_id <> authorized.viewer_id
    order by game.updated_at desc
    limit least(greatest(coalesce(p_limit, 50), 0), 100)
  )
  select
    game.id,
    game.scope,
    game.mode,
    game.status,
    game.daily_date_key,
    game.word_length,
    game.difficulty,
    game.go_puzzle_count,
    case
      when game.scope = 'practice' and lower(coalesce(game.projection ->> 'hardMode', 'false')) = 'true' then true
      else false
    end as hard_mode,
    game.ranked,
    game.rating_bucket,
    game.current_turn as current_turn_seat,
    game.created_at,
    game.updated_at,
    game.deadline_at,
    case
      when (game.projection ->> 'timeLimitMs') ~ '^[0-9]+$' then (game.projection ->> 'timeLimitMs')::integer
      else null
    end as time_limit_ms,
    player_projection.players,
    move_projection.moves,
    jsonb_strip_nulls(jsonb_build_object(
      'moveCount', move_projection.move_count,
      'currentPuzzleIndex',
        case
          when game.mode = 'go'
            and (game.projection #>> '{serializedSession,session,currentPuzzleIndex}') ~ '^[0-9]+$'
            then (game.projection #>> '{serializedSession,session,currentPuzzleIndex}')::integer
          else 0
        end,
      'solvedPuzzleCount', move_projection.solved_puzzle_count,
      'latestMoveAt', move_projection.latest_move_at
    )) as progress,
    jsonb_build_object(
      'canSubmitGuess', false,
      'canForfeit', false,
      'canCancel', false,
      'canJoin', false,
      'canMutate', false
    ) as spectator_capabilities
  from eligible game
  cross join lateral (
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'seat', seat.seat,
      'label', coalesce(nullif(player_entry.player_value ->> 'label', ''), initcap(replace(seat.seat, '-', ' '))),
      'profile', jsonb_strip_nulls(jsonb_build_object(
        'displayName', nullif(profile.profile_value ->> 'displayName', ''),
        'avatarUrl', nullif(profile.profile_value ->> 'avatarUrl', ''),
        'accentColor', nullif(profile.profile_value ->> 'accentColor', ''),
        'initials', nullif(profile.profile_value ->> 'initials', '')
      ))
    )) order by seat.sort_order), '[]'::jsonb) as players
    from (values ('player-one', 1), ('player-two', 2)) as seat(seat, sort_order)
    left join lateral (
      select player_value
      from jsonb_array_elements(
        case
          when jsonb_typeof(game.projection -> 'players') = 'array' then game.projection -> 'players'
          else '[]'::jsonb
        end
      ) as player_entry(player_value)
      where player_value ->> 'id' = seat.seat
      limit 1
    ) player_entry on true
    left join lateral (
      select case
        when jsonb_typeof(game.projection -> 'playerProfiles' -> seat.seat) = 'object'
          then game.projection -> 'playerProfiles' -> seat.seat
        else '{}'::jsonb
      end as profile_value
    ) profile on true
  ) player_projection
  cross join lateral (
    with raw_moves as (
      select
        move.move_value,
        move.move_ordinality,
        case
          when move.move_value ->> 'playerId' in ('player-one', 'player-two') then move.move_value ->> 'playerId'
          else null
        end as seat,
        case
          when (move.move_value ->> 'puzzleIndex') ~ '^[0-9]+$' then (move.move_value ->> 'puzzleIndex')::integer
          else 0
        end as puzzle_index,
        upper(left(coalesce(move.move_value ->> 'guess', ''), least(greatest(game.word_length, 0), 35))) as guess,
        nullif(move.move_value ->> 'createdAt', '') as created_at_text
      from jsonb_array_elements(
        case
          when jsonb_typeof(game.projection -> 'moves') = 'array' then game.projection -> 'moves'
          else '[]'::jsonb
        end
      ) with ordinality as move(move_value, move_ordinality)
      where move.move_value ->> 'playerId' in ('player-one', 'player-two')
        and coalesce(move.move_value ->> 'guess', '') <> ''
    ),
    safe_moves as (
      select
        raw_moves.seat,
        raw_moves.puzzle_index,
        raw_moves.guess,
        raw_moves.created_at_text,
        raw_moves.move_ordinality,
        coalesce((
          select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
            'letter', upper(left(coalesce(tile.tile_value ->> 'letter', ''), 1)),
            'state',
              case
                when tile.tile_value ->> 'state' in ('correct', 'present', 'absent') then tile.tile_value ->> 'state'
                else null
              end
          )) order by tile.tile_ordinality)
          from jsonb_array_elements(
            case
              when jsonb_typeof(raw_moves.move_value -> 'tiles') = 'array' then raw_moves.move_value -> 'tiles'
              else '[]'::jsonb
            end
          ) with ordinality as tile(tile_value, tile_ordinality)
          where tile.tile_value ->> 'state' in ('correct', 'present', 'absent')
        ), '[]'::jsonb) as tiles,
        coalesce((
          select count(*) > 0 and bool_and(tile.tile_value ->> 'state' = 'correct')
          from jsonb_array_elements(
            case
              when jsonb_typeof(raw_moves.move_value -> 'tiles') = 'array' then raw_moves.move_value -> 'tiles'
              else '[]'::jsonb
            end
          ) as tile(tile_value)
        ), false) as all_correct
      from raw_moves
    )
    select
      coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'seat', safe_moves.seat,
        'puzzleIndex', safe_moves.puzzle_index,
        'guess', safe_moves.guess,
        'tiles', safe_moves.tiles,
        'createdAt', safe_moves.created_at_text
      )) order by safe_moves.created_at_text nulls last, safe_moves.move_ordinality), '[]'::jsonb) as moves,
      count(*)::integer as move_count,
      (count(distinct safe_moves.puzzle_index) filter (where safe_moves.all_correct))::integer as solved_puzzle_count,
      max(safe_moves.created_at_text) as latest_move_at
    from safe_moves
  ) move_projection;
$$;

comment on function public.get_authenticated_live_v1_spectator_games(integer)
  is 'Returns sanitized authenticated-only Live v1 spectator projections for active async_multiplayer_games without exposing raw projection/session/answer data.';

revoke all on function public.get_authenticated_live_v1_spectator_games(integer) from public;
revoke all on function public.get_authenticated_live_v1_spectator_games(integer) from anon;
grant execute on function public.get_authenticated_live_v1_spectator_games(integer) to authenticated;
