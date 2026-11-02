-- Phase 38 Stage 38.3: public/guest Practice Live spectator projection.
--
-- This additive migration creates a dedicated public spectator RPC instead of
-- broadening the authenticated spectator or participant identity RPCs. It
-- exposes only sanitized Practice Multiplayer display/progress data and
-- read-only capability flags. Current Daily Multiplayer remains excluded.

create or replace function public.get_public_live_v1_spectator_games_v1(
  p_limit integer default 25,
  p_terminal_window_seconds integer default 15,
  p_game_id text default null
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
set search_path = public, pg_temp
as $$
  with settings as (
    select
      least(greatest(coalesce(p_limit, 25), 0), 50)::integer as row_limit,
      least(greatest(coalesce(p_terminal_window_seconds, 15), 0), 30)::integer as terminal_window_seconds,
      nullif(left(btrim(coalesce(p_game_id, '')), 128), '') as target_game_id
  ),
  eligible as (
    select
      game.*,
      case
        when game.status in ('won', 'lost', 'expired') then coalesce(game.ended_at, game.updated_at)
        else null
      end as terminal_at
    from public.async_multiplayer_games game
    cross join settings
    where game.scope = 'practice'
      and game.status in ('playing', 'won', 'lost', 'expired')
      and game.player_one_user_id is not null
      and game.player_two_user_id is not null
      and (
        settings.target_game_id is null
        or game.id = settings.target_game_id
      )
      and (
        game.status = 'playing'
        or (
          game.status in ('won', 'lost', 'expired')
          and coalesce(game.ended_at, game.updated_at) >= now() - (settings.terminal_window_seconds * interval '1 second')
        )
      )
    order by
      case
        when game.status = 'playing' then game.updated_at
        else coalesce(game.ended_at, game.updated_at)
      end desc,
      game.id
    limit (
      select case
        when target_game_id is not null then 1
        else row_limit
      end
      from settings
    )
  )
  select
    game.id,
    game.scope,
    game.mode,
    game.status,
    game.word_length,
    game.go_puzzle_count,
    case
      when lower(coalesce(game.projection ->> 'hardMode', 'false')) = 'true' then true
      else false
    end as hard_mode,
    game.ranked,
    case
      when game.current_turn in ('player-one', 'player-two') then game.current_turn
      else null
    end as current_turn_seat,
    game.created_at,
    game.updated_at,
    game.terminal_at,
    player_projection.players,
    move_projection.moves,
    jsonb_strip_nulls(jsonb_build_object(
      'moveCount', move_projection.move_count,
      'currentPuzzleIndex', move_projection.current_puzzle_index,
      'solvedPuzzleCount', move_projection.solved_puzzle_count,
      'latestMoveAt', move_projection.latest_move_at
    )) as progress,
    jsonb_strip_nulls(jsonb_build_object(
      'terminal', game.status in ('won', 'lost', 'expired'),
      'status', game.status,
      'winnerSeat',
        case
          when game.winner_player_id in ('player-one', 'player-two') then game.winner_player_id
          else null
        end,
      'label',
        case
          when game.status = 'playing' then 'In progress'
          when game.winner_player_id = 'player-one' then 'Player one won'
          when game.winner_player_id = 'player-two' then 'Player two won'
          when game.status = 'expired' then 'Expired'
          else 'Game ended'
        end,
      'terminalAt', game.terminal_at
    )) as outcome,
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
    ) as spectator_capabilities
  from eligible game
  cross join lateral (
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'seat', seat.seat,
      'label', coalesce(nullif(profile.display_name, ''), initcap(replace(seat.seat, '-', ' '))),
      'profile',
        case
          when profile.user_id is not null then jsonb_strip_nulls(jsonb_build_object(
            'displayName', nullif(profile.display_name, ''),
            'avatarUrl', nullif(profile.avatar_url, ''),
            'accentColor', nullif(profile.accent_color, ''),
            'initials', nullif(upper(left(regexp_replace(coalesce(profile.display_name, ''), '[^[:alnum:]]', '', 'g'), 2)), '')
          ))
          else null
        end
    )) order by seat.sort_order), '[]'::jsonb) as players
    from (values ('player-one', 1, game.player_one_user_id), ('player-two', 2, game.player_two_user_id)) as seat(seat, sort_order, participant_user_id)
    left join public.public_player_profiles as profile
      on profile.user_id = seat.participant_user_id
      and profile.visibility = 'public'
      and profile.moderation_status = 'active'
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
      coalesce(max(safe_moves.puzzle_index), 0)::integer as current_puzzle_index,
      (count(distinct safe_moves.puzzle_index) filter (where safe_moves.all_correct))::integer as solved_puzzle_count,
      max(safe_moves.created_at_text) as latest_move_at
    from safe_moves
  ) move_projection;
$$;

comment on function public.get_public_live_v1_spectator_games_v1(integer, integer, text)
  is 'Phase 38 dedicated public/guest Practice Live spectator projection with safe active public profile summaries, current Daily exclusion, bounded terminal visibility, and read-only capabilities.';

revoke all on function public.get_public_live_v1_spectator_games_v1(integer, integer, text)
  from public, anon, authenticated;

grant execute on function public.get_public_live_v1_spectator_games_v1(integer, integer, text)
  to anon, authenticated;
