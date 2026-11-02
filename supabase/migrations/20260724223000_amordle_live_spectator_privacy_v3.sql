-- Amordle privacy-safe Practice Live projections.
--
-- The retained shell RPCs predate durable private-request, rematch, custom,
-- Daily, and Amordle-v2 provenance. Preserve every historical signature while
-- routing each granted browser path through one provenance-complete boundary.
-- The prior implementations remain available only under revoked internal
-- compatibility names so version-zero shell rows can still be projected.

do $$
begin
  if to_regprocedure(
    'public.amordle_legacy_public_live_v1_spectator_games_v1(integer,integer,text)'
  ) is null
    and to_regprocedure(
      'public.get_public_live_v1_spectator_games_v1(integer,integer,text)'
    ) is not null
  then
    alter function public.get_public_live_v1_spectator_games_v1(integer, integer, text)
      rename to amordle_legacy_public_live_v1_spectator_games_v1;
  end if;

  if to_regprocedure(
    'public.amordle_legacy_authenticated_live_v1_spectator_games_v2(integer,integer)'
  ) is null
    and to_regprocedure(
      'public.get_authenticated_live_v1_spectator_games_v2(integer,integer)'
    ) is not null
  then
    alter function public.get_authenticated_live_v1_spectator_games_v2(integer, integer)
      rename to amordle_legacy_authenticated_live_v1_spectator_games_v2;
  end if;

  if to_regprocedure(
    'public.amordle_legacy_authenticated_live_v1_spectator_games(integer)'
  ) is null
    and to_regprocedure(
      'public.get_authenticated_live_v1_spectator_games(integer)'
    ) is not null
  then
    alter function public.get_authenticated_live_v1_spectator_games(integer)
      rename to amordle_legacy_authenticated_live_v1_spectator_games;
  end if;
end
$$;

revoke all on function
  public.amordle_legacy_public_live_v1_spectator_games_v1(integer, integer, text)
  from public, anon, authenticated;
revoke all on function
  public.amordle_legacy_authenticated_live_v1_spectator_games_v2(integer, integer)
  from public, anon, authenticated;
revoke all on function
  public.amordle_legacy_authenticated_live_v1_spectator_games(integer)
  from public, anon, authenticated;

create or replace function public.get_public_live_v1_spectator_games_v2(
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
set search_path = ''
as $$
  with settings as (
    select
      least(greatest(coalesce(p_limit, 25), 0), 50)::integer as row_limit,
      least(greatest(coalesce(p_terminal_window_seconds, 15), 0), 30)::integer
        as terminal_window_seconds,
      nullif(left(btrim(coalesce(p_game_id, '')), 200), '') as target_game_id
  ),
  safe_legacy as (
    select
      spectator.id,
      spectator.scope,
      spectator.mode,
      spectator.status,
      spectator.word_length,
      spectator.go_puzzle_count,
      spectator.hard_mode,
      spectator.ranked,
      spectator.current_turn_seat,
      spectator.created_at,
      spectator.updated_at,
      spectator.terminal_at,
      spectator.players,
      spectator.moves,
      spectator.progress,
      spectator.outcome,
      spectator.spectator_capabilities
    from public.amordle_legacy_public_live_v1_spectator_games_v1(
      50,
      (select terminal_window_seconds from settings),
      (select target_game_id from settings)
    ) spectator
    join public.async_multiplayer_games game_row on game_row.id = spectator.id
    where game_row.authority_version = 0
      and game_row.scope = 'practice'
      and game_row.daily_date_key is null
      and game_row.custom_game_code is null
      and not exists (
        select 1
        from public.multiplayer_private_match_requests private_request
        where private_request.created_game_id = game_row.id
      )
      and not exists (
        select 1
        from public.multiplayer_practice_rematch_requests rematch_request
        where rematch_request.created_game_id = game_row.id
      )
  ),
  safe_v2 as (
    select
      authority.game_id as id,
      authority.scope,
      authority.mode,
      case
        when authority.status in ('playing', 'holding') then 'playing'
        when authority.status = 'cancelled' then 'cancelled'
        else 'won'
      end as status,
      authority.word_length,
      authority.go_puzzle_count,
      authority.hard_mode,
      authority.ranked,
      case
        when authority.status in ('playing', 'holding') then authority.current_turn
        else null
      end as current_turn_seat,
      authority.created_at,
      authority.updated_at,
      authority.ended_at as terminal_at,
      player_projection.players,
      move_projection.moves,
      jsonb_strip_nulls(jsonb_build_object(
        'moveCount', move_projection.move_count,
        'currentPuzzleIndex', authority.current_puzzle_index,
        'solvedPuzzleCount', move_projection.solved_puzzle_count,
        'latestMoveAt', move_projection.latest_move_at
      )) as progress,
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
            when profile.public_profile_id is not null
              then jsonb_strip_nulls(jsonb_build_object(
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
    where authority.scope = 'practice'
      and authority.visibility_kind = 'public'
      and authority.source_kind = 'ranked_queue'
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
  ),
  combined as (
    select * from safe_legacy
    union all
    select * from safe_v2
  )
  select *
  from combined
  order by updated_at desc, id
  limit (
    select case
      when target_game_id is not null then 1
      else row_limit
    end
    from settings
  )
$$;

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
set search_path = ''
as $$
  select *
  from public.get_public_live_v1_spectator_games_v2(
    p_limit,
    p_terminal_window_seconds,
    p_game_id
  )
$$;

create or replace function public.get_authenticated_live_v1_spectator_games_v3(
  p_limit integer default 50,
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
set search_path = ''
as $$
  select spectator.*
  from public.get_public_live_v1_spectator_games_v2(
    p_limit,
    p_terminal_window_seconds,
    p_game_id
  ) spectator
  join public.async_multiplayer_games game_row on game_row.id = spectator.id
  where auth.uid() is not null
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is false
    and auth.uid() is distinct from game_row.player_one_user_id
    and auth.uid() is distinct from game_row.player_two_user_id
    and auth.uid() is distinct from game_row.host_user_id
  order by spectator.updated_at desc, spectator.id
$$;

create or replace function public.get_authenticated_live_v1_spectator_games_v2(
  p_limit integer default 50,
  p_terminal_window_seconds integer default 15
)
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
  ended_at timestamptz,
  terminal_at timestamptz,
  terminal_hold_until timestamptz,
  time_limit_ms integer,
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
  select
    spectator.id,
    spectator.scope,
    spectator.mode,
    spectator.status,
    null::text as daily_date_key,
    spectator.word_length,
    game_row.difficulty,
    spectator.go_puzzle_count,
    spectator.hard_mode,
    spectator.ranked,
    case
      when game_row.authority_version = 0 then game_row.rating_bucket
      else null
    end as rating_bucket,
    spectator.current_turn_seat,
    spectator.created_at,
    spectator.updated_at,
    game_row.deadline_at,
    coalesce(game_row.ended_at, spectator.terminal_at) as ended_at,
    spectator.terminal_at,
    case
      when spectator.terminal_at is not null
        then spectator.terminal_at
          + (
            least(greatest(coalesce(p_terminal_window_seconds, 15), 0), 60)
            * interval '1 second'
          )
      else null
    end as terminal_hold_until,
    case
      when game_row.authority_version = 2 then authority.time_limit_ms
      when (game_row.projection ->> 'timeLimitMs') ~ '^[0-9]+$'
        then (game_row.projection ->> 'timeLimitMs')::integer
      else null
    end as time_limit_ms,
    spectator.players,
    spectator.moves,
    spectator.progress,
    spectator.outcome,
    jsonb_build_object(
      'canSubmitGuess', false,
      'canForfeit', false,
      'canCancel', false,
      'canJoin', false,
      'canMutate', false
    ) as spectator_capabilities
  from public.get_authenticated_live_v1_spectator_games_v3(
    p_limit,
    p_terminal_window_seconds,
    null
  ) spectator
  join public.async_multiplayer_games game_row on game_row.id = spectator.id
  left join brrrdle_private.amordle_combat_authority authority
    on authority.game_id = spectator.id
  order by spectator.updated_at desc, spectator.id
$$;

create or replace function public.get_authenticated_live_v1_spectator_games(
  p_limit integer default 50
)
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
set search_path = ''
as $$
  select
    spectator.id,
    spectator.scope,
    spectator.mode,
    spectator.status,
    spectator.daily_date_key,
    spectator.word_length,
    spectator.difficulty,
    spectator.go_puzzle_count,
    spectator.hard_mode,
    spectator.ranked,
    spectator.rating_bucket,
    spectator.current_turn_seat,
    spectator.created_at,
    spectator.updated_at,
    spectator.deadline_at,
    spectator.time_limit_ms,
    spectator.players,
    spectator.moves,
    spectator.progress,
    spectator.spectator_capabilities
  from public.get_authenticated_live_v1_spectator_games_v2(
    p_limit,
    15
  ) spectator
  where spectator.status = 'playing'
  order by spectator.updated_at desc, spectator.id
$$;

comment on function public.get_public_live_v1_spectator_games_v2(integer, integer, text)
  is 'Returns one provenance-complete privacy-safe public Practice Live projection for legacy and Amordle-v2 games.';
comment on function public.get_public_live_v1_spectator_games_v1(integer, integer, text)
  is 'Compatibility signature routed through the Amordle provenance-complete public Practice Live boundary.';
comment on function public.get_authenticated_live_v1_spectator_games_v3(integer, integer, text)
  is 'Returns the provenance-complete privacy-safe nonparticipant Practice Live projection for authenticated viewers.';
comment on function public.get_authenticated_live_v1_spectator_games_v2(integer, integer)
  is 'Compatibility signature routed through the Amordle provenance-complete authenticated Practice Live boundary.';
comment on function public.get_authenticated_live_v1_spectator_games(integer)
  is 'Compatibility signature routed through the Amordle provenance-complete authenticated active Practice Live boundary.';

revoke all on function public.get_public_live_v1_spectator_games_v2(integer, integer, text)
  from public, anon, authenticated;
revoke all on function public.get_public_live_v1_spectator_games_v1(integer, integer, text)
  from public, anon, authenticated;
revoke all on function public.get_authenticated_live_v1_spectator_games_v3(integer, integer, text)
  from public, anon, authenticated;
revoke all on function public.get_authenticated_live_v1_spectator_games_v2(integer, integer)
  from public, anon, authenticated;
revoke all on function public.get_authenticated_live_v1_spectator_games(integer)
  from public, anon, authenticated;

grant execute on function public.get_public_live_v1_spectator_games_v2(integer, integer, text)
  to anon, authenticated;
grant execute on function public.get_public_live_v1_spectator_games_v1(integer, integer, text)
  to anon, authenticated;
grant execute on function public.get_authenticated_live_v1_spectator_games_v3(integer, integer, text)
  to authenticated;
grant execute on function public.get_authenticated_live_v1_spectator_games_v2(integer, integer)
  to authenticated;
grant execute on function public.get_authenticated_live_v1_spectator_games(integer)
  to authenticated;
