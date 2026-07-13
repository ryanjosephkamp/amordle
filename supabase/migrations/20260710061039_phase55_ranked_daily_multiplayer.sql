-- Phase 55: ranked Daily Multiplayer authority.
--
-- This additive migration preserves ranked Practice and unranked Daily data,
-- adds independent ranked Daily claim lanes, and exposes participant-scoped
-- ranked Daily queue/finalization/settlement RPCs. It is intentionally local
-- and unapplied until the separately authorized Phase 55 remote gate.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.phase55_ranked_storage_bucket(
  p_scope text,
  p_mode text,
  p_time_limit_ms integer
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when lower(coalesce(p_scope, '')) = 'practice'
      then public.phase33_ranked_practice_storage_bucket_for_mode_and_time_limit(p_mode, p_time_limit_ms)
    when lower(coalesce(p_scope, '')) = 'daily'
      and p_time_limit_ms is null
      and lower(coalesce(p_mode, '')) = 'og'
      then 'async:og:daily:v1'
    when lower(coalesce(p_scope, '')) = 'daily'
      and p_time_limit_ms is null
      and lower(coalesce(p_mode, '')) = 'go'
      then 'async:go:daily:v1'
    else null
  end
$$;

create or replace function public.phase55_ranked_app_bucket(p_storage_bucket text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case coalesce(p_storage_bucket, '')
    when 'async:og' then 'multiplayer:og'
    when 'async:go' then 'multiplayer:go'
    when 'async:og:timed:v1' then 'multiplayer:og:timed:v1'
    when 'async:go:timed:v1' then 'multiplayer:go:timed:v1'
    when 'async:og:daily:v1' then 'multiplayer:og:daily:v1'
    when 'async:go:daily:v1' then 'multiplayer:go:daily:v1'
    else null
  end
$$;

create or replace function public.phase55_ranked_queue_settings_are_valid(
  p_scope text,
  p_daily_date_key text,
  p_mode text,
  p_word_length integer,
  p_rating_bucket text,
  p_time_limit_ms integer
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case lower(coalesce(p_scope, ''))
    when 'practice' then
      p_daily_date_key is null
      and p_word_length between 2 and 35
      and public.phase33_is_ranked_practice_time_limit_supported(p_time_limit_ms)
      and p_rating_bucket = public.phase33_ranked_practice_storage_bucket_for_mode_and_time_limit(p_mode, p_time_limit_ms)
    when 'daily' then
      p_daily_date_key = ((now() at time zone 'UTC')::date)::text
      and p_word_length = 5
      and p_time_limit_ms is null
      and p_rating_bucket = public.phase55_ranked_storage_bucket('daily', p_mode, null)
    else false
  end
$$;

do $$
begin
  alter table public.async_multiplayer_games
    drop constraint if exists async_multiplayer_games_rating_bucket_check;
  alter table public.async_multiplayer_games
    add constraint async_multiplayer_games_rating_bucket_check
    check (rating_bucket = any (array[
      'async:og'::text,
      'async:go'::text,
      'live:og'::text,
      'live:go'::text,
      'async:og:timed:v1'::text,
      'async:go:timed:v1'::text,
      'async:og:daily:v1'::text,
      'async:go:daily:v1'::text
    ]));

  alter table public.multiplayer_matchmaking_queue
    drop constraint if exists multiplayer_matchmaking_queue_rating_bucket_check;
  alter table public.multiplayer_matchmaking_queue
    add constraint multiplayer_matchmaking_queue_rating_bucket_check
    check (rating_bucket = any (array[
      'async:og'::text,
      'async:go'::text,
      'live:og'::text,
      'live:go'::text,
      'async:og:timed:v1'::text,
      'async:go:timed:v1'::text,
      'async:og:daily:v1'::text,
      'async:go:daily:v1'::text
    ]));

  alter table public.multiplayer_rating_profiles
    drop constraint if exists multiplayer_rating_profiles_bucket_check;
  alter table public.multiplayer_rating_profiles
    add constraint multiplayer_rating_profiles_bucket_check
    check (bucket = any (array[
      'async:og'::text,
      'async:go'::text,
      'live:og'::text,
      'live:go'::text,
      'async:og:timed:v1'::text,
      'async:go:timed:v1'::text,
      'async:og:daily:v1'::text,
      'async:go:daily:v1'::text
    ]));

  alter table public.multiplayer_match_results
    drop constraint if exists multiplayer_match_results_rating_bucket_check;
  alter table public.multiplayer_match_results
    add constraint multiplayer_match_results_rating_bucket_check
    check (rating_bucket = any (array[
      'async:og'::text,
      'async:go'::text,
      'live:og'::text,
      'live:go'::text,
      'async:og:timed:v1'::text,
      'async:go:timed:v1'::text,
      'async:og:daily:v1'::text,
      'async:go:daily:v1'::text
    ]));

  alter table public.multiplayer_rating_transactions
    drop constraint if exists multiplayer_rating_transactions_bucket_check;
  alter table public.multiplayer_rating_transactions
    add constraint multiplayer_rating_transactions_bucket_check
    check (bucket = any (array[
      'async:og'::text,
      'async:go'::text,
      'live:og'::text,
      'live:go'::text,
      'async:og:timed:v1'::text,
      'async:go:timed:v1'::text,
      'async:og:daily:v1'::text,
      'async:go:daily:v1'::text
    ]));
end $$;

-- Ranked Daily competitive authority is isolated from the exposed API schema.
-- Browser roles can read only the answerless public projection and can mutate a
-- ranked Daily game only through the narrow action RPC defined below.
create schema if not exists brrrdle_private;
revoke all on schema brrrdle_private from public, anon, authenticated;

create table if not exists brrrdle_private.ranked_daily_word_catalog (
  kind text not null check (kind in ('answer', 'valid_guess')),
  ordinal integer not null check (ordinal > 0),
  word text not null check (word ~ '^[a-z]{5}$'),
  primary key (kind, word),
  unique (kind, ordinal)
);

create table if not exists brrrdle_private.ranked_daily_pair_reservations (
  game_id text primary key,
  request_one_id text not null unique references public.multiplayer_matchmaking_queue(id),
  request_two_id text not null unique references public.multiplayer_matchmaking_queue(id),
  player_one_user_id uuid not null,
  player_two_user_id uuid not null,
  daily_date_key text not null check (daily_date_key ~ '^\d{4}-\d{2}-\d{2}$'),
  mode text not null check (mode in ('og', 'go')),
  hard_mode boolean not null,
  rating_bucket text not null check (rating_bucket in ('async:og:daily:v1', 'async:go:daily:v1')),
  matched_at timestamptz not null default now(),
  finalized_at timestamptz,
  check (request_one_id <> request_two_id),
  check (player_one_user_id <> player_two_user_id),
  check ((mode = 'og' and rating_bucket = 'async:og:daily:v1') or (mode = 'go' and rating_bucket = 'async:go:daily:v1'))
);

create table if not exists brrrdle_private.ranked_daily_game_authority (
  game_id text primary key references brrrdle_private.ranked_daily_pair_reservations(game_id),
  daily_date_key text not null check (daily_date_key ~ '^\d{4}-\d{2}-\d{2}$'),
  mode text not null check (mode in ('og', 'go')),
  hard_mode boolean not null,
  go_puzzle_count integer,
  answers text[] not null,
  player_one_user_id uuid not null,
  player_two_user_id uuid not null,
  current_turn text not null check (current_turn in ('player-one', 'player-two')),
  current_puzzle_index integer not null default 0 check (current_puzzle_index between 0 and 4),
  version integer not null default 0 check (version >= 0),
  move_count integer not null default 0 check (move_count >= 0),
  terminal_status text not null default 'playing' check (terminal_status in ('playing', 'completed', 'cancelled')),
  winner_player_id text check (winner_player_id is null or winner_player_id in ('player-one', 'player-two')),
  forfeited_player_id text check (forfeited_player_id is null or forfeited_player_id in ('player-one', 'player-two')),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (player_one_user_id <> player_two_user_id),
  check ((mode = 'og' and go_puzzle_count is null and cardinality(answers) = 1)
    or (mode = 'go' and go_puzzle_count = 5 and cardinality(answers) = 5)),
  check (array_position(answers, null) is null),
  check (array_to_string(answers, ',') ~ '^[a-z]{5}(,[a-z]{5})*$'),
  check ((terminal_status = 'playing' and winner_player_id is null and forfeited_player_id is null and ended_at is null)
    or (terminal_status = 'cancelled' and winner_player_id is null and ended_at is not null)
    or (terminal_status = 'completed' and ended_at is not null)),
  check (forfeited_player_id is null or winner_player_id is distinct from forfeited_player_id)
);

create table if not exists brrrdle_private.ranked_daily_action_ledger (
  game_id text not null references brrrdle_private.ranked_daily_game_authority(game_id),
  sequence_no integer not null check (sequence_no > 0),
  action_id text not null check (length(action_id) between 1 and 200),
  action_type text not null check (action_type in ('guess', 'forfeit', 'cancel')),
  player_user_id uuid not null,
  player_id text not null check (player_id in ('player-one', 'player-two')),
  puzzle_index integer,
  guess text,
  tiles jsonb,
  created_at timestamptz not null default now(),
  primary key (game_id, sequence_no),
  unique (game_id, action_id),
  check (
    (action_type = 'guess' and puzzle_index between 0 and 4 and guess ~ '^[a-z]{5}$' and jsonb_typeof(tiles) = 'array')
    or (action_type in ('forfeit', 'cancel') and puzzle_index is null and guess is null and tiles is null)
  )
);

revoke all on all tables in schema brrrdle_private from public, anon, authenticated;

create or replace function public.phase55_ranked_daily_lane_lock_key(
  p_user_id uuid,
  p_daily_date_key text,
  p_mode text
)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select hashtextextended(
    'phase55-ranked-daily-lane:' || coalesce(p_user_id::text, '') || ':' ||
    coalesce(p_daily_date_key, '') || ':' || lower(coalesce(p_mode, '')),
    0
  )
$$;

create or replace function public.phase55_ranked_daily_tiles(
  p_guess text,
  p_answer text
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_guess text := lower(coalesce(p_guess, ''));
  v_answer text := lower(coalesce(p_answer, ''));
  v_states text[] := array_fill('absent'::text, array[5]);
  v_remaining jsonb := '{}'::jsonb;
  v_letter text;
  v_count integer;
  v_result jsonb;
  v_index integer;
begin
  if v_guess !~ '^[a-z]{5}$' or v_answer !~ '^[a-z]{5}$' then
    return null;
  end if;

  for v_index in 1..5 loop
    if substring(v_guess from v_index for 1) = substring(v_answer from v_index for 1) then
      v_states[v_index] := 'correct';
    else
      v_letter := substring(v_answer from v_index for 1);
      v_count := coalesce((v_remaining ->> v_letter)::integer, 0) + 1;
      v_remaining := jsonb_set(v_remaining, array[v_letter], to_jsonb(v_count), true);
    end if;
  end loop;

  for v_index in 1..5 loop
    if v_states[v_index] = 'correct' then
      continue;
    end if;
    v_letter := substring(v_guess from v_index for 1);
    v_count := coalesce((v_remaining ->> v_letter)::integer, 0);
    if v_count > 0 then
      v_states[v_index] := 'present';
      v_remaining := jsonb_set(v_remaining, array[v_letter], to_jsonb(v_count - 1), true);
    end if;
  end loop;

  select jsonb_agg(
    jsonb_build_object(
      'letter', substring(v_guess from item.index for 1),
      'state', v_states[item.index]
    ) order by item.index
  )
  into v_result
  from generate_series(1, 5) as item(index);

  return v_result;
end;
$$;

create or replace function public.phase55_ranked_daily_hard_mode_guess_is_valid(
  p_moves jsonb,
  p_puzzle_index integer,
  p_guess text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with prior_moves as (
    select move.value as move_value
    from jsonb_array_elements(
      case when jsonb_typeof(p_moves) = 'array' then p_moves else '[]'::jsonb end
    ) as move(value)
    where coalesce(move.value ->> 'puzzleIndex', '-1') ~ '^[0-9]+$'
      and (move.value ->> 'puzzleIndex')::integer = p_puzzle_index
  ), tiles as (
    select
      tile.value ->> 'letter' as letter,
      tile.value ->> 'state' as state,
      tile.ordinality::integer as position,
      prior_moves.move_value ->> 'id' as move_id
    from prior_moves
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(prior_moves.move_value -> 'tiles') = 'array'
        then prior_moves.move_value -> 'tiles' else '[]'::jsonb end
    ) with ordinality as tile(value, ordinality)
  ), required_counts as (
    select letter, max(known_count)::integer as required_count
    from (
      select move_id, letter, count(*)::integer as known_count
      from tiles
      where state in ('correct', 'present')
      group by move_id, letter
    ) per_move
    group by letter
  ), forbidden_letters as (
    select distinct absent.letter
    from tiles absent
    where absent.state = 'absent'
      and not exists (
        select 1 from tiles known
        where known.letter = absent.letter and known.state in ('correct', 'present')
      )
  )
  select
    lower(coalesce(p_guess, '')) ~ '^[a-z]{5}$'
    and not exists (
      select 1 from tiles
      where state = 'correct'
        and substring(lower(p_guess) from position for 1) <> letter
    )
    and not exists (
      select 1 from required_counts
      where length(lower(p_guess)) - length(replace(lower(p_guess), letter, '')) < required_count
    )
    and not exists (
      select 1 from forbidden_letters
      where position(letter in lower(p_guess)) > 0
    )
$$;

create or replace function public.phase55_ranked_daily_session_answers(
  p_serialized_session jsonb,
  p_mode text
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_answers jsonb;
begin
  if lower(coalesce(p_mode, '')) = 'og' then
    return jsonb_build_array(p_serialized_session #>> '{session,answer}');
  end if;
  if lower(coalesce(p_mode, '')) <> 'go' then
    return null;
  end if;
  select jsonb_agg(to_jsonb(puzzle.value ->> 'answer') order by puzzle.ordinality)
  into v_answers
  from jsonb_array_elements(
    case when jsonb_typeof(p_serialized_session #> '{session,puzzles}') = 'array'
      then p_serialized_session #> '{session,puzzles}' else '[]'::jsonb end
  ) with ordinality as puzzle(value, ordinality);
  return v_answers;
end;
$$;

create or replace function public.phase55_ranked_daily_player_points(
  p_moves jsonb,
  p_player_id text,
  p_hard_mode boolean
)
returns integer
language sql
immutable
set search_path = ''
as $$
  with player_moves as (
    select move.value as move_value
    from jsonb_array_elements(
      case when jsonb_typeof(p_moves) = 'array' then p_moves else '[]'::jsonb end
    ) as move(value)
    where move.value ->> 'playerId' = p_player_id
  ), move_scores as (
    select
      (move_value ->> 'puzzleIndex')::integer as puzzle_index,
      case when not exists (
        select 1
        from jsonb_array_elements(move_value -> 'tiles') as tile(value)
        where tile.value ->> 'state' <> 'correct'
      ) then true else false end as solved,
      coalesce((
        select sum(case tile.value ->> 'state'
          when 'correct' then 5 when 'present' then 2 else 0 end)
        from jsonb_array_elements(move_value -> 'tiles') as tile(value)
      ), 0)::integer as tile_points
    from player_moves
  ), puzzle_scores as (
    select
      puzzle_index,
      count(*)::integer as attempts,
      bool_or(solved) as solved,
      sum(tile_points)::integer as tile_points
    from move_scores
    group by puzzle_index
  )
  select coalesce(sum(
    tile_points + case when solved then
      100 + greatest(0, 6 - attempts) * 10 + case when p_hard_mode then 15 else 0 end
    else 0 end
  ), 0)::integer
  from puzzle_scores
$$;

create or replace function brrrdle_private.phase55_u32(p_value bigint)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select mod(mod(p_value, 4294967296::bigint) + 4294967296::bigint, 4294967296::bigint)
$$;

create or replace function brrrdle_private.phase55_fnv1a(p_value text)
returns bigint
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_hash bigint := 2166136261;
  v_index integer;
begin
  for v_index in 1..length(coalesce(p_value, '')) loop
    v_hash := brrrdle_private.phase55_u32(
      (v_hash # ascii(substring(p_value from v_index for 1))::bigint) * 16777619::bigint
    );
  end loop;
  return v_hash;
end;
$$;

create or replace function brrrdle_private.phase55_daily_go_seed_index(
  p_day bigint,
  p_answer_count integer
)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_hash bigint;
  v_og_index integer;
begin
  if p_answer_count < 1 then
    raise exception 'Ranked Daily answer catalog is empty.' using errcode = '22023';
  end if;
  v_og_index := mod(p_day, p_answer_count)::integer;
  if p_answer_count = 1 then
    return v_og_index;
  end if;
  v_hash := brrrdle_private.phase55_u32(p_day # 2654435769::bigint);
  v_hash := brrrdle_private.phase55_u32((v_hash # (v_hash >> 16)) * 73244475::bigint);
  v_hash := brrrdle_private.phase55_u32((v_hash # (v_hash >> 16)) * 73244475::bigint);
  v_hash := brrrdle_private.phase55_u32(v_hash # (v_hash >> 16));
  return mod(v_og_index + 1 + mod(v_hash, p_answer_count - 1), p_answer_count)::integer;
end;
$$;

create or replace function brrrdle_private.phase55_ranked_daily_answers(
  p_daily_date_key text,
  p_mode text
)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  v_answer_count integer;
  v_base_index integer;
  v_candidate_index integer;
  v_date date;
  v_day bigint;
  v_displacement integer;
  v_family text := lower(coalesce(p_mode, ''));
  v_initial_displacement integer;
  v_puzzle_count integer;
  v_ranked_words text[];
  v_unranked_index integer;
  v_unranked_word text;
  v_ranked_word text;
  v_attempt integer;
  v_offset integer;
  v_collision boolean;
begin
  if p_daily_date_key !~ '^\d{4}-\d{2}-\d{2}$' or v_family not in ('og', 'go') then
    raise exception 'Ranked Daily answer key is invalid.' using errcode = '22023';
  end if;
  v_date := p_daily_date_key::date;
  v_day := v_date - date '1970-01-01';
  v_puzzle_count := case when v_family = 'og' then 1 else 5 end;

  select count(*)::integer into v_answer_count
  from brrrdle_private.ranked_daily_word_catalog catalog
  where catalog.kind = 'answer';
  if v_answer_count < 6 then
    raise exception 'Ranked Daily answer catalog is incomplete.' using errcode = '22023';
  end if;

  v_base_index := case when v_family = 'og'
    then mod(v_day, v_answer_count)::integer
    else brrrdle_private.phase55_daily_go_seed_index(v_day, v_answer_count)
  end;
  v_unranked_index := mod(
    v_base_index + 1 + mod(
      brrrdle_private.phase55_fnv1a(p_daily_date_key || ':' || v_family || ':multiplayer'),
      v_answer_count - 1
    ),
    v_answer_count
  )::integer;
  v_initial_displacement := 1 + mod(
    brrrdle_private.phase55_fnv1a(p_daily_date_key || ':' || v_family || ':multiplayer:ranked'),
    v_answer_count - 1
  )::integer;

  for v_attempt in 0..(v_answer_count - 2) loop
    v_displacement := 1 + mod(v_initial_displacement - 1 + v_attempt, v_answer_count - 1);
    v_candidate_index := mod(v_unranked_index + v_displacement, v_answer_count);
    v_collision := false;
    for v_offset in 0..(v_puzzle_count - 1) loop
      select catalog.word into v_unranked_word
      from brrrdle_private.ranked_daily_word_catalog catalog
      where catalog.kind = 'answer'
        and catalog.ordinal = mod(v_unranked_index + v_offset, v_answer_count) + 1;
      select catalog.word into v_ranked_word
      from brrrdle_private.ranked_daily_word_catalog catalog
      where catalog.kind = 'answer'
        and catalog.ordinal = mod(v_candidate_index + v_offset, v_answer_count) + 1;
      if v_ranked_word is not distinct from v_unranked_word then
        v_collision := true;
        exit;
      end if;
    end loop;
    if not v_collision then
      select array_agg(catalog.word order by item.puzzle_offset)
      into v_ranked_words
      from generate_series(0, v_puzzle_count - 1) as item(puzzle_offset)
      join brrrdle_private.ranked_daily_word_catalog catalog
        on catalog.kind = 'answer'
       and catalog.ordinal = mod(v_candidate_index + item.puzzle_offset, v_answer_count) + 1;
      return v_ranked_words;
    end if;
  end loop;

  raise exception 'Unable to select distinct ranked Daily answers.' using errcode = '22023';
end;
$$;

create or replace function brrrdle_private.phase55_ranked_daily_tiles(
  p_guess text,
  p_answer text
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_guess text := lower(coalesce(p_guess, ''));
  v_answer text := lower(coalesce(p_answer, ''));
  v_states text[] := array_fill('absent'::text, array[5]);
  v_remaining jsonb := '{}'::jsonb;
  v_letter text;
  v_count integer;
  v_result jsonb;
  v_index integer;
begin
  if v_guess !~ '^[a-z]{5}$' or v_answer !~ '^[a-z]{5}$' then
    return null;
  end if;
  for v_index in 1..5 loop
    if substring(v_guess from v_index for 1) = substring(v_answer from v_index for 1) then
      v_states[v_index] := 'correct';
    else
      v_letter := substring(v_answer from v_index for 1);
      v_count := coalesce((v_remaining ->> v_letter)::integer, 0) + 1;
      v_remaining := jsonb_set(v_remaining, array[v_letter], to_jsonb(v_count), true);
    end if;
  end loop;
  for v_index in 1..5 loop
    if v_states[v_index] <> 'correct' then
      v_letter := substring(v_guess from v_index for 1);
      v_count := coalesce((v_remaining ->> v_letter)::integer, 0);
      if v_count > 0 then
        v_states[v_index] := 'present';
        v_remaining := jsonb_set(v_remaining, array[v_letter], to_jsonb(v_count - 1), true);
      end if;
    end if;
  end loop;
  select jsonb_agg(
    jsonb_build_object('letter', substring(v_guess from item.index for 1), 'state', v_states[item.index])
    order by item.index
  ) into v_result
  from generate_series(1, 5) as item(index);
  return v_result;
end;
$$;

create or replace function brrrdle_private.phase55_ranked_daily_ledger_moves(p_game_id text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', action.action_id,
      'createdAt', action.created_at,
      'guess', action.guess,
      'playerId', action.player_id,
      'puzzleIndex', action.puzzle_index,
      'tiles', action.tiles
    ) order by action.sequence_no
  ), '[]'::jsonb)
  from brrrdle_private.ranked_daily_action_ledger action
  where action.game_id = p_game_id and action.action_type = 'guess'
$$;

create or replace function brrrdle_private.phase55_ranked_daily_hard_mode_evidence(
  p_game_id text,
  p_puzzle_index integer,
  p_answers text[]
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with synthetic as (
    select
      item.index as order_key,
      jsonb_build_object(
        'id', 'prefill-' || item.index::text,
        'puzzleIndex', p_puzzle_index,
        'tiles', brrrdle_private.phase55_ranked_daily_tiles(p_answers[item.index + 1], p_answers[p_puzzle_index + 1])
      ) as move_value
    from generate_series(0, greatest(p_puzzle_index - 1, -1)) as item(index)
    where p_puzzle_index > 0
  ), submitted as (
    select
      1000000 + action.sequence_no as order_key,
      jsonb_build_object(
        'id', action.action_id,
        'puzzleIndex', action.puzzle_index,
        'tiles', action.tiles
      ) as move_value
    from brrrdle_private.ranked_daily_action_ledger action
    where action.game_id = p_game_id
      and action.action_type = 'guess'
      and action.puzzle_index = p_puzzle_index
  )
  select coalesce(jsonb_agg(evidence.move_value order by evidence.order_key), '[]'::jsonb)
  from (
    select * from synthetic
    union all
    select * from submitted
  ) evidence
$$;

create or replace function brrrdle_private.phase55_ranked_daily_hard_mode_guess_is_valid(
  p_moves jsonb,
  p_puzzle_index integer,
  p_guess text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with prior_moves as (
    select move.value as move_value
    from jsonb_array_elements(case when jsonb_typeof(p_moves) = 'array' then p_moves else '[]'::jsonb end) as move(value)
    where coalesce(move.value ->> 'puzzleIndex', '-1') ~ '^[0-9]+$'
      and (move.value ->> 'puzzleIndex')::integer = p_puzzle_index
  ), tiles as (
    select
      tile.value ->> 'letter' as letter,
      tile.value ->> 'state' as state,
      tile.ordinality::integer as position,
      prior_moves.move_value ->> 'id' as move_id
    from prior_moves
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(prior_moves.move_value -> 'tiles') = 'array'
        then prior_moves.move_value -> 'tiles' else '[]'::jsonb end
    ) with ordinality as tile(value, ordinality)
  ), required_counts as (
    select letter, max(known_count)::integer as required_count
    from (
      select move_id, letter, count(*)::integer as known_count
      from tiles where state in ('correct', 'present') group by move_id, letter
    ) per_move group by letter
  ), forbidden_letters as (
    select distinct absent.letter
    from tiles absent
    where absent.state = 'absent'
      and not exists (
        select 1 from tiles known
        where known.letter = absent.letter and known.state in ('correct', 'present')
      )
  )
  select lower(coalesce(p_guess, '')) ~ '^[a-z]{5}$'
    and not exists (
      select 1 from tiles
      where state = 'correct' and substring(lower(p_guess) from position for 1) <> letter
    )
    and not exists (
      select 1 from required_counts
      where length(lower(p_guess)) - length(replace(lower(p_guess), letter, '')) < required_count
    )
    and not exists (
      select 1 from forbidden_letters where position(letter in lower(p_guess)) > 0
    )
$$;

-- PHASE55_GENERATED_WORD_CATALOG_BEGIN
insert into brrrdle_private.ranked_daily_word_catalog (kind, ordinal, word)
select 'answer', item.ordinality::integer, item.word
from jsonb_array_elements_text($phase55_answers$["abbes","abets","abled","abler","ables","abris","abuts","abyes","aches","acids","acmes","acned","acnes","acred","acres","acted","adios","adits","admen","adzes","aegis","aeons","aeros","after","agers","agist","aglet","agley","agons","agues","aides","aired","airey","airns","airts","aisle","alder","alecs","alefs","alert","alifs","alist","almeh","almes","aloes","alter","altos","altus","alums","amber","ambos","amens","ament","amids","amies","amins","amirs","amoks","angel","anger","angle","anils","anise","ankle","ankus","anted","antes","antis","antre","apers","apery","aphis","apids","apios","apods","apols","apres","apses","apter","arced","arcus","ardeb","argle","argus","ariel","arils","arise","arles","armed","armet","arose","arpen","arris","arses","arson","artel","artex","arums","arvos","aryls","ascot","ashed","ashen","ashes","aside","asked","asker","askew","aspen","asper","aster","astir","atoms","aunts","aures","auris","autos","avens","avers","awols","axels","axils","axles","axons","ayins","azons","babes","bacne","bagel","bails","bairn","baits","baked","baker","bakes","balds","baled","baler","bales","balms","bands","baned","banes","barde","bards","bared","bares","barfs","barge","barks","barms","barns","baron","barye","based","baser","bases","basic","basil","basin","baste","bated","bater","bates","bathe","bauds","bawus","bayed","beads","beady","beaks","beams","beans","beard","bears","beast","beats","beaus","begat","belay","belga","belon","belts","bemas","bends","bents","bergs","berks","berma","berms","besom","besot","betas","bices","bider","bides","biers","bigos","bikes","biles","bimas","biner","bines","biogs","bions","birle","birls","biros","birse","biter","bites","bizes","blade","blame","blare","blase","blate","blats","blear","bleat","blets","blite","blues","board","boars","boart","boast","boats","bodes","boils","bolar","bolas","boles","bolet","bolts","bolus","boned","boner","bones","boney","bonus","boral","boras","bored","bores","borne","borts","botas","botel","bouts","bowse","boxes","brace","brads","braes","brags","brahs","brake","brans","brats","brays","bread","break","bream","brens","bries","brine","brios","brose","bunas","buras","buret","bursa","burse","bused","butes","byres","bytes","caber","cable","cades","cadet","cadis","cadre","cafes","caged","cager","cages","cagey","caids","cains","caked","cakes","cakey","calms","calos","camel","cames","camos","caned","caner","canes","caney","canso","cants","caped","caper","capes","capos","carbs","cards","cared","cares","caret","carex","carey","carks","carle","carls","carme","carns","carol","carps","carse","carte","carts","carus","carve","cased","caser","cases","caste","cater","cates","cauls","cause","caver","caves","cedar","cedis","ceils","celts","cents","ceorl","ceres","ceros","cesta","cesti","chais","chaos","chare","chars","chase","chias","chose","cider","cines","cions","cires","cista","citer","cites","clade","clads","clans","clean","clear","cleat","close","clues","coals","coast","coats","codas","coden","coder","codes","coeds","coifs","coils","coins","coirs","cokes","colas","coled","coles","colts","comas","comer","comes","coned","cones","coney","conte","conus","coper","copes","copse","coral","cords","cored","cores","coris","corns","corse","corus","coses","coset","cosey","cosie","costa","coted","cotes","coves","coxes","coyer","cozes","crags","crake","crams","crane","crape","craps","crate","creak","cream","creds","crema","cried","cries","crone","cruse","ctena","cubes","cukes","cures","curet","curse","cused","cutes","cutis","daces","dagos","daisy","dalek","dales","dalet","dames","dance","dants","darbs","dares","darks","darns","darts","dashi","dater","dates","datos","daubs","dauts","dazes","deads","deals","dealt","deans","dears","deary","deash","death","debar","decal","decas","decos","defis","degas","degus","deils","deism","deist","delay","delis","delta","delts","demal","demis","demos","denar","dents","derat","deray","derma","derms","devas","dials","dices","diers","diets","dikes","dimes","diner","dines","dinos","diols","dirls","dirts","disme","ditas","dites","divas","dives","doats","doers","doest","doges","doits","doles","dolts","domes","donas","dopas","doper","dopes","dorsa","dorse","doser","doses","dosha","doter","dotes","doves","dowse","dozes","drake","drams","drape","drats","drays","dream","dregs","dries","drone","druse","duals","duces","duels","duets","duits","dukes","dulse","dumas","dunes","dupes","duras","dures","duros","dyers","dynes","earls","early","earns","earnt","earth","easts","ebons","echos","eclat","ecrus","edits","egads","eidos","eland","elans","elint","embar","emirs","emits","enact","enols","enows","enrol","eosin","ephas","epics","ergot","erhus","ernes","esbat","escar","escin","escot","eskar","estop","ethos","etnas","etuis","euros","evils","exams","exist","exits","exons","expos","extra","eyass","eyras","fable","faced","facer","faces","facet","facey","fader","fades","fados","faery","fails","fains","fairs","faker","fakes","false","famed","fames","fanes","fanos","farce","fards","fared","fares","farle","farls","farms","faros","farts","fated","fates","fatso","fauns","faves","faxes","fayed","fazes","feals","fears","feast","feats","fecal","feist","felts","fends","feods","feral","feres","ferns","fetal","fetas","fetor","fetus","feuds","fiars","fiats","fices","fidos","filer","files","filet","filos","finer","fines","finos","fired","fires","fives","fixes","flame","flans","flare","flats","fleas","flier","flies","floes","flues","foals","foams","foils","foins","foist","foley","force","fores","forte","forts","fouls","fours","foxes","foyer","frame","frats","frena","frets","fried","fries","frise","froes","fuels","fumes","funis","furos","fused","fusel","fuser","fuzes","gable","gadis","gages","gains","gaits","gales","gamed","gamer","games","gamey","ganef","ganev","gaols","gaped","gaper","gapes","garbs","garde","garni","gases","gated","gater","gates","gator","gauds","gaums","gaurs","gavel","gayer","gazer","gazes","gears","gelds","gelts","genro","gents","genus","gerah","germs","gesho","gesta","getas","geums","gibes","girls","girns","giros","girts","gites","gives","glace","glade","glads","glair","glans","glare","gleam","glean","gleds","glens","gleys","glias","glose","gluer","glues","gnars","gnats","goads","goals","goats","godet","goers","goest","gofer","golem","gomer","gonal","goner","goral","gored","gores","gorse","gotra","goums","gouts","goxes","grabs","grace","grade","grads","grail","grams","grans","grape","grate","grave","grays","great","greys","grits","groan","groat","grots","grues","guans","guars","gudes","guest","guids","gules","gyres","habus","hades","haems","haets","haiks","hails","hairs","hajes","hajis","hakes","haled","haler","hales","halos","halts","hames","hamus","hanse","hants","hards","hared","harem","hares","harls","harms","harps","harts","haste","hated","hater","hates","hauls","haver","haves","hawse","hayer","hazes","heads","heals","heaps","heard","hears","heart","heats","heaty","heils","heirs","heist","helos","hemis","hents","herds","herls","herma","herms","herns","heros","hides","hikes","hilsa","hires","hives","hoars","hoers","hokes","holed","holes","homes","honer","hones","hopes","horal","horas","horse","hosed","hosel","hosen","hoser","hosey","hosta","hotel","hours","howes","hoyas","hulas","huris","iambs","iches","icons","ictus","ideas","idler","idles","idols","idose","iglus","ikats","ikons","ileus","inert","infos","inker","inlet","inset","inter","iotas","irate","irons","isled","isles","islet","istle","items","iters","ither","iwans","izars","jades","jager","jails","jakes","janes","japed","japer","japes","jarls","jatos","jauks","jaups","jeans","jehus","jerks","jibes","jives","joeys","joiks","joins","joist","jokes","joles","jolts","jones","jorts","jotas","jubas","jubes","judas","jukes","jupes","jurel","jutes","kadis","kagus","kaifs","kails","kains","kales","kalon","kalos","kames","kanes","kaons","kapos","karez","karns","karst","karts","katsu","kayos","kebar","keirs","kelps","kelts","kenos","kepis","kerbs","kerfs","keris","kerns","ketal","ketol","khets","kibes","kiefs","kiers","kilos","kinas","kines","kinos","kiras","kirns","kited","kiter","kites","kivas","knars","knead","koans","koels","koers","kolas","koras","korat","kores","krait","krona","krone","kudos","kunas","kyars","kytes","lacer","laces","lacis","laden","lader","lades","laets","lager","laics","lairs","laker","lakes","lamer","lames","lanes","lapis","lapse","lards","lares","large","laris","lased","laser","lases","lated","laten","later","latus","lauds","laves","laxes","layer","lazes","leads","leafs","leaks","leans","leant","leaps","learn","lears","leary","leash","least","lenis","lenos","leuds","levis","lewis","lexis","liars","lidos","liefs","liens","liers","likes","limas","limes","lines","linos","lions","liras","litas","liter","lives","loads","loafs","loams","loans","lobes","lodes","loges","loids","loins","loner","lopes","lored","lores","loris","loser","lotas","lotsa","lours","louts","loves","lowes","loxes","lubes","luces","ludes","luges","lumas","lunas","lunes","lures","lutes","lweis","lyase","lyres","mabes","maced","macer","maces","macle","madre","maerl","mages","magus","maids","mails","mains","mairs","maist","maker","makes","makos","males","malts","malus","maned","manes","manos","manse","manus","maple","marcs","mares","marge","marls","marse","marts","maser","mason","mated","mater","mates","matey","mauds","mauls","mauts","mavis","maxes","maxis","mayos","mazes","meads","meals","mealy","means","meant","meats","meaty","melos","melts","mensa","menta","menus","meows","mercs","merls","mesic","meson","metal","metas","metis","micas","miens","migas","mikes","miler","miles","milos","minas","miner","mines","mires","miser","miter","mites","mixes","moans","moats","modes","moils","mokas","mokes","molas","moles","monas","mopes","moral","moras","morel","mores","morse","morts","mosey","moste","motel","motes","moues","moves","moxas","mules","muras","mures","mused","muser","mutes","nabes","nabis","nacre","nadis","naifs","nails","naish","naled","named","namer","names","napes","narcs","nards","nares","naris","nates","naves","nazis","neaps","nears","neats","negus","neifs","neist","nemas","nerds","nerol","nerts","neuks","neums","nides","nipas","niter","nites","nixes","nodes","noels","noils","noirs","nomas","nomes","nones","noris","nosed","nosey","noter","notes","novas","nudes","nukes","nurse","oared","oases","oasts","oaten","oater","oaths","oaves","obeys","obits","odahs","ofays","ogams","ogler","ogles","ogres","ohias","oinks","okays","okehs","okras","olden","older","omens","omers","omics","omits","onery","onset","opahs","opals","opens","orals","orate","orbed","orcas","orles","ornis","osier","other","ousel","ovals","ovens","overs","owsen","oyers","paced","pacer","paces","pacey","padis","padle","padre","pager","pages","paiks","pails","pains","pairs","paise","paled","paler","pales","palet","paned","panel","panes","pants","pards","pared","pareo","pares","parge","paris","parle","parol","parse","parts","paseo","pases","paste","pated","paten","pater","pates","paver","paves","pavis","pawer","paxes","payed","payer","peags","peaks","peals","peans","pearl","pears","peart","peats","peaty","pedal","peins","pelts","penal","penis","pents","peons","peril","peris","perks","perms","pesto","petal","phase","pians","picas","piers","pikas","pikes","piles","pimas","pinas","piner","pines","pions","piste","pitas","pixes","plane","plans","plate","plats","plead","pleas","pleat","plena","plier","plies","poems","poesy","poets","poids","pokes","polar","poled","poler","poles","polis","pomes","pones","pored","pores","ports","posed","poser","posit","pours","pouts","poxes","praos","prase","prate","prats","praus","presa","pries","prise","prius","proas","prole","prose","psoae","pubes","puces","pukes","pulas","pules","pulis","pulse","pumas","punas","puris","purse","pyres","qadis","qaids","qamel","qamis","qasgi","qasid","quads","quags","quais","quays","quest","queys","quids","quins","quits","quods","raced","races","raged","rages","ragis","raids","rails","rains","raise","rajes","raked","rakes","rakis","rakus","rales","ramen","ramet","ramus","rance","rands","range","ranis","rants","raped","rapes","rares","rased","rases","rated","ratel","rates","rathe","ratos","ravel","raves","raxes","rayed","razes","react","reads","realm","reals","reams","reaps","rears","rebus","recta","redan","redos","reifs","reins","relay","renal","rends","rents","repos","resat","resaw","resay","resid","resin","resit","resod","resow","rheas","rials","ribes","rices","rides","riels","riles","rimes","rinse","riots","ripes","risen","rites","rives","roads","roams","roans","roast","robes","rodes","roids","roils","roles","ropes","rosed","roses","roset","rosin","rotas","rotes","rotis","roues","routs","roves","rubes","rudes","ruins","rules","runes","sabed","saber","sabes","sabin","sabir","sable","sabot","sabre","sades","sadhe","safer","sager","sages","saice","saint","saith","saker","salep","sales","salic","salmi","salon","salve","samek","sando","saned","saner","sanes","santo","sapid","sapor","sarge","sargo","sarin","sarod","sated","satem","sates","satin","sault","saury","saute","saved","saver","savor","sawed","sawer","sayed","sayer","sayid","scale","scape","scare","scena","scone","scope","score","seals","seamy","sears","seats","sedan","segni","segno","selah","selva","sengi","senor","senti","sepal","sepoy","septa","serac","serai","seral","serau","serif","serin","serow","serum","servo","setal","seton","sewan","sewar","shade","shake","shale","shame","shape","share","shave","sheaf","sheal","shear","sheol","shied","shiel","shier","shine","shire","shoal","shoat","shoed","shoer","shone","shore","shote","sidhe","sidle","sigla","siker","silex","simar","since","sinew","singe","siped","sired","siren","sires","sitar","sited","siver","sizer","skate","skean","skied","skier","skiey","skite","slain","slake","slate","slave","slice","slide","slier","slime","slipe","slope","slued","sluer","smear","smile","smite","smote","snail","snake","snare","sneak","sneap","snide","snipe","snore","soaky","soapy","sober","socle","sofar","softa","solan","solar","solea","soled","solei","solen","soles","solfa","solid","solve","soman","sonar","sonde","sones","sored","sorel","sores","sorta","sotie","sowar","sowed","sower","space","spade","spaed","spail","spait","spake","spale","spare","spate","speak","spean","spear","speil","speir","spied","spiel","spier","spile","spine","spire","spite","spode","spore","sprue","stade","stage","staid","stain","stair","stake","stale","stane","stare","stave","stead","steak","steal","steam","stein","stela","steno","stied","stile","stime","stipe","stoae","stoke","stola","stole","stoma","stone","stope","store","stria","suber","sucre","suety","super","sural","surge","sutra","swage","swale","sware","swear","sweat","swore","taber","tabes","table","tabus","taces","tacos","taels","tahrs","tails","tains","tajes","taken","taker","takes","talcs","taler","tales","talks","talus","tamed","tamer","tames","tamis","tansu","taped","taper","tapes","tapis","tardo","tared","tares","targe","tarns","taros","tarps","tarsi","tases","tates","tawed","tawer","tawse","taxer","taxes","taxis","teaks","teals","teams","tears","teary","teats","telos","tends","tenor","tepal","tepas","terga","terma","terms","terns","tesla","texas","thane","those","tides","tiers","tikes","tiled","tiler","tiles","timer","times","tines","tired","tires","tirls","tiros","toads","toeas","togas","toils","toker","tokes","tolar","tolas","toled","toles","tolus","tomes","toned","toner","tones","toney","tonus","toper","topes","topis","toral","toras","tores","torse","torsi","torus","totes","tours","toyer","trace","trade","trams","trans","traps","trays","tread","treks","treys","tried","tries","trine","trios","trode","trois","trone","trues","tsade","tsadi","tubas","tubes","tufas","tules","tunas","tunes","tuxes","twaes","tyers","tynes","tyres","ucase","udons","ukase","ulans","ulcer","ulnar","ulnas","ultra","ulvas","unais","uncos","under","units","unled","unlet","unsad","unsay","unset","unsew","unsex","updos","upset","urase","urate","ureas","urges","ursae","ursid","usage","usher","usnea","uveas","vails","vairs","vales","valet","valse","vaned","vanes","vaper","vapes","varus","vases","vates","vatus","vaxes","veals","veils","veins","velar","venus","verso","verts","vesta","vetos","vials","vibes","vices","viers","views","vigas","vinas","vines","vinos","viols","vires","vised","vitas","voces","voids","voles","voter","votes","wader","wades","wadis","wafer","wager","wages","waifs","wails","wains","wairs","waist","waits","waker","wakes","waled","waler","wales","wames","wamus","waned","wanes","waney","wants","wards","wared","wares","wargs","warms","warns","warps","warts","waste","water","wauks","wauls","waurs","waver","waves","waxer","waxes","weald","weals","weans","wears","weary","weirs","wekas","welds","welts","whose","wides","wifes","wiles","wines","winos","wipes","wired","wires","wised","wisen","wiser","wites","wives","wizes","woads","worse","worts","wrens","wries","wrote","wyles","xenia","xenic","xeric","xerus","yager","yagis","yamen","yards","yarns","yauds","yaups","yeahs","yeans","yearn","years","yeast","yenta","yetis","yeuks","yikes","yipes","yogas","yokes","yonis","yores","yours","yowes","yuans","yucas","yules","zafus","zaxes","zeals","zebra","zebus","zeins","zerks","zeros","zetas","zines","zoeas","zoics","zoned","zoner","zones","zoris"]$phase55_answers$::jsonb)
  with ordinality as item(word, ordinality)
on conflict (kind, word) do nothing;

insert into brrrdle_private.ranked_daily_word_catalog (kind, ordinal, word)
select 'valid_guess', item.ordinality::integer, item.word
from jsonb_array_elements_text($phase55_valid_guesses$["aahed","aalii","aargh","aaugh","abaca","abaci","aback","abaft","abaka","abamp","abase","abash","abate","abaya","abbas","abbes","abbey","abbot","abeah","abeam","abece","abeel","abele","abend","abeng","abets","abewt","abhor","abide","abled","abler","ables","abmho","abode","abohm","aboil","aboma","aboon","abort","about","above","abris","abuse","abuts","abuzz","abyes","abysm","abyss","acaju","acara","acari","accel","acerb","aceta","ached","aches","achoo","acids","acidy","acina","acine","acing","acini","ackee","acmes","acmic","acned","acnes","acock","acold","acone","acorn","acosm","acred","acres","acrid","acron","acted","actin","actor","acute","acyls","adage","adapt","addax","added","adder","addle","addon","adeem","adept","adieu","adios","adits","adman","admen","admit","admix","adobe","adobo","adopt","adore","adorn","adown","adoze","adult","adunc","adust","adyta","adzed","adzes","aecia","aedes","aegis","aeons","aerie","aeros","afars","affix","afire","afoot","afore","afoul","afray","afrit","after","again","agama","agamy","agape","agars","agate","agati","agave","agaze","agema","agene","agent","agers","agger","aggie","aggro","aghas","agile","aging","agios","agism","agist","agita","aglee","aglet","agley","aglow","agmas","agogo","agone","agong","agons","agony","agora","agree","agria","agues","ahead","ahhed","ahing","ahold","ahull","aided","aider","aides","ailed","aimag","aimed","aimer","aioli","aired","airer","airey","airns","airth","airts","aisle","aitch","aiver","ajiva","ajuga","akebi","akees","akela","akene","akoya","alack","alamo","aland","alane","alang","alans","alant","alarm","alary","alate","albas","album","alcid","alder","aldol","alecs","alefs","aleph","alert","alfas","algae","algal","algas","algid","algin","algor","algum","alias","alibi","alien","alifs","align","alike","aline","alist","alive","aliya","alkie","alkyd","alkyl","allay","allee","alley","allod","allot","allow","alloy","allyl","almah","almas","almeh","almes","almud","almug","aloes","aloft","aloha","aloin","alone","along","aloof","aloud","alpha","altar","alter","altho","altos","altus","alula","alums","alway","amahs","amain","amaro","amass","amaze","amber","ambit","amble","ambos","ambry","ameba","ameer","amend","amens","ament","amias","amice","amici","amide","amido","amids","amies","amiga","amigo","amine","amino","amins","amirs","amiss","amity","ammas","ammos","amnia","amnic","amnio","amoks","amole","among","amort","amour","amped","ample","amply","ampul","amuck","amuse","amyls","ancho","ancon","andro","anear","anele","anent","angas","angel","anger","angio","angle","anglo","angry","angst","anile","anils","anima","anime","animi","anion","anise","ankhs","ankle","ankus","anlas","annal","annas","annex","annoy","annul","anoas","anode","anole","anomy","anova","anpan","ansae","antae","antas","anted","antes","antic","antis","antra","antre","antsy","anvil","anyon","aokay","aorta","apace","apala","apart","apeak","apeek","apers","apery","aphid","aphis","apian","apids","aping","apios","apish","apnea","apoda","apods","apols","aport","appal","appel","apple","apply","apres","apron","apses","apsis","apter","aptly","aquae","aquas","araks","arame","arbor","arced","arcus","ardeb","ardor","areae","areal","areas","areca","areic","arena","arene","arepa","arete","argal","argid","argil","argle","argol","argon","argot","argue","argus","arhat","arias","ariel","arils","arise","arles","armed","armer","armet","armor","aroid","aroma","arose","arpen","arras","array","arris","arrow","arses","arsis","arson","artal","artel","artex","artsy","arums","arval","arvos","aryls","asana","ascot","ascus","asdic","aseel","ashed","ashen","ashes","asian","aside","asked","asker","askew","askoi","askos","aspen","asper","aspic","aspis","assai","assay","asses","asset","aster","astir","asyla","ataps","ataxy","atilt","atlas","atman","atmas","atoll","atoms","atomy","atone","atony","atopy","atria","atrip","attar","attic","audad","audio","audit","auger","aught","augur","aulic","aunts","aunty","aurae","aural","aurar","auras","aurei","aures","auric","aurin","auris","aurum","autos","auxin","avail","avant","avast","avena","avens","avers","avert","avgas","avian","avion","aviso","avoed","avoid","avows","avtar","await","awake","awara","award","aware","awash","awfie","awful","awing","awned","awoke","awols","axels","axial","axile","axils","axing","axiom","axion","axite","axled","axles","axman","axmen","axoid","axone","axons","ayahs","ayins","azans","azide","azido","azine","azlon","azoic","azole","azons","azote","azoth","azuki","azure","azyma","azyme","baaed","baahs","baals","babas","babby","babel","babes","babka","bable","baboo","babul","babus","bacca","backs","bacne","bacon","bacoo","badam","baddy","badge","badly","baffs","baffy","bagel","baggy","bahts","baile","bails","bairn","baith","baits","baiza","baize","baked","baker","bakes","balas","balds","baldy","baled","baler","bales","balks","balky","balls","bally","balms","balmy","balsa","balun","balut","banal","banat","banco","banda","bands","bandy","baned","banes","bangs","banjo","banks","banns","banty","barbe","barbs","barca","barde","bardo","bards","bared","barer","bares","barfs","barge","baric","barks","barky","barms","barmy","barns","barny","baron","barre","barye","basal","based","baser","bases","basha","basic","basil","basin","basis","basks","bassi","basso","bassy","baste","basts","batch","bated","bater","bates","bathe","baths","batik","baton","batts","battu","batty","bauds","baulk","bawds","bawdy","bawls","bawty","bawus","bayan","bayed","bayou","bazar","bazoo","bbqed","beach","beads","beady","beaks","beaky","beams","beamy","beano","beans","beard","bears","beast","beats","beaus","beaut","beaux","bebop","becap","becks","bedel","bedew","bedim","beech","beedi","beefs","beefy","beeps","beers","beery","beets","beeve","befit","befog","began","begat","beget","begin","begot","begum","begun","behen","beige","beigy","being","belay","belch","beled","belga","belie","belle","bells","belly","belon","below","belts","bemas","bemix","bemol","bench","bends","bendy","benes","benne","benni","benny","bento","bents","benzo","beret","bergs","berks","berma","berme","berms","berry","berth","beryl","beses","beset","besom","besot","bests","betas","betel","beths","beton","betta","betty","bevel","bevor","bevvy","bewig","bezel","bezil","bffed","bhaji","bhang","bhoot","bhuna","bhuts","biali","bialy","bibbs","bible","bicep","bices","biddy","bided","bider","bides","bidet","bidis","bidri","bield","biers","biffs","biffy","bifid","biggy","bight","bigly","bigos","bigot","bijou","biked","biker","bikes","bikie","bilat","bilbo","bilby","biles","bilge","bilgy","bilks","bills","billy","bimah","bimas","bimbo","binal","bindi","binds","biner","bines","binge","bingo","binit","bints","biogs","biome","bions","biont","biota","biped","bipod","birch","birds","birdy","birks","birle","birls","biros","birrs","birse","birth","bises","bisks","bison","bitch","biter","bites","bitey","bitsy","bitts","bitty","bixin","bizes","blabs","black","blade","blaff","blahs","blain","blame","blams","blanc","bland","blank","blare","blase","blast","blate","blats","blawn","blaws","blaze","bleak","blear","bleat","blebs","blech","bleed","bleep","blend","blent","bless","blest","blets","blimp","blimy","blind","blini","blink","blips","bliss","blite","blitz","bloat","blobs","block","blocs","blogs","bloke","blond","blood","bloom","bloop","blots","blown","blows","blowy","blubs","blued","bluer","blues","bluet","bluey","bluff","blume","blunt","blurb","blurs","blurt","blush","blype","board","boars","boart","boast","boats","bobby","bocce","bocci","boche","bocks","boded","bodes","bodhi","boffo","boffs","bogan","bogey","boggy","bogie","bogle","bogus","bohea","bohos","boils","boing","boink","boite","bokeh","bokor","bolar","bolas","boldo","bolds","boles","bolet","bolic","bolls","bolos","bolts","bolus","bombe","bombs","bonds","boned","boner","bones","boney","bonga","bongo","bongs","bonks","bonne","bonny","bonus","bonze","bonzo","boobs","booby","boody","booed","booer","boogy","books","booms","boomy","boons","boors","boost","booth","boots","booty","booze","boozy","boral","boras","borax","bored","boree","borer","bores","boric","borks","borne","boron","borts","borty","bortz","bosks","bosky","bosom","boson","bossy","bosun","botas","botch","botel","bothy","botts","bough","boule","bound","bourg","bourn","bouse","bousy","bouts","bovid","bowed","bowel","bower","bowls","bowse","boxed","boxer","boxes","boxty","boyar","boyla","boyos","bozos","brace","brach","bract","brads","braes","brags","brahs","braid","brail","brain","brake","braky","brand","brank","brans","brant","brash","brass","brats","brava","brave","bravi","bravo","brawl","brawn","braws","braxy","brays","braza","braze","bread","break","bream","brede","breed","brees","brens","brent","breve","brews","briar","bribe","brick","bride","brief","brier","bries","brigg","brigs","brill","brims","brine","bring","brink","brins","briny","brios","brisk","briss","brith","brits","britt","broad","brock","broil","broke","brome","bromo","bronc","brood","brook","broom","broos","brose","brosy","broth","brown","brows","brrrr","brugh","bruin","bruit","brume","brung","brunt","brush","brusk","brute","bruts","btree","bubal","bubba","bubby","bubus","bucko","bucks","buddy","budge","buffi","buffo","buffs","buffy","bugei","buggy","bugle","buhls","buhrs","build","built","bulbs","bulby","bulge","bulgy","bulks","bulky","bulla","bulls","bully","bumfs","bumph","bumps","bumpy","bunas","bunch","bunco","bunds","bundt","bungo","bungs","bunko","bunks","bunky","bunns","bunny","bunts","bunya","buoys","buppy","buran","buras","burbs","burds","burek","buret","burgh","burgs","burin","burka","burke","burls","burly","burns","burnt","burps","burqa","burro","burrs","burry","bursa","burse","burst","busby","bused","buses","bushy","busks","busts","busty","butch","butea","buteo","butes","butin","butle","butoh","butte","butts","butty","butut","butyl","buxin","buxom","buxus","buyer","buzuk","buzzy","bwana","bylaw","byobu","byres","byrls","byssi","bytes","byway","cabal","cabby","caber","cabin","cable","cabob","cabot","cabri","cacao","cacas","cache","cacti","caddy","caded","cades","cadet","cadge","cadgy","cadis","cadre","caeca","cafes","caffs","caged","cager","cages","cagey","cahow","caids","cains","caird","cairn","cajon","cajou","caked","cakes","cakey","calfs","calif","calin","calip","calix","calks","calla","calls","cally","calms","calos","calve","calyx","camas","camel","cameo","cames","camos","campi","campo","camps","campy","canal","candy","caned","caner","canes","caney","canid","canna","canny","canoe","canon","canso","canst","canto","cants","canty","caped","caper","capes","caphs","capiz","capon","capos","caput","carat","carbo","carbs","cards","cared","carer","cares","caret","carex","carey","cargo","carks","carle","carls","carme","carns","carny","carob","carol","carom","carpi","carps","carrs","carry","carse","carte","carts","carus","carve","carya","casas","cased","caser","cases","casks","casky","caste","casts","casus","catch","cater","cates","catty","cauld","caulk","cauls","cause","cavae","cavea","caved","caver","caves","cavie","cavil","cawed","cease","cebid","cecal","cecil","cecum","cedar","ceded","ceder","cedes","cedis","ceiba","ceibo","ceili","ceils","celeb","cella","celli","cello","cells","celom","celts","cence","cense","cento","cents","centu","ceorl","cepes","cerci","cered","ceres","ceria","ceric","ceros","cerro","cesta","cesti","cetes","chaat","chads","chafe","chaff","chain","chair","chais","chalk","champ","chams","chang","chant","chaos","chape","chaps","chapt","chard","chare","chark","charm","charr","chars","chart","chary","chase","chasm","chats","chaws","chays","cheap","cheat","check","cheek","cheep","cheer","chefs","chela","chemo","chems","chert","chess","chest","cheth","chevy","chews","chewy","chiao","chias","chica","chick","chico","chics","chide","chief","chiel","chifa","child","chile","chili","chill","chimb","chime","chimp","china","chine","chink","chino","chins","chips","chirk","chirm","chiro","chirp","chirr","chiru","chits","chive","chivy","chock","chode","choil","choir","choka","choke","choky","chola","chole","cholo","chomp","chonk","chook","chops","chord","chore","chose","chott","chows","chron","chubs","chuck","chufa","chuff","chugs","chump","chums","chunk","churl","churn","churr","chute","chyle","chyme","cibol","cidal","cider","cigar","cilia","cimex","cinch","cines","cions","circa","cires","cirri","cisco","cissa","cissy","cista","cists","cited","citer","cites","civet","civic","civie","civil","civvy","clach","clack","clade","clads","clags","claim","clamp","clams","clang","clank","clans","claps","clapt","claro","clary","clash","clasp","class","clast","clave","clavi","claws","clawy","clays","clean","clear","cleat","cleek","clefs","cleft","clepe","clept","clerk","clews","click","cliff","clift","climb","clime","cline","cling","clink","clips","clipt","clive","cloak","clock","clods","clogs","clomb","clomp","clone","clonk","clons","cloot","clops","close","closh","cloth","clots","cloud","clour","clout","clove","clown","cloys","cloze","clubs","cluck","clued","clues","clump","clung","clunk","cnida","coach","coact","coala","coals","coaly","coapt","coast","coati","coats","cobbs","cobby","cobia","coble","cobol","cobot","cobra","cocas","cocci","cocke","cocks","cocky","cocoa","cocos","codas","codec","coded","coden","coder","codes","codex","codon","coeds","coffs","cogen","cogon","cohog","cohol","cohos","coifs","coign","coils","coins","coirs","coked","cokes","colas","colby","colds","coled","coles","colic","colin","colli","colly","colog","colon","color","colpi","colts","colza","comae","comal","comas","combe","combo","combs","comer","comes","comet","comfy","comic","comix","comma","commy","compo","comps","compt","comte","conch","condo","coned","cones","coney","conga","conge","congo","conic","conin","conks","conky","conns","conte","conto","conus","cooch","cooed","cooee","cooer","cooey","coofs","cooks","cooky","cools","cooly","coomb","coons","coops","coopt","coots","copal","copay","coped","copen","coper","copes","copra","copse","coral","corby","cords","cored","corer","cores","corgi","coria","corin","coris","corks","corky","corms","corns","cornu","corny","corps","corse","corus","cosec","coses","coset","cosey","cosie","cosmo","costa","costs","cotan","coted","cotes","cotta","couch","coude","cough","could","count","coupe","coups","court","couth","coved","coven","cover","coves","covet","covey","covin","cowed","cower","cowls","cowry","coxae","coxal","coxed","coxes","coyed","coyer","coyly","coypu","cozen","cozes","cozey","cozie","craal","crabs","crack","craft","crags","crake","cramp","crams","crane","crank","crape","craps","crash","crass","crate","crave","crawl","craws","craze","crazy","creak","cream","credo","creds","creed","creek","creel","creep","crema","creme","crepe","crept","crepy","cress","crest","creux","crews","cribs","crick","cried","crier","cries","crime","crimp","cripe","crisp","crits","croak","croci","crock","crocs","croft","crone","crony","crook","croon","crops","crore","cross","croup","crowd","crown","crows","croze","cruck","crude","cruds","cruel","cruet","crumb","crump","cruor","crura","cruse","crush","crust","crwth","crypt","ctena","cubby","cubeb","cubed","cuber","cubes","cubic","cubit","cuddy","cueca","cuffs","cuifs","cuing","cuish","cukes","culch","culet","culex","culls","cully","culms","culpa","culti","cults","cumin","cunts","cupel","cupid","cuppa","cuppy","curbs","curch","curds","curdy","cured","curer","cures","curet","curfs","curia","curie","curio","curls","curly","curns","currs","curry","curse","curst","curve","curvy","cusec","cused","cushy","cusks","cusps","cusso","cutch","cuter","cutes","cutey","cutia","cutie","cutin","cutis","cutty","cutup","cuvee","cyano","cyans","cyber","cycad","cycas","cycle","cyclo","cyder","cylix","cymae","cymar","cymas","cymes","cymol","cynic","cyser","cysts","cyton","czars","daces","dacha","dadas","daddy","dados","dadra","daeva","daffe","daffs","daffy","dafty","dagga","dagos","dahls","daily","dairy","daisy","dalek","dales","dalet","dally","daman","damar","damas","dames","damns","damps","dance","dandy","dangs","danio","dants","dappy","darbs","dared","darer","dares","daric","darks","darky","darns","darts","dashi","dashy","dasia","dated","dater","dates","datos","datto","datum","daube","daubs","dauby","daunt","dauts","daven","davit","dawed","dawen","dawks","dawns","dawts","dazed","dazes","dbbed","deads","deair","deals","dealt","deans","dears","deary","deash","death","deave","debag","debar","debit","debts","debug","debut","debye","decaf","decal","decas","decay","decks","decor","decos","decoy","decry","decyl","dedal","dedup","deeds","deedy","deems","deeps","deers","deets","defat","defer","defis","defog","degas","degum","degus","deice","deify","deign","deils","deink","deism","deist","deity","dekad","deked","dekes","dekko","delay","deled","deles","delfs","delft","delis","dells","delly","delph","delta","delts","delve","demal","demes","demic","demis","demit","demob","demon","demos","demur","demux","denar","denes","denim","dense","dents","deoxy","depot","depth","derat","deray","derby","derma","derms","derry","desex","desks","deter","detox","deuce","devas","devel","devil","devon","dewan","dewar","dewax","dewed","dexes","dexie","dhaba","dhaks","dhals","dhatu","dhikr","dhobi","dhole","dhoni","dhoti","dhows","dhuni","dhuti","diads","dials","diary","diazo","dibit","diced","dicer","dices","dicey","dicks","dicky","dicot","dicta","dicty","didie","didos","didst","diene","diers","diets","diffs","digby","dight","digit","diked","diker","dikes","dikey","dildo","dills","dilly","dimer","dimes","dimly","dinar","dined","diner","dines","dinge","dingo","dings","dingy","dinks","dinky","dinlo","dinos","dints","diode","diols","diple","dipod","dippy","dipso","diram","direr","dirge","dirks","dirls","dirts","dirty","disci","disco","discs","dishy","disks","disme","ditas","ditch","dites","ditsy","ditto","ditty","ditzy","divan","divas","dived","diver","dives","divot","divvy","diwan","dixit","dizen","dizzy","djeds","djinn","djins","doats","dobby","dobie","dobla","dobra","dobro","docks","dodge","dodgy","dodos","doers","doest","doeth","doffs","doges","dogey","doggo","doggy","dogie","dogma","doily","doina","doing","doink","doits","dojos","dolce","dolci","doled","doles","dolls","dolly","dolma","dolor","dolts","domal","domed","domes","domic","domra","domus","donas","donee","donga","dongs","donna","donne","donor","donsy","donut","doody","doofy","dooky","dooly","dooms","doomy","doors","doozy","dopas","doped","doper","dopes","dopey","dorid","dorks","dorky","dorms","dormy","dorps","dorrs","dorsa","dorse","dorty","dorys","dosas","dosed","doser","doses","dosha","dotal","doted","doter","dotes","dotty","doubt","douce","dough","doula","douma","doums","doura","douse","doven","doves","dowdy","dowed","dowel","dower","dowie","downs","downy","dowry","dowse","doxie","doyen","doyly","dozed","dozen","dozer","dozes","dozie","drabs","draff","draft","drags","drail","drain","drake","drama","drams","drank","drape","drats","drave","drawl","drawn","draws","drays","dread","dream","drear","dreck","dreed","drees","dregs","dreks","dreng","dress","drest","dribs","dried","drier","dries","drift","drill","drily","drink","drips","dript","drive","droid","droit","droll","drone","drool","droop","drops","dropt","dross","drouk","drove","drown","drubs","drugs","druid","drums","drunk","drupe","drury","druse","dryad","dryas","dryer","dryly","duads","duals","dubby","dubia","ducal","ducat","duces","duchy","ducks","ducky","ducts","duddy","duded","dudes","duels","duets","duffs","dufus","duits","duked","dukes","dulia","dulls","dully","dulse","dumas","dumbo","dumbs","dumka","dumky","dummy","dumps","dumpy","dunam","dunce","dunch","dunes","dungs","dungy","dunks","dunts","dunzo","duomi","duomo","duped","duper","dupes","duple","durag","dural","duras","dured","dures","durns","duroc","duros","durra","durrs","durst","durum","dusks","dusky","dusts","dusty","dutar","dutch","duvet","dwaal","dwarf","dweeb","dwell","dwelt","dwine","dyads","dyers","dying","dyked","dykes","dykey","dynel","dynes","dzikr","dzong","eager","eagle","eagre","eared","earls","early","earns","earnt","earth","eased","easel","eases","easts","eaten","eater","eaved","eaves","ebbed","ebbet","ebons","ebony","ebook","ecchi","eched","eches","echos","eclat","ecrus","eddoe","edema","edged","edger","edges","edict","edify","edile","edits","educe","educt","eerie","effed","egads","egers","egest","eggar","egged","egger","egret","eider","eidos","eight","eikon","eject","eking","elain","eland","elans","elate","elbow","elder","elect","elegy","elemi","elfin","elide","elint","elite","eloin","elope","elote","elude","elute","elver","elves","email","embar","embay","embed","ember","embow","emcee","emeer","emend","emery","emeus","emiri","emirp","emirs","emits","emmer","emmet","emmys","emote","empty","emyde","emyds","enact","enate","ended","ender","endow","endue","enema","enemy","enjoy","ennui","enoki","enols","enorm","enows","enrol","ensky","ensue","enter","entia","ently","entry","enure","envoi","envoy","enweb","enyne","enzym","eonic","eosin","epact","epees","ephah","ephas","ephod","ephor","epics","epoch","epode","epoxy","equal","equid","equip","erase","erbia","erect","ergot","erhus","erica","ernes","erode","erose","erred","error","erses","eruct","erugo","erupt","ervil","esbat","escar","escin","escot","eskar","esker","esnes","essay","esses","ester","estop","etape","ether","ethic","ethos","ethyl","etnas","etrog","etude","etuis","etwee","etyma","euros","evade","evens","event","evert","every","evict","evils","evite","evoke","ewers","exact","exalt","exams","excel","execs","exert","exfil","exile","exine","exing","exist","exits","exome","exons","expat","expel","expos","extol","extra","exude","exult","exurb","eyass","eyers","eying","eyras","eyres","eyrie","eyrir","ezine","fable","faced","facer","faces","facet","facey","facia","facts","faddy","faded","fader","fades","fadge","fados","faena","faery","faffs","faggy","fagin","fagot","fails","fains","faint","fairs","fairy","faith","faked","faker","fakes","fakey","fakie","fakir","falls","false","famed","fames","fanam","fancy","fanes","fanga","fangs","fanny","fanon","fanos","fanum","faqir","farad","farce","farci","farcy","fards","fared","farer","fares","farle","farls","farms","farmy","faros","farro","farts","farty","fasts","fatal","fated","fates","fatly","fatso","fatty","fatwa","faugh","fauld","fault","fauna","fauns","fauve","favas","faves","favor","favus","fawns","fawny","faxed","faxes","fayed","fazed","fazes","feals","fears","fease","feast","feats","feaze","fecal","feces","fecks","fedex","feebs","feeds","feels","feeze","feign","feint","feist","felid","fella","fells","felly","felon","felts","femes","femme","femto","femur","fence","fends","fenny","feods","feoff","feral","feres","feria","ferly","fermi","ferns","ferny","ferro","ferry","fesse","fests","fetal","fetas","fetch","feted","fetes","fetid","fetor","fetus","feuar","feuds","feued","fever","fewer","feyer","feyly","fezes","fezzy","fiado","fiano","fiant","fiars","fiats","fiber","fibre","fices","fiche","fichu","ficin","ficus","fidge","fidos","fiefs","field","fiend","fiery","fifed","fifer","fifes","fifth","fifty","figgy","fight","filao","filar","filch","filed","filer","files","filet","filks","fille","fillo","fills","filly","filmi","films","filmy","filos","filth","filum","final","finca","finch","finds","fined","finer","fines","finis","finks","finna","finny","finos","fiord","fique","fired","firer","fires","firms","firns","firry","first","firth","fiscs","fishy","fists","fitch","fitly","fiver","fives","fixed","fixer","fixes","fixie","fixit","fixup","fizzy","fjeld","fjord","flabs","flack","flags","flail","flair","flake","flaky","flame","flams","flamy","flank","flans","flaps","flare","flash","flask","flats","flaws","flawy","flaxy","flays","fleam","fleas","fleck","fleer","flees","fleet","flesh","flews","flexy","fleys","flick","flics","flied","flier","flies","fling","flint","flips","flirs","flirt","flite","flits","float","flock","flocs","floes","flogs","flong","flood","floor","flops","flora","floss","flota","flour","flout","flown","flows","flowy","flubs","flued","flues","fluff","fluid","fluke","fluky","flume","flump","flung","flunk","fluor","flush","flute","fluty","fluyt","flyby","flyer","flyte","foals","foams","foamy","focal","focus","foehn","fogey","foggy","fogie","fohns","foils","foins","foist","folds","foley","folia","folic","folio","folks","folky","folly","fonds","fondu","fonio","fonts","foods","fools","foots","footy","foram","foray","forbs","forby","force","fordo","fords","fores","forge","forgo","forks","forky","forme","forms","forte","forth","forts","forty","forum","fossa","fosse","fouls","found","fount","fours","fovea","fowls","foxed","foxes","foxey","foyer","frags","frail","frame","franc","frank","fraps","frass","frats","fraud","frays","freak","freed","freer","frees","fremd","frena","frere","fresh","fress","frets","friar","fried","frier","fries","frigs","frill","frise","frisk","frith","frits","fritt","fritz","frizz","frock","froes","frogs","frond","frons","front","frore","frosh","frost","froth","frown","frows","froyo","froze","frugs","fruit","frump","fryer","fryup","fubar","fubsy","fucko","fucks","fucky","fucus","fuddy","fudge","fudgy","fuels","fugal","fuggy","fugio","fugle","fugue","fugus","fujis","fulls","fully","fumed","fumer","fumes","fumet","fumid","funal","funda","fundi","funds","fungi","fungo","funic","funis","funks","funky","funny","furan","furin","furls","furor","furos","furry","furyl","furze","furzy","fused","fusee","fusel","fuser","fuses","fusil","fusor","fussy","fusty","futon","fuzed","fuzee","fuzes","fuzil","fuzzy","fyces","fyked","fykes","fyrds","fytte","gabbe","gabby","gabeh","gable","gacha","gaddi","gadid","gadis","gadje","gadjo","gaffe","gaffs","gaged","gagee","gager","gages","gaggy","gaily","gains","gaits","gaize","galah","galas","galax","galea","gales","galls","gally","galop","gamas","gamay","gamba","gambe","gambs","gamed","gamer","games","gamey","gamic","gamin","gamla","gamma","gammy","gampi","gamps","gamut","ganef","ganev","ganga","gangs","ganja","ganks","ganof","gaols","gaped","gaper","gapes","gappy","garbs","garda","garde","garni","garth","gases","gasps","gassy","gasts","gated","gater","gates","gatha","gator","gauds","gaudy","gauge","gault","gaums","gaunt","gaurs","gauss","gauze","gauzy","gavel","gavot","gawdy","gawks","gawky","gawms","gawns","gawps","gawsy","gayal","gayer","gayly","gazar","gazed","gazer","gazes","gazoo","gears","geasa","gecko","gecks","geeks","geeky","geese","geest","gelds","gelee","gelid","gelts","gemba","gemma","gemmy","gemot","genae","genes","genet","genic","genie","genii","genip","genoa","genom","genre","genro","gents","genua","genue","genus","geode","geoid","gerah","germs","germy","geshe","gesho","gesse","gesso","gesta","geste","gests","getas","getup","geums","ghain","ghast","ghats","ghaut","ghayn","ghazi","ghazu","ghees","ghost","ghoul","ghusl","ghyll","giant","gibby","gibed","giber","gibes","giddy","gifts","gifty","gigas","gighe","gigil","gigot","gigue","gilds","gills","gilly","gilts","gimel","gimme","gimps","gimpy","ginks","ginny","ginzo","gipon","gipsy","girds","girls","girly","girns","giron","giros","girsh","girth","girts","gismo","gists","gites","given","giver","gives","gizmo","glace","glade","glads","glady","glair","glams","gland","glans","glare","glary","glass","glave","glaze","glazy","gleam","glean","gleba","glebe","glede","gleds","gleed","gleek","glees","gleet","glens","gleys","gliae","glial","glias","glide","gliff","glime","glims","glint","glitz","gloam","gloat","globe","globs","gloea","glogg","glome","gloms","gloom","glops","glory","glose","gloss","glost","gloup","glout","glove","glows","gloze","glued","gluer","glues","gluey","glugs","glume","glums","gluon","glute","gluts","glyme","glyph","gnarl","gnarr","gnars","gnash","gnats","gnawn","gnaws","gnome","gnudi","goads","goals","goaly","goats","goban","gobby","gobos","godet","godly","goers","goest","goeth","gofer","gogos","going","golds","golem","golfs","golly","golok","gombo","gomer","gonad","gonal","gonef","goner","gongs","gonia","gonid","gonif","gonna","gonof","gonzo","goods","goody","gooey","goofs","goofy","gooks","gooky","goons","goony","goops","goopy","goose","goosy","gopik","goral","gored","gores","gorge","gorms","gorps","gorse","gorsy","gosht","goths","gotra","gotta","gouge","goums","gourd","gouts","gouty","gowan","gowds","gowks","gowns","goxes","goyim","gozzo","graal","grabs","grace","grade","grads","graft","grail","grain","grama","gramp","grams","grana","grand","grans","grant","grape","graph","grapy","grasp","grass","grate","grave","gravy","grays","graze","great","grebe","greed","greek","green","grees","greet","grego","gress","greys","gride","grids","grief","griff","grift","grigs","grill","grime","grimy","grind","grins","griot","gripe","grips","gript","gripy","grist","grith","grits","groan","groat","grody","grogs","groin","groks","grook","groom","grope","gross","grosz","grots","group","grout","grove","growl","grown","grows","grrrl","grubs","gruel","grues","gruff","gruit","grume","grump","grunt","guaco","guano","guans","guard","guars","guava","gucks","gudes","gudok","guess","guest","guffs","guide","guids","guild","guile","guilt","guira","guiro","guise","gulag","gular","gulch","gules","gulet","gulfs","gulfy","gulls","gully","gulps","gulpy","gumbo","gumma","gummy","gumph","gundi","gunks","gunky","gunny","guppy","guqin","gurge","gurry","gursh","gurus","gurza","gushy","gussy","gusto","gusts","gusty","gutka","gutsy","gutta","gutty","guyed","guyot","guzla","gwine","gybed","gybes","gyoza","gypsy","gyral","gyred","gyres","gyron","gyros","gyrus","gyved","gyves","haafs","haars","habit","habus","hacek","hacks","hacky","hadal","haded","hades","hadji","hadjs","hadst","haeme","haems","haets","hafiz","hafta","hafts","hahas","haiga","haika","haiks","haiku","hails","haint","hairs","hairy","hajes","hajis","hajji","hakes","hakim","hakus","halal","haled","haler","hales","halid","hallo","halls","halma","halms","halon","halos","halts","halva","halve","halwa","hamal","hambo","hames","hammy","hamus","hamza","hance","hands","handy","hangs","hanks","hanky","hansa","hanse","hants","haole","hapax","haply","happy","hards","hardy","hared","harem","hares","harks","harls","harms","harps","harpy","harry","harsh","harts","hasps","haste","hasty","hatch","hated","hater","hates","haugh","haulm","hauls","haunt","haute","haven","haver","haves","havoc","hawed","hawks","hawse","hayed","hayer","hayey","hazan","hazed","hazel","hazer","hazes","heads","heady","heals","heaps","heapy","heard","hears","heart","heath","heats","heaty","heave","heavy","hebes","hechs","hecks","heder","hedge","hedgy","hedon","heeds","heels","heeze","hefts","hefty","heiau","heigh","heils","heirs","heist","helio","helix","hello","hells","helms","helos","helot","helps","helve","hemal","hemes","hemic","hemin","hemis","hemps","hempy","hence","henge","henna","henry","hents","herbs","herby","herds","heres","herls","herma","herms","herns","heron","heros","herry","hertz","hests","heths","heuch","heugh","hewed","hewer","hexad","hexed","hexer","hexes","hexol","hexon","hexyl","heyho","hicks","hided","hider","hides","hidey","highs","hight","hijab","hijra","hiked","hiker","hikes","hilar","hillo","hills","hilly","hilsa","hilts","hilum","hilus","hinds","hinge","hinky","hinny","hints","hiply","hippo","hippy","hired","hiree","hirer","hires","hissy","hists","hitch","hived","hiver","hives","hoagy","hoard","hoars","hoary","hobby","hobos","hocks","hocus","hodad","hoers","hogan","hoggs","hoick","hoiho","hoise","hoist","hoked","hokes","hokey","hokku","hokum","holds","holed","holes","holey","holks","holla","hollo","holly","holms","holts","homed","homer","homes","homey","homie","homos","honan","honda","honed","honer","hones","honey","hongi","hongs","honks","honky","honor","hooah","hooch","hoods","hoody","hooey","hoofs","hooka","hooks","hooky","hooly","hoops","hoora","hoori","hoose","hoost","hoots","hooty","hopak","hoped","hoper","hopes","hoppy","horae","horah","horal","horas","horde","horns","horny","horse","horst","horsy","hosed","hosel","hosen","hoser","hoses","hosey","hosta","hosts","hotch","hotel","hotly","hound","houri","hours","house","hovel","hover","howdy","howes","howff","howfs","howks","howls","hoyas","hoyle","hubby","hucks","huffs","huffy","huger","huggy","hulas","hulks","hulky","hullo","hulls","human","humic","humid","humor","humph","humps","humpy","humus","hunch","hunks","hunky","hunts","huqin","hurds","huris","hurls","hurly","hurry","hurst","hurts","husks","husky","hussy","hutch","huzza","hwyls","hydel","hydra","hydro","hyena","hygge","hying","hylan","hylas","hylid","hymen","hymns","hyoid","hyped","hyper","hypes","hypha","hyphy","hypos","hyrax","hyson","iaido","iambi","iambs","iboga","ibrik","icaco","iches","ichor","icier","icily","icing","icker","icons","ictic","ictus","ideal","ideas","idiom","idiot","idled","idler","idles","idols","idose","idyll","idyls","ifrit","igged","igloo","iglus","ihram","ikats","ikons","ilama","ileac","ileal","ileum","ileus","iliac","iliad","ilial","ilium","iller","image","imago","imams","imaum","imbed","imbue","imide","imido","imids","imine","imino","immix","impar","imped","impel","impis","imply","inane","inapt","inarm","inbye","incog","incur","incus","index","indie","indol","indow","indri","indue","inept","inert","infer","infix","infos","infra","ingle","ingly","ingot","inion","inked","inker","inkle","inlay","inlet","inned","inner","inode","input","inrun","inset","inter","intis","intro","inure","inurn","invar","iodic","iodid","iodin","ionic","ionyl","iotas","ipeca","irade","irate","irbis","irids","iring","irked","iroko","irone","irons","irony","isbas","isled","isles","islet","issei","issue","istic","istle","itchy","items","iters","ither","ivied","ivies","ivory","iwans","ixias","ixora","ixtle","izars","jabot","jacal","jacks","jacky","jaded","jades","jager","jaggs","jaggy","jagra","jails","jakes","jalap","jalop","jambe","jambs","jammy","janes","janky","janty","japan","japed","japer","japes","jarls","jaspy","jatos","jauks","jaunt","jaups","javas","jawan","jawed","jazzy","jeans","jebel","jeeps","jeers","jefes","jehad","jehus","jello","jells","jelly","jemmy","jenny","jerid","jerks","jerky","jerry","jesse","jests","jetes","jeton","jetty","jewed","jewel","jewry","jibba","jibbs","jibed","jiber","jibes","jiffs","jiffy","jiggy","jihad","jills","jilts","jimmy","jimpy","jingo","jinks","jinni","jinns","jisms","jived","jiver","jives","jivey","jnana","jocko","jocks","joeys","johns","joiks","joins","joint","joist","joked","joker","jokes","jokey","joles","jolly","jolts","jolty","jomon","jonah","jones","joram","jorts","jorum","jotas","jotty","joual","jouks","joule","joust","jowar","jowed","jowls","jowly","joyed","jpegs","jubas","jubba","jubbe","jubes","jucos","judas","judge","judgy","judos","jugal","jugon","jugum","juice","juicy","jujus","juked","jukes","jukus","julep","jumbo","jumps","jumpy","junco","junks","junky","junta","junto","jupes","jupon","jural","jurat","jurel","juror","justs","juted","jutes","jutty","juvie","kabab","kabar","kabob","kadis","kafir","kagus","kaiak","kaifs","kaiju","kails","kains","kajal","kakas","kakis","kalam","kalao","kales","kalif","kalij","kalon","kalos","kalpa","kames","kamik","kanas","kanat","kanes","kanji","kanzu","kaons","kapas","kapha","kaphs","kapok","kapos","kapow","kappa","kaput","karat","karez","karma","karns","karoo","karst","karts","kasha","katal","katar","katas","katsu","kauri","kaury","kaval","kavas","kavod","kavya","kayak","kayos","kazoo","kbars","kebab","kebar","kebob","kecak","kecks","kedge","keefs","keeks","keels","keema","keens","keeps","keets","keeve","kefir","keiki","keirs","kelep","kelim","kelly","kelps","kelpy","kelts","kempo","kemps","kempt","kenaf","kench","kendo","kenos","kenpo","kente","kepis","kerbs","kerfs","keris","kerne","kerns","kerry","ketal","ketch","ketol","kevel","kevil","kexes","keyed","keyer","khadi","khafs","khaki","khans","khaph","khats","kheda","khene","kheth","khets","khoum","khula","kiang","kiasu","kibbe","kibbi","kibei","kibes","kibla","kicks","kicky","kiddo","kiddy","kiefs","kiers","kikes","kilim","kills","kilns","kilos","kilts","kilty","kinas","kinda","kinds","kines","kings","kinin","kinks","kinky","kinos","kiosk","kiras","kirks","kirns","kishk","kissy","kists","kited","kiter","kites","kithe","kiths","kitty","kivas","kiwis","klick","kliks","klong","kloof","kluge","klutz","knack","knaps","knarr","knars","knaur","knave","knawe","knead","kneed","kneel","knees","knell","knelt","knife","knish","knits","knobs","knock","knoll","knops","knosp","knots","knout","known","knows","knurl","knurs","koala","koans","kobos","koels","koers","kohen","kohls","koine","kojic","kojis","kolas","kolos","kombu","komoi","komos","komuz","konak","konik","konks","kooks","kooky","kopek","kophs","kopje","koppa","korai","koras","korat","kores","korma","korun","kosso","kotos","kotow","kraal","kraft","krait","kraut","kreep","krewe","krill","kriya","krona","krone","kroon","krubi","krump","kudos","kudus","kudzu","kufis","kugel","kukri","kukui","kulak","kumis","kumys","kunas","kurta","kurus","kusso","kvass","kvell","kyack","kyaks","kyars","kyats","kylix","kyrie","kytes","kythe","laari","label","labia","labor","labra","laced","lacer","laces","lacey","lacis","lacks","laddo","laded","laden","lader","lades","ladle","laets","laevo","lagan","lager","laggy","lahar","laich","laics","laigh","laird","lairs","laith","laity","laked","laker","lakes","lakhs","lalls","lamas","lambs","lamby","lamed","lamer","lames","lamia","lamps","lanai","lance","lands","lanes","lanky","lapel","lapin","lapis","lapse","larch","lards","lardy","laree","lares","large","largo","larid","laris","larks","larky","larry","larum","larva","lased","laser","lases","lasik","lassi","lasso","lasts","latch","lated","laten","later","latex","lathe","lathi","laths","lathy","latke","latte","latus","lauan","lauds","laugh","laura","lavas","laved","laver","laves","lawed","lawns","lawny","laxer","laxes","laxly","layed","layer","layin","layup","lazar","lazed","lazes","leach","leads","leady","leafs","leafy","leaks","leaky","leans","leant","leaps","leapt","learn","lears","leary","lease","leash","least","leave","leavy","leben","lebes","lects","leddy","ledes","ledge","ledgy","leech","leeks","leers","leery","leets","lefse","lefts","lefty","legal","leger","leges","leggy","legit","lehrs","lehua","leman","lemma","lemon","lemur","lence","lends","lenes","lenis","lenos","lense","lento","leone","leper","lepta","lesbo","leses","letch","lethe","letup","leuds","levan","levee","level","lever","levin","levis","lewis","lexer","lexes","lexis","lezzy","liana","liane","liang","liard","liars","libel","liber","libra","libri","lichi","licht","licit","licks","lidar","lidos","liefs","liege","liens","liers","lieus","lieve","lifer","lifts","ligan","liger","light","liked","liken","liker","likes","lilac","lilos","lilts","liman","limas","limba","limbi","limbo","limbs","limby","limed","limen","limes","limey","limit","limns","limos","limpa","limps","limpy","linac","lindy","linea","lined","linen","liner","lines","liney","linga","lingo","lings","lingy","linin","links","linky","linns","linos","lints","linty","linum","lions","lipid","lipin","lippy","liras","lirot","lisle","lisps","lispy","lists","litai","litas","liter","lithe","litho","litre","lived","liven","liver","lives","livid","livre","llama","llano","loach","loads","loafs","loams","loamy","loans","loath","lobar","lobby","lobed","lobes","lobos","local","lochs","locks","locos","locum","locus","loden","lodes","lodge","loess","lofts","lofty","logan","loges","loggy","logia","logic","login","logis","logit","logoi","logon","logos","loids","loins","lokum","lolls","lolly","loner","longe","longs","looby","looed","looey","loofa","loofs","looie","looks","looms","loons","loony","loops","loopy","loose","loots","loped","loper","lopes","loppy","loral","loran","lords","lored","lores","loris","lorry","losel","loser","loses","lossy","lotah","lotas","lotic","lotos","lotsa","lotte","lotto","lotus","lough","louie","louis","louma","loupe","loups","lours","loury","louse","lousy","louts","lovat","loved","lover","loves","lowed","lower","lowes","lowly","lowse","loxed","loxes","loyal","luaus","lubed","lubes","luces","lucid","lucks","lucky","lucre","ludes","ludic","luffa","luffs","luged","luger","luges","lulav","lulls","lulus","lumas","lumen","lumps","lumpy","lunar","lunas","lunch","lunes","lunet","lunge","lungi","lungs","lunks","lunts","lupin","lupus","lurch","lured","lurer","lures","lurex","lurid","lurks","lusts","lusty","lusus","lutea","luted","luter","lutes","luwak","luxes","luxon","lweis","lyard","lyart","lyase","lycea","lycee","lycra","lying","lymph","lynch","lyred","lyres","lyric","lysed","lyses","lysin","lysis","lyssa","lytic","lytta","maars","mabes","macaw","maced","macer","maces","mache","macho","machs","macks","macle","macon","macro","madam","madly","madre","maerl","mafia","mafic","mages","magic","magma","magot","magus","mahal","mahoe","mahrs","maida","maids","maile","maill","mails","maims","mains","mairs","maist","maize","major","makar","maker","makes","makos","malar","maleo","males","malic","malls","malms","malmy","malts","malty","malum","malus","mamas","mamba","mambo","mamey","mamie","mamma","mammy","manas","manat","maned","manes","manga","mange","mango","mangy","mania","manic","manly","manna","manor","manos","manse","manta","manus","maple","mappy","maqui","maral","maras","march","marcs","mares","marge","maria","marka","marks","marls","marly","marry","marse","marsh","marts","marvy","masas","maser","mashy","masks","mason","massa","masse","massy","masts","match","mated","mater","mates","matey","maths","matin","matte","matts","matza","matzo","mauds","mauls","maund","mauts","mauve","maven","mavie","mavin","mavis","mawed","maxed","maxes","maxim","maxis","mayan","mayas","maybe","mayed","mayor","mayos","mayst","mazed","mazer","mazes","mazus","mbila","mbira","mbuna","meads","meals","mealy","means","meant","meany","meats","meaty","mecca","medal","media","medic","medii","meeds","meets","meiny","melds","melee","melic","mells","melon","melos","melts","melty","memed","memes","memos","menad","mends","mensa","mense","mensh","menta","menus","meous","meows","merch","mercs","mercy","merde","merer","meres","merge","merit","merks","merle","merls","merry","mesas","meshy","mesic","mesne","meson","messe","messy","metal","metas","meted","meter","metes","meths","metis","metol","metre","metro","mewed","mewls","mezes","mezze","mezzo","miaou","miaow","miasm","miaul","mibbe","micas","miche","micks","micra","micro","middy","midge","midis","midst","miens","miffs","miffy","migas","miggs","might","miked","mikes","mikra","milch","milds","miler","miles","milia","milks","milky","mille","mills","milos","milpa","milts","milty","mimed","mimeo","mimer","mimes","mimic","mimsy","minae","minas","mince","mincy","minds","mined","miner","mines","mingy","minim","minis","minka","minke","minks","minny","minor","mints","minty","minus","mired","mires","mirex","mirin","mirks","mirky","mirth","mirza","misdo","miser","mises","misos","missy","mists","misty","miter","mites","mitis","mitra","mitre","mitts","mixed","mixer","mixes","mixup","mizen","moans","moany","moats","moaty","mobed","mocha","mocks","modal","model","modem","modes","modus","moggy","mogul","mohel","mohur","moils","moira","moire","moist","mojos","mokas","mokes","molal","molar","molas","molds","moldy","moles","molle","molls","molly","molto","molts","momes","momma","mommy","momsy","momus","monad","monas","monde","mondo","money","mongo","monie","monks","monos","monte","month","mooch","moods","moody","mooed","moola","mools","moons","moony","moors","moory","moose","moots","moped","moper","mopes","mopey","mopup","morae","moral","moras","moray","morel","mores","morin","morns","moron","morph","morro","morse","morts","mosey","mosks","mosso","mossy","moste","mosts","moted","motel","motes","motet","motey","moths","mothy","motif","motor","motte","motto","motts","mouch","moues","mould","moult","mound","mount","mourn","mouse","mousy","mouth","moved","mover","moves","movie","mowed","mower","moxas","moxie","mozos","mucho","mucid","mucin","mucks","mucky","mucor","mucro","mucus","muddy","mudra","muffs","muffy","mufti","muggs","muggy","muhly","mujik","mulch","mulct","muled","mules","muley","mulla","mulls","mumes","mumia","mumms","mummy","mumps","mumus","munch","mungo","munis","muons","mural","muras","mured","mures","murex","murid","murks","murky","murra","murre","murrs","murry","musca","mused","muser","muses","mushy","music","musks","musky","mussy","musth","musts","musty","mutch","muted","muter","mutes","muton","mutts","muzak","muzzy","mylar","mynah","mynas","myoid","myoma","myope","myopy","myrrh","mysid","mysis","myths","mythy","naans","nabes","nabis","nabob","nacho","nacre","nadas","nadir","nadis","nadph","naevi","naffs","naggy","naiad","naifs","nails","naira","nairu","naish","naive","naked","nakfa","nalas","naled","named","namer","names","nanas","nance","nancy","nanny","napas","napes","nappa","nappe","nappy","narco","narcs","nards","nares","naric","naris","narks","narky","nasal","nassa","nasty","natal","natch","nates","natic","natty","naval","navar","navel","naves","navvy","nawab","nazis","neaps","nears","neath","neato","neats","nebby","necks","neddy","needs","needy","neems","neeps","negus","neifs","neigh","neist","nelly","nemas","nence","nenes","neons","nerds","nerdy","nerol","nerts","nertz","nerve","nervy","nests","netop","netre","netts","netty","neuks","neuma","neume","neums","never","neves","nevus","newel","newer","newie","newly","newsy","newts","nexin","nexus","ngwee","nicad","nicer","niche","nicks","nicol","nidal","nided","nides","nidus","niece","nieve","nifty","nigga","nighs","night","nigny","nigra","nihil","nills","nimbi","nimby","niner","nines","ninja","ninny","ninon","ninth","nipas","nippy","nisei","nisus","niter","nites","nitid","niton","nitre","nitro","nitty","nival","nixed","nixes","nixie","nizam","nobby","noble","nobly","nocks","nodal","noddy","noded","nodes","nodus","noels","noema","noggs","noggy","nohow","noils","noily","noire","noirs","noise","noisy","nolos","nomad","nomas","nomen","nomes","nomoi","nomos","nonan","nonas","nonce","nones","nonet","nonyl","noobs","nooch","nooks","nooky","noons","noose","nopal","noria","noris","norit","norms","north","nosed","noses","nosey","notal","notch","noted","noter","notes","notum","nouns","novae","novas","novel","noway","nowts","noxae","nubby","nubia","nucha","nuder","nudes","nudge","nudie","nudzh","nuked","nukes","nulls","numbs","numen","nurds","nurls","nurse","nutsy","nutty","nyala","nylon","nymph","oaken","oakum","oared","oases","oasis","oasts","oaten","oater","oaths","oaves","obeah","obeli","obese","obeys","obias","obits","objet","obkom","oboes","obole","oboli","obols","occur","ocean","ocher","ochre","ochry","ocker","ocrea","octad","octal","octan","octet","octic","octyl","oculi","odahs","odder","oddly","odeon","odeum","odist","odium","odors","odour","odyle","odyls","ofays","offal","offed","offer","often","ofter","ogams","ogees","ogham","ogive","ogled","ogler","ogles","ogres","ohana","ohias","ohing","ohmic","oidia","oikos","oiled","oiler","oinks","okapi","okays","okehs","okras","olden","older","oldie","oleic","olein","oleos","oleum","olios","olive","ollas","ology","omasa","omber","ombre","omega","omens","omers","omics","omits","oncet","onery","onion","onium","onlay","onset","ontic","oohed","ooids","oomoo","oomph","oorie","oosik","ootid","oozed","oozes","opahs","opals","opens","opera","opine","oping","opium","opsin","opted","optic","orach","orals","orang","orate","orbed","orbit","orcas","orcin","order","ordos","oread","organ","orgic","oribi","oriel","origo","orles","orlon","orlop","ormer","ornis","orpin","orris","ortho","orzos","osier","osmic","osmol","osset","ossia","ostia","other","otium","ottar","otter","ottos","ought","ounce","ouphe","ouphs","ourie","ousel","ousts","outby","outdo","outed","outer","outgo","outre","outro","ouzel","ouzos","ovals","ovary","ovate","ovens","overs","overt","ovine","ovoid","ovoli","ovolo","ovula","ovule","owing","owlet","owned","owner","owsen","oxane","oxbow","oxeye","oxide","oxids","oxime","oxims","oxine","oxlip","oxter","oyers","oyibo","ozena","ozoic","ozone","paans","pacas","paced","pacer","paces","pacey","pacha","packs","pacts","paddy","padis","padle","padre","padri","paean","paeon","pagan","paged","pager","pages","pagod","paiks","pails","pains","paint","pairs","paisa","paise","palea","paled","paleo","paler","pales","palet","palls","pally","palms","palmy","palpi","palps","palsy","pampa","panda","pandy","paned","panel","panes","panga","pangs","panic","panir","panne","pansy","panto","pants","panty","papal","papas","papaw","paper","pappi","pappy","parae","paras","parch","pardi","pards","pardy","pared","pareo","parer","pares","pareu","parge","pargo","paris","parka","parks","parle","parol","parrs","parry","parse","parts","party","parve","parvo","pasch","paseo","pases","pasha","passe","pasta","paste","pasts","pasty","patch","pated","paten","pater","pates","paths","patin","patio","patly","patsy","patty","pausa","pause","pavan","paved","paver","paves","pavid","pavin","pavis","pawed","pawer","pawky","pawls","pawns","paxes","payed","payee","payer","payor","peace","peach","peage","peags","peaks","peaky","peals","peans","pearl","pears","peart","pease","peats","peaty","peavy","pecan","pechs","pecks","pecky","pedal","pedes","pedon","pedro","peeks","peels","peens","peeps","peers","peery","peeve","pegma","peins","peise","pekan","pekes","pekin","pekoe","peler","peles","pelfs","pelon","pelts","penal","pence","pende","pends","penes","pengo","penis","penna","penne","penni","penny","pents","peons","peony","pepla","pepos","peppy","perch","perdu","perdy","perea","peres","peril","peris","perks","perky","perms","perps","perry","perse","pervs","pesky","pesos","pesto","pests","pesty","petal","peter","petit","petti","petto","petty","pewed","pewee","pewit","phage","phase","pheer","phemy","phial","phish","phizz","phlox","phone","phono","phons","phony","photo","phots","phpht","phren","phubs","phuts","phyla","phyle","phyma","piano","pians","pibal","pical","picas","picks","picky","picot","picul","piece","piers","pieta","piety","piggy","pigmy","piing","pikas","piked","piker","pikes","pikis","pilae","pilaf","pilar","pilau","pilaw","pilea","piled","pilei","piles","pilis","pills","pilly","pilot","pilus","pimas","pimps","pinas","pinax","pinch","pined","piner","pines","piney","pingo","pings","pinko","pinks","pinky","pinna","pinny","pinon","pinot","pinta","pinto","pints","pinup","pions","pious","pipal","piped","piper","pipes","pipet","pipit","pique","pirns","pirog","pisco","pisos","pissy","piste","pitas","pitch","pitha","piths","pithy","piton","pitta","pivot","pixel","pixes","pixie","pizza","place","plack","plage","plaid","plain","plait","plane","plank","plano","plans","plant","plash","plasm","plate","plats","platy","playa","plays","plaza","plead","pleas","pleat","plebe","plebs","plena","pleon","plews","plica","plied","plier","plies","plink","plods","plonk","plops","plots","plotz","plows","ploys","pluck","plugs","plumb","plume","plump","plums","plumy","plunk","plush","plute","plyer","poach","poboy","pocks","pocky","podgy","podia","poems","poena","poesy","poets","pogey","poids","poilu","poind","point","poise","poked","poker","pokes","pokey","polar","poled","poler","poles","polio","polis","polje","polka","polls","polos","polyp","polys","pomat","pomes","pommy","pomos","pomps","ponce","ponds","pones","pongs","pooch","poods","pooed","poofs","poofy","poohs","pools","poons","poops","poore","poori","poove","popes","poppa","poppy","popsy","porch","pored","pores","porgy","poria","porks","porky","porno","porns","porny","ports","posed","poser","poses","posit","posse","posts","pothi","potsy","potto","potty","pouch","pouff","poufs","poult","pound","pours","pouts","pouty","power","poxed","poxes","poyou","praam","prahu","prams","prang","prank","praos","prase","prate","prats","praus","prawn","prays","preed","preen","prees","prefs","preop","preps","presa","prese","press","prest","prexy","preys","price","prick","pricy","pride","pried","prier","pries","prigs","prill","prima","prime","primi","primo","primp","prims","prink","print","prion","prior","prise","prism","priss","prius","privy","prize","proas","probe","proby","prods","proem","profs","progs","prole","promo","proms","prone","prong","proof","props","prose","proso","pross","prost","prosy","proud","prove","prowl","prows","proxy","prude","prune","pruny","pruta","pryer","psalm","pseud","pshaw","psoae","psoai","psoas","pssst","psych","pubes","pubic","pubis","pucca","puces","pucka","pucks","pudgy","pudic","puffs","puffy","puggy","pujah","pujas","puked","puker","pukes","pukey","pukka","pulas","puled","puler","pules","pulik","pulis","pulls","pulps","pulpy","pulse","pumas","pumps","pumpy","punas","punch","pungs","punji","punka","punks","punky","punny","punto","punts","punty","pupae","pupal","pupas","pupil","puppy","pupus","purda","puree","purer","purge","purin","puris","purls","purrs","purry","purse","pursy","purty","puses","pushy","pussy","puton","putti","putto","putts","putty","pygmy","pyins","pylon","pyoid","pyran","pyres","pyrex","pyric","pyros","pyxes","pyxie","pyxis","qadis","qahwa","qaids","qalam","qamel","qamis","qanat","qanun","qapik","qasab","qasba","qasgi","qasid","qawls","qawms","qayaq","qophs","quack","quads","quaff","quags","quail","quais","quake","quaky","quale","qualm","quant","quare","quark","quart","quash","quasi","quass","quate","quays","qubit","quean","quede","queen","queer","quell","quern","query","queso","quest","queue","queys","quick","quids","quiet","quiff","quill","quilt","quins","quint","quips","quipu","quire","quirk","quirt","quite","quits","quods","quoin","quoit","quoll","quota","quote","quoth","qurns","qursh","qurut","rabab","rabat","rabbi","rabic","rabid","raced","racer","races","racks","racon","radar","radii","radio","radix","radon","raffs","rafts","ragas","raged","ragee","rages","raggs","raggy","ragis","raias","raids","rails","rains","rainy","raise","raita","rajah","rajas","rajes","raked","rakee","raker","rakes","rakhi","rakis","rakus","rales","rally","ralph","ramal","ramee","ramen","ramet","ramie","rammy","ramps","ramus","rance","ranch","rands","randy","ranee","range","rangy","ranid","ranis","ranks","rants","raped","raper","rapes","raphe","rapid","rared","raree","rarer","rares","rasam","rased","raser","rases","rashy","rasps","raspy","ratal","ratan","ratch","rated","ratel","rater","rates","rathe","raths","ratio","ratos","ratty","raved","ravel","raven","raver","raves","ravin","rawer","rawin","rawly","raxed","raxes","rayah","rayas","rayed","rayon","razed","razee","razer","razes","razor","reach","react","readd","reads","ready","realm","reals","reams","reaps","rearm","rears","reata","reave","rebab","rebar","rebbe","rebec","rebel","rebid","rebop","rebus","rebut","rebuy","recap","recce","recit","recks","recon","recta","recte","recti","recto","recur","recut","redan","redds","reded","redes","redia","redid","redip","redly","redon","redos","redox","redry","redub","redux","redye","reeds","reedy","reefs","reefy","reeks","reeky","reels","reest","reeve","refed","refel","refer","refit","refix","refly","refry","regal","reges","regex","regia","regio","regma","regna","rehab","rehem","reifs","reify","reign","reink","reins","reive","rejig","rekey","relax","relay","relet","relic","relit","reman","remap","remet","remex","remit","remix","renal","rends","renew","renig","renin","rente","rents","reoil","repay","repeg","repel","repin","reply","repos","repot","repps","repro","reran","rerig","rerun","resat","resaw","resay","resee","reses","reset","resew","resid","resin","resit","resod","resow","rests","resus","retag","retax","retch","retem","retes","retia","retie","retro","retry","reuse","revel","revet","revue","rewan","rewax","rewed","rewet","rewin","rewon","rexes","rheas","rhein","rhema","rheme","rheum","rhino","rhomb","rhumb","rhyme","rhyta","rials","riant","riata","ribby","ribes","riced","ricer","rices","ricin","ricks","rider","rides","ridge","ridgy","riels","rifer","riffs","rifle","rifts","right","rigid","rigor","rikka","riled","riles","riley","rille","rills","rimed","rimer","rimes","rinds","rindy","rings","rinks","rinse","rioja","riots","riped","ripen","riper","ripes","risen","riser","rises","rishi","risks","risky","risus","rites","ritzy","rival","rived","riven","river","rives","rivet","riyal","roach","roads","roams","roans","roars","roast","robed","robes","robin","roble","robot","rocks","rocky","rodeo","rodes","roger","rogue","roids","roils","roily","roles","rolfs","rolls","roman","rombi","romeo","romps","rondo","roods","roofs","rooks","rooky","rooms","roomy","roose","roost","roots","rooty","roped","roper","ropes","ropey","roque","rosed","roser","roses","roset","roshi","rosin","rotas","rotch","rotes","rotis","rotls","rotor","rotos","rotte","rouen","roues","rouet","rouge","rough","roumi","round","roups","roupy","rouse","roust","route","routh","routs","roved","roven","rover","roves","rowan","rowdy","rowed","rowel","rowen","rower","rowth","royal","ruana","rubab","rubby","rubel","rubes","ruble","rubor","rubra","rubus","ruche","rucks","rudds","ruddy","ruder","rudes","ruers","ruffe","ruffs","rugae","rugal","rugby","ruing","ruins","ruled","ruler","rules","rumba","rumen","rumex","rummy","rumor","rumps","runes","rungs","runic","runny","runts","runty","runup","rupee","rural","ruses","rushy","rusks","rusts","rusty","ruths","rutin","rutty","ryked","rykes","rynds","ryots","sabal","sabed","saber","sabes","sabin","sabir","sable","sabot","sabra","sabre","sacks","sacra","sades","sadhe","sadhu","sadic","sadis","sadly","safer","safes","sagas","sager","sages","saggy","sagos","sagum","sahib","saice","saids","saiga","sails","sains","saint","saith","sajou","saker","sakes","sakis","sakti","salad","salah","salal","salam","salar","salep","sales","salic","sally","salmi","salol","salon","salpa","salps","salsa","salts","salty","salve","salvo","samba","sambo","samek","samps","sando","sands","sandy","saned","saner","sanes","sanga","sangh","sangs","santo","sapid","sapor","sappy","saran","sards","saree","sarge","sargo","sarin","saris","sarks","sarky","sarod","saros","sasin","sassy","satay","sated","satem","sates","satin","satis","satyr","sauce","sauch","saucy","saugh","sauls","sault","sauna","saury","saute","saved","saver","saves","savin","savor","savoy","savvy","sawed","sawer","saxes","sayed","sayer","sayid","sayst","scabs","scads","scags","scald","scale","scall","scalp","scaly","scamp","scams","scans","scant","scape","scare","scarf","scarp","scars","scart","scary","scats","scatt","scaup","scaur","scena","scend","scene","scent","schav","schmo","schul","schwa","scion","scoff","scold","scone","scoop","scoot","scope","scops","score","scorn","scots","scour","scout","scowl","scows","scrag","scram","scrap","scree","screw","scrim","scrip","scrod","scrub","scrum","scuba","scudi","scudo","scuds","scuff","sculk","scull","sculp","scums","scups","scurf","scurr","scuta","scute","scuts","scutt","scuzz","seals","seams","seamy","sears","seats","sebum","secco","sects","sedan","seder","sedge","sedgy","sedum","seeds","seedy","seeks","seels","seely","seems","seeps","seepy","seers","seest","segni","segno","segos","segue","seifs","seine","seise","seism","seize","selah","selfs","selle","sells","selva","semen","semes","semis","sends","senes","senex","sengi","senna","senor","sensa","sense","sente","senti","sepal","sepia","sepic","sepoy","septa","septs","serac","serai","seral","serau","sered","serer","seres","serfs","serge","serif","serin","serow","serry","serum","serve","servo","seryl","setae","setal","seton","setts","setup","seven","sever","sewan","sewar","sewed","sewer","sexed","sexes","sexto","sexts","shack","shade","shads","shady","shaft","shags","shahs","shaka","shake","shako","shaky","shale","shall","shalt","shaly","shame","shams","shank","shape","shard","share","shark","sharn","sharp","shaul","shave","shawl","shawm","shawn","shaws","shays","sheaf","sheal","shear","sheas","sheds","sheen","sheep","sheer","sheet","sheik","shelf","shell","shend","shent","sheol","sherd","shewn","shews","shied","shiel","shier","shies","shift","shill","shily","shims","shine","shins","shiny","ships","shire","shirk","shirr","shirt","shist","shits","shiva","shive","shivs","shlep","shlub","shoal","shoat","shock","shoed","shoer","shoes","shogi","shogs","shoji","shone","shook","shool","shoon","shoos","shoot","shops","shore","shorl","shorn","short","shote","shots","shott","shout","shove","shown","shows","showy","shoyu","shred","shrew","shris","shrub","shrug","shtik","shuck","shuln","shuls","shuns","shunt","shush","shute","shuts","shwas","shyer","shyly","sials","sibbs","sibyl","sicav","sices","sicko","sicks","sided","sides","sidhe","sidle","siege","sieur","sieve","sifts","sighs","sight","sigil","sigla","sigma","signa","signs","sikas","siker","sikes","silds","silex","silks","silky","sills","silly","silos","silts","silty","silva","silyl","simar","simas","simit","simps","since","sines","sinew","singe","sings","sinhs","sinks","sinus","siped","sipes","sired","siree","siren","sires","sirra","sirup","sisal","sises","sissy","sitar","sited","sites","situp","situs","siver","sixes","sixmo","sixte","sixth","sixty","sizar","sized","sizer","sizes","skags","skald","skank","skarn","skate","skats","skean","skeed","skeen","skees","skeet","skegs","skein","skell","skelm","skelp","skene","skeps","skews","skids","skied","skier","skies","skiey","skiff","skill","skimo","skimp","skims","skink","skins","skint","skips","skirl","skirr","skirt","skite","skits","skive","skoal","skort","skosh","skuas","skulk","skull","skunk","skyed","skyey","slabs","slack","slags","slain","slake","slams","slang","slank","slant","slaps","slash","slate","slats","slaty","slave","slaws","slays","sleds","sleek","sleep","sleet","slept","slews","slice","slick","slide","slier","slily","slime","slims","slimy","sling","slink","slipe","slips","slipt","slits","slobs","sloes","slogs","sloid","slojd","sloop","slope","slops","slosh","sloth","slots","slows","sloyd","slubs","slued","sluer","slues","sluff","slugs","slump","slums","slung","slunk","slurb","slurp","slurs","slush","sluts","slyer","slyly","slype","smack","small","smalt","smarm","smart","smash","smaze","smear","smeek","smell","smelt","smerk","smews","smile","smirk","smite","smith","smits","smock","smogs","smoke","smoky","smolt","smote","smugs","smush","smuts","snack","snafu","snags","snail","snake","snaky","snaps","snare","snarf","snark","snarl","snash","snath","snaws","sneak","sneap","sneck","sneds","sneer","snell","snibs","snick","snide","sniff","snipe","snips","snits","snobs","snogs","snood","snook","snool","snoop","snoot","snore","snort","snots","snout","snows","snowy","snubs","snuck","snuff","snugs","snyes","soaks","soaky","soaps","soapy","soars","soave","sobas","sober","socas","socca","socko","socks","socle","sodas","soddy","sodic","sodom","sofar","sofas","softa","softs","softy","soggy","soils","sojas","sokes","sokol","solan","solar","soldi","soldo","solds","solea","soled","solei","solen","soles","solfa","solid","solon","solos","solum","solus","solve","soman","somas","sonar","sonde","sones","songs","sonic","sonly","sonny","sonsy","sooey","sooks","sooth","soots","sooty","sophs","sophy","sopor","soppy","soras","sorbs","sords","sored","sorel","sorer","sores","sorgo","sorns","sorry","sorta","sorts","sorus","soths","sotie","sotol","sough","souks","souls","sound","soups","soupy","sours","souse","south","sowar","sowed","sower","soyas","soyuz","sozin","space","spacy","spade","spado","spads","spaed","spaes","spahi","spail","spait","spake","spale","spall","spams","spang","spank","spans","spare","spark","spars","spasm","spate","spats","spawn","spays","spaza","spazz","speak","spean","spear","speck","specs","speed","speel","speer","speil","speir","spell","spelt","spend","spent","sperm","spews","sphex","spica","spice","spick","spics","spicy","spied","spiel","spier","spies","spiff","spike","spiks","spiky","spile","spill","spilt","spine","spins","spiny","spire","spirt","spiry","spite","spits","spitz","spivs","splat","splay","split","spode","spoil","spoke","spoof","spook","spool","spoon","spoor","spore","spork","sport","spots","spout","sprag","sprat","spray","spree","sprig","sprit","sprue","sprug","spuds","spued","spues","spume","spumy","spunk","spurl","spurn","spurs","spurt","sputa","squab","squad","squat","squaw","squeg","squib","squid","stabs","stack","stade","staff","stage","stags","stagy","staid","staig","stain","stair","stake","stale","stalk","stall","stamp","stand","stane","stang","stank","stant","staph","stare","stark","stars","start","stash","state","stats","stave","stays","stead","steak","steal","steam","steed","steek","steel","steep","steer","stein","stela","stele","stems","steno","stent","steps","stere","stern","stets","stews","stewy","stich","stick","stied","sties","stiff","stile","still","stilt","stime","stimy","sting","stink","stint","stipe","stirk","stirp","stirs","stoae","stoai","stoas","stoat","stobs","stock","stogy","stoic","stoke","stola","stole","stoma","stomp","stone","stony","stood","stook","stool","stoop","stope","stops","stopt","store","stork","storm","story","stoss","stots","stott","stoup","stour","stout","stove","stowp","stows","strap","straw","stray","strep","strew","stria","strip","strix","strop","strow","stroy","strum","strut","stubs","stuck","studs","study","stuff","stull","stump","stums","stung","stunk","stuns","stunt","stupa","stupe","sturt","styed","styes","style","styli","stymy","suave","subah","subas","suber","sucks","sucky","sucre","sudds","sudor","sudsy","suede","suers","suets","suety","sugar","sughs","suing","suint","suite","suits","sulci","sulfa","sulfo","sulks","sulky","sully","sulus","sumac","summa","sumos","sumps","sunks","sunna","sunns","sunny","sunup","super","supes","supra","surah","sural","suras","surds","surer","surfs","surfy","surge","surgy","surly","surra","sushi","sutra","sutta","swabs","swage","swags","swail","swain","swale","swami","swamp","swamy","swang","swank","swans","swaps","sward","sware","swarf","swarm","swart","swash","swath","swats","sways","swear","sweat","swede","sweep","sweer","sweet","swell","swept","swift","swigs","swill","swims","swine","swing","swink","swipe","swirl","swish","swiss","swith","swive","swobs","swoon","swoop","swops","sword","swore","sworn","swots","swoun","swung","syced","sycee","syces","sykes","sylis","sylph","sylva","synch","syncs","synod","synth","syphs","syren","syrup","sysop","tabby","taber","tabes","tabid","tabla","table","taboo","tabor","tabun","tabus","taces","tacet","tache","tachs","tacit","tacks","tacky","tacos","tacts","taels","taffy","tafia","tagma","tahrs","taifa","taiga","tails","tains","taint","taipa","tajes","takas","taken","taker","takes","takin","talar","talas","talcs","taler","tales","talks","talky","talls","tally","talon","taluk","taluq","talus","tamal","tambo","tamed","tamer","tames","tamis","tammy","tamps","tanga","tango","tangs","tangy","tanha","tanka","tanks","tanny","tansu","tansy","tanto","tapas","taped","taper","tapes","tapir","tapis","tappa","tardo","tardy","tared","tares","targe","tarns","taroc","tarok","taros","tarot","tarps","tarre","tarry","tarsi","tarts","tarty","tases","tasks","tasse","taste","tasty","tatar","tated","tater","tates","tatty","taunt","tauon","taupe","tauts","tawed","tawer","tawie","tawny","tawse","taxed","taxer","taxes","taxis","taxol","taxon","taxus","tazza","tazze","teach","teaks","teals","teams","tears","teary","tease","teats","techs","techy","tecta","teddy","teels","teems","teens","teeny","teeth","teffs","teggs","tegua","tehee","teiid","teind","telae","telco","teles","telex","telia","telic","tells","telly","teloi","telos","tempi","tempo","temps","tempt","tence","tench","tends","tendu","tenet","tenge","tengu","tenia","tenon","tenor","tense","tenth","tents","tenty","tepal","tepas","tepee","tepid","tepin","tepoy","terai","terce","terga","terma","terms","terne","terns","terra","terry","terse","tesla","testa","tests","testy","teths","tetra","tetri","teuch","teugh","tewed","texas","texts","thack","thane","thank","tharm","thawb","thaws","thebe","theca","theft","thegn","thein","their","theme","thens","there","therm","these","thesp","theta","thews","thewy","thick","thief","thigh","thill","thine","thing","think","thins","thiol","third","thirl","thole","thong","thorn","thoro","thorp","those","thous","thraw","three","threw","thrip","throb","throe","throw","thrum","thuds","thugs","thuja","thumb","thump","thunk","thurl","thuya","thyme","thymi","thymy","tiara","tibia","tible","tibor","tical","ticks","tidal","tided","tides","tiers","tiffs","tiger","tight","tigon","tikes","tikis","tikka","tilak","tilde","tiled","tiler","tiles","tills","tilly","tilth","tilts","timba","timed","timer","times","timid","tinct","tinea","tined","tines","tinge","tings","tinny","tints","tipis","tiple","tippy","tipsy","tired","tires","tirls","tiros","titan","titer","tithe","titis","title","titre","titty","tizzy","toads","toady","toast","tocol","today","toddy","toeas","toffs","toffy","tofts","tofus","togae","togas","togue","toile","toils","toits","tokay","toked","token","toker","tokes","tolan","tolar","tolas","toled","toles","tolls","tolus","tolyl","toman","tombs","tomes","tommy","tonal","tondi","tondo","toned","toner","tones","toney","tonfa","tonga","tongs","tonic","tonne","tonos","tonus","tools","toons","tooth","toots","topaz","toped","topee","toper","topes","tophe","tophi","tophs","topic","topis","topoi","topos","toque","torah","toral","toras","torch","torcs","tores","toric","torii","toros","torot","torrs","torse","torsi","torsk","torso","torta","torte","torts","torus","tosyl","total","toted","totem","toter","totes","touch","tough","tours","touse","touts","towed","towel","tower","towie","towns","towny","toxic","toxin","toyed","toyer","toyon","toyos","trace","track","tract","trade","tragi","traik","trail","train","trait","tramp","trams","trank","tranq","trans","traps","trapt","trash","trass","trave","trawl","trays","tread","treat","treed","treen","trees","treks","trend","tress","trets","trews","treys","triac","triad","trial","tribe","trice","trick","tried","trier","tries","trigo","trigs","trike","trill","trims","trine","triol","trios","tripe","trips","trite","troak","trock","trode","trogs","trois","troke","troll","tromp","trona","trone","troop","trooz","trope","tropo","troth","trots","trout","trove","trows","troys","truce","truck","trued","truer","trues","trugs","trull","truly","trump","trunk","truss","trust","truth","tryma","tryst","tsade","tsadi","tsars","tsked","tsuba","tsuga","tsuka","tteok","tubae","tubal","tubas","tubby","tubed","tuber","tubes","tucks","tufas","tuffs","tufts","tufty","tugai","tules","tulip","tulle","tumid","tummy","tumor","tumps","tunas","tuned","tuner","tunes","tungs","tunic","tunny","tupik","tuppy","tuque","turbo","turds","turfs","turfy","turks","turns","turps","tushy","tusks","tutee","tutor","tutti","tutty","tutus","tuxes","tuyer","twaes","twain","twait","twang","twats","tweak","tweed","tween","tweet","twere","twerk","twerp","twice","twier","twigs","twill","twine","twins","twiny","twirl","twirp","twist","twits","twixt","twyer","twyre","tyees","tyers","tying","tyiyn","tykes","tyned","tynes","typal","typed","types","typey","typhi","typic","typoi","typos","typps","tyred","tyres","tyros","tythe","tzade","tzars","ually","ubera","ubity","ucase","udder","udons","uhlan","uinal","ukase","ulama","ulans","ulcer","ulema","ulmic","ulnad","ulnae","ulnal","ulnar","ulnas","uloid","ulpan","ultra","ulvas","umami","umbel","umber","umbos","umbra","umiac","umiak","umiaq","ummah","umped","unais","unapt","unarm","unary","unaus","unawe","unban","unbar","unbid","unbox","uncap","uncia","uncle","uncos","uncoy","uncus","uncut","undee","under","undid","undue","unfed","unfit","unfix","ungot","unhat","unhid","unhip","unify","union","unite","units","unity","unjam","unjar","unlax","unlay","unled","unlet","unlit","unmad","unman","unmet","unmew","unmix","unpeg","unpen","unpin","unrig","unrip","unsad","unsay","unset","unsew","unsex","unshy","unsun","untap","untie","until","unwed","unwet","unwit","unwon","unzip","upbow","upbye","updos","updry","upend","uplit","upped","upper","upset","uraei","urare","urari","urase","urate","urban","urbia","ureal","ureas","uredo","ureic","urged","urger","urges","urial","urine","urped","ursae","ursid","urutu","usage","users","usher","using","usnea","usnic","usque","usual","usurp","usury","uteri","utile","utter","uvala","uveal","uveas","uviol","uvula","vacay","vacua","vagal","vague","vagus","vails","vairs","vakil","vales","valet","valid","valor","valse","value","valve","valyl","vamps","vampy","vance","vanda","vaned","vanes","vangs","vaper","vapes","vapid","vapor","varas","varia","varix","varna","varus","varve","vasal","vases","vasts","vasty","vates","vatic","vatus","vault","vaunt","vaxed","vaxes","veals","vealy","veena","veeps","veers","veery","vegan","veges","vegie","veils","veins","veiny","velar","velds","veldt","velum","venae","venal","vends","venge","venin","venom","vents","venue","venus","verbs","verge","verse","verso","verst","verte","verts","vertu","verve","vesta","vests","vetch","vetos","vexed","vexer","vexes","vexil","vials","viand","vibed","vibes","vicar","viced","vices","vichy","viddy","video","viers","views","viewy","vigas","vigia","vigil","vigor","viler","villa","villi","vills","vimen","vinal","vinas","vinca","vined","vines","vinic","vinos","vinta","vinyl","viola","viols","viper","viral","vireo","vires","virga","virid","virls","virtu","virus","visas","vised","vises","visit","visor","vista","visus","vitae","vital","vitas","vitta","vivas","viver","vivid","vixen","vizir","vizor","vlogs","vnwar","vocab","vocal","voces","vodka","vodou","vodun","vogie","vogue","voice","voids","voila","voile","volar","voled","voles","volta","volte","volti","volto","volts","volva","vomer","vomit","voted","voter","votes","vouch","vowed","vowel","vower","vroom","vrouw","vrows","vuggs","vuggy","vughs","vulgo","vulva","vying","wacke","wacko","wacks","wacky","waddy","waded","wader","wades","wadge","wadis","wafer","waffs","wafts","waged","wager","wages","waggy","wagon","wagyu","wahoo","waifs","waify","wails","wains","wairs","waist","waits","waive","waked","waken","waker","wakes","waled","waler","wales","walks","walla","walls","wally","waltz","wames","wamus","wands","waned","wanes","waney","wanks","wanly","wants","wards","wared","wares","wargs","warks","warms","warns","warps","warpy","warts","warty","washy","wasps","waspy","waste","wasts","wasty","watap","watch","water","watts","waugh","wauks","wauls","waurs","waved","waver","waves","wavey","wawls","waxed","waxen","waxer","waxes","wazoo","weald","weals","weans","wears","weary","weave","webby","weber","wecht","wedel","wedge","wedgy","weeds","weedy","weeks","weels","weens","weeny","weeps","weepy","weest","weets","wefts","weigh","weird","weirs","wekas","welch","welds","wells","welly","welsh","welts","wench","wends","wenny","wests","wetly","whack","whale","whamo","whams","whang","whaps","wharf","whats","whaup","wheal","wheat","wheel","wheen","wheep","whelk","whelm","whelp","whens","where","whets","whews","wheys","which","whids","whiff","whigs","while","whims","whine","whins","whiny","whips","whipt","whirl","whirr","whirs","whish","whisk","whist","white","whits","whity","whizz","whole","whomp","whoof","whoop","whops","whore","whorl","whort","whose","whoso","whump","whups","wicca","wicks","widdy","widen","wider","wides","widow","width","wield","wifed","wifes","wifey","wifty","wigan","wiggy","wight","wikis","wilco","wilds","wiled","wiles","wills","willy","wilts","wimps","wimpy","wince","winch","wincy","winds","windy","wined","wines","winey","wings","wingy","winks","winos","winze","wiped","wiper","wipes","wired","wirer","wires","wirra","wised","wisen","wiser","wises","wisha","wishy","wisps","wispy","wists","witan","witch","wited","wites","withe","withy","witty","wived","wiver","wives","wizen","wizes","woads","woald","wodge","woful","woken","woker","wolds","wolfs","woman","wombs","womby","women","womyn","wonks","wonky","wonts","woods","woody","wooed","wooer","woofs","woofy","wools","wooly","woops","woosh","woozy","words","wordy","works","world","worms","wormy","worry","worse","worst","worth","worts","would","wound","woven","wowed","wrack","wrang","wraps","wrapt","wrath","wreak","wreck","wrens","wrest","wrick","wried","wrier","wries","wring","wrist","write","writs","wrong","wrote","wroth","wrung","wryer","wryly","wurst","wushu","wussy","wyled","wyles","wynds","wynns","wyrds","wyrms","wyted","wytes","xebec","xebek","xenia","xenic","xenin","xenon","xeric","xerox","xerus","xolos","xylan","xylem","xylol","xylom","xylyl","xyrid","xysta","xysti","xysts","yabby","yacal","yacht","yacks","yacon","yaffs","yager","yagis","yahoo","yaird","yamas","yamen","yampa","yampy","yamun","yanas","yangs","yanks","yapok","yapon","yarbs","yards","yarer","yarns","yasak","yatra","yauds","yauld","yaups","yawed","yawey","yawls","yawns","yawps","yclad","yeahs","yeans","yearn","years","yeast","yecch","yechh","yechs","yechy","yeets","yeggs","yelks","yello","yells","yelps","yenta","yente","yerba","yerks","yeses","yetis","yetts","yeuks","yeuky","yield","yikes","yills","yince","yipes","yirds","yirrs","yirth","ylang","ylems","ylids","yobbo","yocks","yocto","yodel","yodhs","yodle","yogas","yogee","yoghs","yogic","yogin","yogis","yoink","yoked","yokel","yokes","yolks","yolky","yomim","yonic","yonis","yores","young","yourn","yours","youse","youth","yowed","yowes","yowie","yowls","yoyos","yuans","yucas","yucca","yucch","yucks","yucky","yugas","yukky","yulan","yules","yummy","yupon","yuppy","yurta","yurts","zafus","zaire","zamia","zanni","zanza","zappy","zarfs","zaxes","zayin","zazen","zazzy","zeals","zebec","zebra","zebus","zeins","zejel","zendo","zerks","zeros","zests","zesty","zetas","zetta","zhuzh","zibet","zilah","zilch","zills","zincs","zincy","zineb","zines","zings","zingy","zinky","zippy","ziram","zitis","zitty","zizit","zling","zlote","zloty","zoeae","zoeal","zoeas","zoics","zokor","zombi","zonae","zonal","zoned","zoner","zones","zonks","zooey","zooic","zooid","zooks","zooms","zoons","zoosh","zooty","zoril","zoris","zouks","zowie","zuzim","zygot","zymes","zymin"]$phase55_valid_guesses$::jsonb)
  with ordinality as item(word, ordinality)
on conflict (kind, word) do nothing;

do $phase55_catalog_check$
begin
  if (select count(*) from brrrdle_private.ranked_daily_word_catalog where kind = 'answer') <> 2175
    or (select count(*) from brrrdle_private.ranked_daily_word_catalog where kind = 'valid_guess') <> 9776
  then
    raise exception 'Phase 55 ranked Daily word catalog does not match the source-controlled pool.';
  end if;
end
$phase55_catalog_check$;
-- PHASE55_GENERATED_WORD_CATALOG_END

-- Existing claims are preserved as the unranked lane before the uniqueness
-- contract is widened. No claim row is deleted or rewritten to ranked.
alter table public.multiplayer_daily_claims
  add column if not exists ranked boolean;

update public.multiplayer_daily_claims
set ranked = false
where ranked is null;

alter table public.multiplayer_daily_claims
  alter column ranked set default false,
  alter column ranked set not null;

alter table public.multiplayer_daily_claims
  drop constraint if exists multiplayer_daily_claims_pkey;

alter table public.multiplayer_daily_claims
  add constraint multiplayer_daily_claims_pkey
  primary key (user_id, transport, mode, daily_date_key, ranked);

create index if not exists multiplayer_daily_claims_user_date_lane_idx
  on public.multiplayer_daily_claims (user_id, daily_date_key, transport, mode, ranked);

create or replace function public.claim_daily_multiplayer_participation(
  p_user_id text,
  p_transport text,
  p_mode text,
  p_daily_date_key text,
  p_source_kind text,
  p_source_id text,
  p_ranked boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if p_user_id is null or p_user_id = ''
    or p_daily_date_key is null or p_daily_date_key = ''
    or p_source_id is null or p_source_id = ''
    or p_ranked is null
  then
    return;
  end if;

  begin
    v_user_id := p_user_id::uuid;
  exception when invalid_text_representation then
    return;
  end;

  insert into public.multiplayer_daily_claims (
    user_id,
    transport,
    mode,
    daily_date_key,
    ranked,
    source_kind,
    source_id,
    updated_at
  )
  values (
    v_user_id,
    p_transport,
    p_mode,
    p_daily_date_key,
    p_ranked,
    p_source_kind,
    p_source_id,
    now()
  )
  on conflict (user_id, transport, mode, daily_date_key, ranked)
  do update set
    source_kind = excluded.source_kind,
    source_id = excluded.source_id,
    updated_at = now()
  where public.multiplayer_daily_claims.source_id = excluded.source_id;

  if not found then
    raise exception 'Daily Multiplayer lane is already claimed.' using errcode = '23505';
  end if;
end;
$$;

-- Backward-compatible six-argument claim callers can address only the
-- unranked lane. The ranked dimension is authoritative only in the explicit
-- seven-argument internal function above.
create or replace function public.claim_daily_multiplayer_participation(
  p_user_id text,
  p_transport text,
  p_mode text,
  p_daily_date_key text,
  p_source_kind text,
  p_source_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_claim_user_id uuid;
begin
  if v_user_id is null or p_user_id is null then
    raise exception 'Daily claim caller must own the unranked claim.' using errcode = '42501';
  end if;
  begin
    v_claim_user_id := p_user_id::uuid;
  exception when invalid_text_representation then
    raise exception 'Daily claim caller must own the unranked claim.' using errcode = '42501';
  end;
  if v_claim_user_id <> v_user_id then
    raise exception 'Daily claim caller must own the unranked claim.' using errcode = '42501';
  end if;
  perform public.claim_daily_multiplayer_participation(
    p_user_id,
    p_transport,
    p_mode,
    p_daily_date_key,
    p_source_kind,
    p_source_id,
    false
  );
end;
$$;

create or replace function public.release_daily_multiplayer_claim(
  p_user_id text,
  p_transport text,
  p_mode text,
  p_daily_date_key text,
  p_source_kind text,
  p_source_id text,
  p_ranked boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if p_user_id is null or p_user_id = ''
    or p_daily_date_key is null or p_daily_date_key = ''
    or p_source_id is null or p_source_id = ''
    or p_ranked is null
  then
    return;
  end if;

  begin
    v_user_id := p_user_id::uuid;
  exception when invalid_text_representation then
    return;
  end;

  delete from public.multiplayer_daily_claims
  where user_id = v_user_id
    and transport = p_transport
    and mode = p_mode
    and daily_date_key = p_daily_date_key
    and ranked = p_ranked
    and source_kind = p_source_kind
    and source_id = p_source_id;
end;
$$;

-- Backward-compatible six-argument release callers can release only the
-- unranked lane and can never release ranked Daily participation.
create or replace function public.release_daily_multiplayer_claim(
  p_user_id text,
  p_transport text,
  p_mode text,
  p_daily_date_key text,
  p_source_kind text,
  p_source_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.release_daily_multiplayer_claim(
    p_user_id,
    p_transport,
    p_mode,
    p_daily_date_key,
    p_source_kind,
    p_source_id,
    false
  );
end;
$$;

create or replace function public.enforce_async_daily_multiplayer_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ranked boolean := coalesce(new.ranked, false);
begin
  if new.scope = 'daily' then
    if new.status = 'cancelled' and new.player_two_user_id is null then
      perform public.release_daily_multiplayer_claim(new.host_user_id::text, 'async', new.mode, new.daily_date_key, 'async_game', new.id, v_ranked);
      perform public.release_daily_multiplayer_claim(new.player_one_user_id::text, 'async', new.mode, new.daily_date_key, 'async_game', new.id, v_ranked);
      return new;
    end if;

    perform public.claim_daily_multiplayer_participation(new.host_user_id::text, 'async', new.mode, new.daily_date_key, 'async_game', new.id, v_ranked);
    perform public.claim_daily_multiplayer_participation(new.player_one_user_id::text, 'async', new.mode, new.daily_date_key, 'async_game', new.id, v_ranked);
    perform public.claim_daily_multiplayer_participation(new.player_two_user_id::text, 'async', new.mode, new.daily_date_key, 'async_game', new.id, v_ranked);
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_async_daily_multiplayer_claim_trigger on public.async_multiplayer_games;
create trigger enforce_async_daily_multiplayer_claim_trigger
  before insert or update of scope, mode, daily_date_key, host_user_id, player_one_user_id, player_two_user_id, status, ranked
  on public.async_multiplayer_games
  for each row
  execute function public.enforce_async_daily_multiplayer_claim();

create or replace function public.enforce_live_lobby_daily_multiplayer_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.scope = 'daily' then
    if new.status = 'cancelled' and new.match_id is null then
      perform public.release_daily_multiplayer_claim(new.host_user_id::text, 'live', new.mode, new.daily_date_key, 'live_lobby', new.id, false);
      return new;
    end if;
    perform public.claim_daily_multiplayer_participation(new.host_user_id::text, 'live', new.mode, new.daily_date_key, 'live_lobby', new.id, false);
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_live_lobby_daily_multiplayer_claim_trigger on public.live_lobbies;
create trigger enforce_live_lobby_daily_multiplayer_claim_trigger
  before insert or update of scope, mode, daily_date_key, host_user_id, status, match_id
  on public.live_lobbies
  for each row
  execute function public.enforce_live_lobby_daily_multiplayer_claim();

create or replace function public.enforce_live_match_daily_multiplayer_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_id text;
begin
  if new.scope = 'daily' then
    v_source_id := coalesce(new.lobby_id, new.id);
    perform public.claim_daily_multiplayer_participation(new.projection #>> '{playerUserIds,player-one}', 'live', new.mode, new.daily_date_key, 'live_match', v_source_id, false);
    perform public.claim_daily_multiplayer_participation(new.projection #>> '{playerUserIds,player-two}', 'live', new.mode, new.daily_date_key, 'live_match', v_source_id, false);
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_live_match_daily_multiplayer_claim_trigger on public.live_matches;
create trigger enforce_live_match_daily_multiplayer_claim_trigger
  before insert or update of scope, mode, daily_date_key, projection
  on public.live_matches
  for each row
  execute function public.enforce_live_match_daily_multiplayer_claim();

create index if not exists multiplayer_matchmaking_queue_ranked_daily_fifo_idx
  on public.multiplayer_matchmaking_queue (
    transport,
    scope,
    daily_date_key,
    mode,
    rating_bucket,
    hard_mode,
    word_length,
    queued_at,
    id
  )
  where status = 'queued'
    and ranked = true
    and transport = 'async'
    and scope = 'daily';

create unique index if not exists multiplayer_matchmaking_queue_ranked_daily_active_lane_uidx
  on public.multiplayer_matchmaking_queue (
    user_id,
    daily_date_key,
    mode
  )
  where status in ('queued', 'matched')
    and ranked = true
    and transport = 'async'
    and scope = 'daily';

create or replace function public.create_ranked_async_matchmaking_request_v2(
  p_mode text,
  p_word_length integer,
  p_hard_mode boolean default false,
  p_idempotency_key text default null,
  p_scope text default 'practice',
  p_daily_date_key text default null,
  p_time_limit_ms integer default null,
  p_expires_at timestamptz default null
)
returns table (
  request_id text,
  request_status text,
  rating_bucket text,
  rating_snapshot integer,
  hard_mode boolean,
  word_length integer,
  mode text,
  scope text,
  daily_date_key text,
  queued_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_scope text := lower(coalesce(p_scope, ''));
  v_mode text := lower(coalesce(p_mode, ''));
  v_bucket text;
  v_existing public.multiplayer_matchmaking_queue%rowtype;
  v_key text;
  v_rating_snapshot integer;
  v_request_id text;
  v_daily_expires_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  if v_scope = 'practice' then
    return query
    select
      legacy.request_id,
      legacy.request_status,
      legacy.rating_bucket,
      legacy.rating_snapshot,
      legacy.hard_mode,
      legacy.word_length,
      v_mode,
      'practice'::text,
      null::text,
      legacy.queued_at,
      legacy.expires_at
    from public.create_ranked_async_matchmaking_request(
      p_mode,
      p_word_length,
      p_hard_mode,
      p_idempotency_key,
      'practice',
      p_time_limit_ms,
      p_expires_at
    ) as legacy;
    return;
  end if;

  if v_scope <> 'daily'
    or p_daily_date_key is distinct from ((now() at time zone 'UTC')::date)::text
    or p_word_length <> 5
    or p_time_limit_ms is not null
  then
    raise exception 'Ranked Daily requires the current UTC date, five letters, and no clock.' using errcode = '22023';
  end if;

  v_bucket := public.phase55_ranked_storage_bucket('daily', v_mode, null);
  if v_bucket is null then
    raise exception 'Unsupported ranked Daily mode.' using errcode = '22023';
  end if;

  v_daily_expires_at := ((p_daily_date_key::date + 1)::timestamp at time zone 'UTC');
  if p_expires_at is not null and p_expires_at is distinct from v_daily_expires_at then
    raise exception 'Ranked Daily queue expiry is fixed at the next UTC midnight.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(public.phase55_ranked_daily_lane_lock_key(
    v_user_id,
    p_daily_date_key,
    v_mode
  ));

  if exists (
    select 1
    from public.multiplayer_daily_claims claim_row
    where claim_row.user_id = v_user_id
      and claim_row.transport = 'async'
      and claim_row.mode = v_mode
      and claim_row.daily_date_key = p_daily_date_key
      and claim_row.ranked = true
  ) then
    raise exception 'Ranked Daily lane is already claimed.' using errcode = '23505';
  end if;

  update public.multiplayer_matchmaking_queue queue_row
  set status = 'expired'
  where queue_row.user_id = v_user_id
    and queue_row.status = 'queued'
    and queue_row.expires_at is not null
    and queue_row.expires_at <= now();

  select profile.rating
  into v_rating_snapshot
  from public.multiplayer_rating_profiles profile
  where profile.user_id = v_user_id
    and profile.bucket = v_bucket;
  v_rating_snapshot := coalesce(v_rating_snapshot, 1200);

  select *
  into v_existing
  from public.multiplayer_matchmaking_queue queue_row
  where queue_row.user_id = v_user_id
    and queue_row.transport = 'async'
    and queue_row.scope = 'daily'
    and queue_row.ranked = true
    and queue_row.daily_date_key = p_daily_date_key
    and queue_row.mode = v_mode
    and queue_row.status in ('queued', 'matched')
  order by queue_row.queued_at, queue_row.id
  limit 1
  for update;

  if found then
    if v_existing.word_length <> 5
      or v_existing.hard_mode is distinct from coalesce(p_hard_mode, false)
      or v_existing.rating_bucket <> v_bucket
      or v_existing.time_limit_ms is not null
    then
      raise exception 'Ranked Daily lane already has an active request with different settings.' using errcode = '23505';
    end if;
    v_request_id := v_existing.id;
  else
    v_key := coalesce(
      nullif(p_idempotency_key, ''),
      'phase55-ranked-daily-v1:queue:' || v_user_id::text || ':' || p_daily_date_key || ':' || v_mode || ':' || coalesce(p_hard_mode, false)::text
    );

    select *
    into v_existing
    from public.multiplayer_matchmaking_queue queue_row
    where queue_row.idempotency_key = v_key
    for update;

    if found then
      if v_existing.user_id <> v_user_id then
        raise exception 'Ranked queue idempotency key belongs to another user.' using errcode = '42501';
      end if;
      if v_existing.transport <> 'async'
        or v_existing.scope <> 'daily'
        or v_existing.ranked is distinct from true
        or v_existing.daily_date_key is distinct from p_daily_date_key
        or v_existing.mode <> v_mode
        or v_existing.word_length <> 5
        or v_existing.hard_mode is distinct from coalesce(p_hard_mode, false)
        or v_existing.rating_bucket <> v_bucket
        or v_existing.time_limit_ms is not null
      then
        raise exception 'Ranked queue idempotency key belongs to different settings.' using errcode = '22023';
      end if;

      update public.multiplayer_matchmaking_queue queue_row
      set
        status = 'queued',
        rating_snapshot = v_rating_snapshot,
        queued_at = now(),
        expires_at = v_daily_expires_at,
        matched_at = null,
        matched_game_id = null,
        matched_match_id = null
      where queue_row.id = v_existing.id
        and queue_row.status in ('cancelled', 'expired');
      v_request_id := v_existing.id;
    else
    insert into public.multiplayer_matchmaking_queue (
      user_id,
      transport,
      mode,
      scope,
      daily_date_key,
      word_length,
      rating_bucket,
      rating_snapshot,
      ranked,
      status,
      idempotency_key,
      expires_at,
      hard_mode,
      time_limit_ms,
      matchmaking_version
    ) values (
      v_user_id,
      'async',
      v_mode,
      'daily',
      p_daily_date_key,
      5,
      v_bucket,
      v_rating_snapshot,
      true,
      'queued',
      v_key,
      v_daily_expires_at,
      coalesce(p_hard_mode, false),
      null,
      'phase55-ranked-daily-v1'
    ) returning multiplayer_matchmaking_queue.id into v_request_id;
    end if;
  end if;

  return query
  select
    queue_row.id,
    queue_row.status,
    queue_row.rating_bucket,
    queue_row.rating_snapshot,
    queue_row.hard_mode,
    queue_row.word_length,
    queue_row.mode,
    queue_row.scope,
    queue_row.daily_date_key,
    queue_row.queued_at,
    queue_row.expires_at
  from public.multiplayer_matchmaking_queue queue_row
  where queue_row.id = v_request_id;
end;
$$;

create or replace function public.claim_ranked_async_matchmaking_pair(
  p_request_id text,
  p_matched_game_id text default null
)
returns table (
  request_id text,
  opponent_request_id text,
  matched_game_id text,
  request_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.multiplayer_matchmaking_queue%rowtype;
  v_opponent public.multiplayer_matchmaking_queue%rowtype;
  v_matched_game_id text;
  v_request_lock_key bigint;
  v_opponent_lock_key bigint;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  update public.multiplayer_matchmaking_queue queue_row
  set status = 'expired'
  where queue_row.status = 'queued'
    and queue_row.expires_at is not null
    and queue_row.expires_at <= now();

  select * into v_request
  from public.multiplayer_matchmaking_queue queue_row
  where queue_row.id = p_request_id;

  if not found or v_request.user_id <> v_user_id then
    raise exception 'Ranked queue request is not owned by current user.' using errcode = '42501';
  end if;
  if v_request.transport <> 'async'
    or v_request.ranked is distinct from true
    or not public.phase55_ranked_queue_settings_are_valid(
      v_request.scope,
      v_request.daily_date_key,
      v_request.mode,
      v_request.word_length,
      v_request.rating_bucket,
      v_request.time_limit_ms
    )
  then
    raise exception 'Ranked queue request is not eligible for pairing.' using errcode = '22023';
  end if;

  -- Preserve the deployed ranked Practice pairing path. Phase 55 changes only
  -- the Daily branch below.
  if v_request.scope = 'practice' then
    select * into v_request
    from public.multiplayer_matchmaking_queue queue_row
    where queue_row.id = p_request_id
    for update;

    if v_request.status <> 'queued' then
      raise exception 'Ranked queue request is not queued.' using errcode = '22023';
    end if;

    select candidate.* into v_opponent
    from public.multiplayer_matchmaking_queue candidate
    where candidate.status = 'queued'
      and candidate.id <> v_request.id
      and candidate.user_id <> v_request.user_id
      and candidate.transport = 'async'
      and candidate.ranked = true
      and candidate.scope = 'practice'
      and candidate.daily_date_key is null
      and candidate.mode = v_request.mode
      and candidate.rating_bucket = v_request.rating_bucket
      and candidate.hard_mode = v_request.hard_mode
      and candidate.word_length = v_request.word_length
      and candidate.time_limit_ms is not distinct from v_request.time_limit_ms
      and public.phase55_ranked_queue_settings_are_valid(
        candidate.scope,
        candidate.daily_date_key,
        candidate.mode,
        candidate.word_length,
        candidate.rating_bucket,
        candidate.time_limit_ms
      )
      and (candidate.expires_at is null or candidate.expires_at > now())
    order by candidate.queued_at, candidate.id
    for update skip locked
    limit 1;

    if not found then
      return query select v_request.id, null::text, null::text, 'queued'::text;
      return;
    end if;

    v_matched_game_id := coalesce(
      nullif(p_matched_game_id, ''),
      'ranked-async-game-' || extensions.gen_random_uuid()::text
    );
    update public.multiplayer_matchmaking_queue queue_row
    set
      status = 'matched',
      matched_at = now(),
      matched_match_id = v_matched_game_id,
      matched_game_id = v_matched_game_id
    where queue_row.id in (v_request.id, v_opponent.id);

    return query select v_request.id, v_opponent.id, v_matched_game_id, 'matched'::text;
    return;
  end if;

  if v_request.scope <> 'daily' or v_request.status <> 'queued' then
    raise exception 'Ranked Daily queue request is not queued.' using errcode = '22023';
  end if;

  loop
    select candidate.* into v_opponent
    from public.multiplayer_matchmaking_queue candidate
    where candidate.status = 'queued'
      and candidate.id <> v_request.id
      and candidate.user_id <> v_request.user_id
      and candidate.transport = 'async'
      and candidate.ranked = true
      and candidate.scope = 'daily'
      and candidate.daily_date_key = v_request.daily_date_key
      and candidate.mode = v_request.mode
      and candidate.rating_bucket = v_request.rating_bucket
      and candidate.hard_mode = v_request.hard_mode
      and candidate.word_length = 5
      and candidate.time_limit_ms is null
      and public.phase55_ranked_queue_settings_are_valid(
        candidate.scope,
        candidate.daily_date_key,
        candidate.mode,
        candidate.word_length,
        candidate.rating_bucket,
        candidate.time_limit_ms
      )
      and (candidate.expires_at is null or candidate.expires_at > now())
      and not exists (
        select 1 from public.multiplayer_daily_claims claim_row
        where claim_row.user_id = candidate.user_id
          and claim_row.transport = 'async'
          and claim_row.mode = candidate.mode
          and claim_row.daily_date_key = candidate.daily_date_key
          and claim_row.ranked = true
      )
    order by candidate.queued_at, candidate.id
    limit 1;

    if not found then
      return query select v_request.id, null::text, null::text, 'queued'::text;
      return;
    end if;

    v_request_lock_key := public.phase55_ranked_daily_lane_lock_key(
      v_request.user_id,
      v_request.daily_date_key,
      v_request.mode
    );
    v_opponent_lock_key := public.phase55_ranked_daily_lane_lock_key(
      v_opponent.user_id,
      v_opponent.daily_date_key,
      v_opponent.mode
    );
    if v_request_lock_key <= v_opponent_lock_key then
      perform pg_advisory_xact_lock(v_request_lock_key);
      perform pg_advisory_xact_lock(v_opponent_lock_key);
    else
      perform pg_advisory_xact_lock(v_opponent_lock_key);
      perform pg_advisory_xact_lock(v_request_lock_key);
    end if;

    perform 1
    from public.multiplayer_matchmaking_queue queue_row
    where queue_row.id in (v_request.id, v_opponent.id)
    order by queue_row.id
    for update;

    select * into v_request
    from public.multiplayer_matchmaking_queue queue_row
    where queue_row.id = p_request_id;
    select * into v_opponent
    from public.multiplayer_matchmaking_queue queue_row
    where queue_row.id = v_opponent.id;

    if v_request.status <> 'queued' then
      raise exception 'Ranked Daily queue request changed while pairing.' using errcode = '40001';
    end if;
    if v_opponent.status <> 'queued'
      or v_opponent.scope <> 'daily'
      or v_opponent.daily_date_key is distinct from v_request.daily_date_key
      or v_opponent.mode <> v_request.mode
      or v_opponent.rating_bucket <> v_request.rating_bucket
      or v_opponent.hard_mode <> v_request.hard_mode
      or v_opponent.word_length <> 5
      or v_opponent.time_limit_ms is not null
    then
      continue;
    end if;

    if exists (
      select 1 from public.multiplayer_daily_claims claim_row
      where claim_row.user_id in (v_request.user_id, v_opponent.user_id)
        and claim_row.transport = 'async'
        and claim_row.mode = v_request.mode
        and claim_row.daily_date_key = v_request.daily_date_key
        and claim_row.ranked = true
    ) then
      raise exception 'Ranked Daily lane is already claimed.' using errcode = '23505';
    end if;

    v_matched_game_id := 'ranked-async-game-' || extensions.gen_random_uuid()::text;
    insert into brrrdle_private.ranked_daily_pair_reservations (
      game_id,
      request_one_id,
      request_two_id,
      player_one_user_id,
      player_two_user_id,
      daily_date_key,
      mode,
      hard_mode,
      rating_bucket
    ) values (
      v_matched_game_id,
      v_request.id,
      v_opponent.id,
      v_request.user_id,
      v_opponent.user_id,
      v_request.daily_date_key,
      v_request.mode,
      v_request.hard_mode,
      v_request.rating_bucket
    );

    update public.multiplayer_matchmaking_queue queue_row
    set
      status = 'matched',
      matched_at = now(),
      matched_match_id = v_matched_game_id,
      matched_game_id = v_matched_game_id
    where queue_row.id in (v_request.id, v_opponent.id);

    return query select v_request.id, v_opponent.id, v_matched_game_id, 'matched'::text;
    return;
  end loop;
end;
$$;

create or replace function public.get_ranked_async_matchmaking_status_v2(p_request_id text)
returns table (
  request_id text,
  request_status text,
  matched_game_id text,
  opponent_request_id text,
  viewer_seat text,
  player_one_user_id uuid,
  player_two_user_id uuid,
  mode text,
  scope text,
  daily_date_key text,
  rating_bucket text,
  word_length integer,
  hard_mode boolean,
  time_limit_ms integer,
  queued_at timestamptz,
  matched_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.multiplayer_matchmaking_queue%rowtype;
  v_first public.multiplayer_matchmaking_queue%rowtype;
  v_second public.multiplayer_matchmaking_queue%rowtype;
  v_matched_game_id text;
  v_pair_rows integer;
  v_pair_users integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  select * into v_request
  from public.multiplayer_matchmaking_queue queue_row
  where queue_row.id = p_request_id;

  if not found or v_request.user_id <> v_user_id then
    raise exception 'Ranked queue request is not owned by current user.' using errcode = '42501';
  end if;
  if v_request.transport <> 'async'
    or v_request.ranked is distinct from true
    or not public.phase55_ranked_queue_settings_are_valid(
      v_request.scope,
      v_request.daily_date_key,
      v_request.mode,
      v_request.word_length,
      v_request.rating_bucket,
      v_request.time_limit_ms
    )
  then
    raise exception 'Ranked queue request is not eligible for status.' using errcode = '22023';
  end if;

  if v_request.status <> 'matched' then
    return query select
      v_request.id,
      v_request.status,
      null::text,
      null::text,
      null::text,
      null::uuid,
      null::uuid,
      v_request.mode,
      v_request.scope,
      v_request.daily_date_key,
      v_request.rating_bucket,
      v_request.word_length,
      v_request.hard_mode,
      v_request.time_limit_ms,
      v_request.queued_at,
      null::timestamptz;
    return;
  end if;

  v_matched_game_id := coalesce(nullif(v_request.matched_game_id, ''), nullif(v_request.matched_match_id, ''));
  if v_matched_game_id is null then
    raise exception 'Matched ranked queue request is missing a game id.' using errcode = '22023';
  end if;

  select count(*)::integer, count(distinct queue_row.user_id)::integer
  into v_pair_rows, v_pair_users
  from public.multiplayer_matchmaking_queue queue_row
  where coalesce(nullif(queue_row.matched_game_id, ''), nullif(queue_row.matched_match_id, '')) = v_matched_game_id
    and queue_row.status = 'matched';
  if v_pair_rows <> 2 or v_pair_users <> 2 then
    raise exception 'Matched ranked queue reservation must contain exactly two distinct users.' using errcode = '22023';
  end if;

  select * into v_first
  from public.multiplayer_matchmaking_queue queue_row
  where coalesce(nullif(queue_row.matched_game_id, ''), nullif(queue_row.matched_match_id, '')) = v_matched_game_id
    and queue_row.status = 'matched'
  order by queue_row.queued_at, queue_row.id
  limit 1;

  select * into v_second
  from public.multiplayer_matchmaking_queue queue_row
  where coalesce(nullif(queue_row.matched_game_id, ''), nullif(queue_row.matched_match_id, '')) = v_matched_game_id
    and queue_row.status = 'matched'
    and queue_row.id <> v_first.id
  order by queue_row.queued_at, queue_row.id
  limit 1;

  if v_first.transport <> 'async'
    or v_second.transport <> 'async'
    or v_first.ranked is distinct from true
    or v_second.ranked is distinct from true
    or v_first.user_id = v_second.user_id
    or v_first.scope <> v_second.scope
    or v_first.daily_date_key is distinct from v_second.daily_date_key
    or v_first.mode <> v_second.mode
    or v_first.rating_bucket <> v_second.rating_bucket
    or v_first.word_length is distinct from v_second.word_length
    or v_first.hard_mode is distinct from v_second.hard_mode
    or v_first.time_limit_ms is distinct from v_second.time_limit_ms
    or not public.phase55_ranked_queue_settings_are_valid(
      v_first.scope,
      v_first.daily_date_key,
      v_first.mode,
      v_first.word_length,
      v_first.rating_bucket,
      v_first.time_limit_ms
    )
  then
    raise exception 'Matched ranked queue reservation contains incompatible settings.' using errcode = '22023';
  end if;

  return query select
    v_request.id,
    v_request.status,
    v_matched_game_id,
    case when v_request.id = v_first.id then v_second.id else v_first.id end,
    case when v_request.id = v_first.id then 'player-one' else 'player-two' end,
    v_first.user_id,
    v_second.user_id,
    v_first.mode,
    v_first.scope,
    v_first.daily_date_key,
    v_first.rating_bucket,
    v_first.word_length,
    v_first.hard_mode,
    v_first.time_limit_ms,
    v_request.queued_at,
    coalesce(v_request.matched_at, greatest(v_first.queued_at, v_second.queued_at));
end;
$$;

create or replace function public.finalize_ranked_async_matchmaking_game_v2(
  p_request_id text,
  p_matched_game_id text,
  p_game_projection jsonb,
  p_idempotency_key text default null
)
returns table (
  game_id text,
  request_id text,
  opponent_request_id text,
  request_status text,
  created boolean,
  idempotent boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.multiplayer_matchmaking_queue%rowtype;
  v_first public.multiplayer_matchmaking_queue%rowtype;
  v_second public.multiplayer_matchmaking_queue%rowtype;
  v_existing_game public.async_multiplayer_games%rowtype;
  v_reservation brrrdle_private.ranked_daily_pair_reservations%rowtype;
  v_existing_authority brrrdle_private.ranked_daily_game_authority%rowtype;
  v_answers text[];
  v_app_rating_bucket text;
  v_go_puzzle_count integer;
  v_idempotency_key text;
  v_now timestamptz := now();
  v_public_projection jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;
  if p_request_id is null or p_request_id = ''
    or p_matched_game_id is null or p_matched_game_id = ''
    or p_game_projection is null
    or jsonb_typeof(p_game_projection) <> 'object'
  then
    raise exception 'Ranked finalization requires request, game, and projection evidence.' using errcode = '22023';
  end if;

  select * into v_request
  from public.multiplayer_matchmaking_queue queue_row
  where queue_row.id = p_request_id;

  if not found or v_request.user_id <> v_user_id then
    raise exception 'Ranked queue request is not owned by current user.' using errcode = '42501';
  end if;

  if v_request.scope = 'practice' then
    return query select * from public.finalize_ranked_async_matchmaking_game(
      p_request_id,
      p_matched_game_id,
      p_game_projection,
      p_idempotency_key
    );
    return;
  end if;

  select * into v_reservation
  from brrrdle_private.ranked_daily_pair_reservations reservation
  where reservation.game_id = p_matched_game_id
  for update;

  if not found
    or p_request_id not in (v_reservation.request_one_id, v_reservation.request_two_id)
    or v_user_id not in (v_reservation.player_one_user_id, v_reservation.player_two_user_id)
  then
    raise exception 'Ranked Daily reservation is not owned by current user.' using errcode = '42501';
  end if;

  perform 1
  from public.multiplayer_matchmaking_queue queue_row
  where queue_row.id in (v_reservation.request_one_id, v_reservation.request_two_id)
  order by queue_row.id
  for update;

  select * into v_first
  from public.multiplayer_matchmaking_queue queue_row
  where queue_row.id = v_reservation.request_one_id;
  select * into v_second
  from public.multiplayer_matchmaking_queue queue_row
  where queue_row.id = v_reservation.request_two_id;

  if v_first.status <> 'matched'
    or v_second.status <> 'matched'
    or v_first.user_id is distinct from v_reservation.player_one_user_id
    or v_second.user_id is distinct from v_reservation.player_two_user_id
    or v_first.scope <> 'daily'
    or v_second.scope <> 'daily'
    or v_first.transport <> 'async'
    or v_second.transport <> 'async'
    or v_first.ranked is distinct from true
    or v_second.ranked is distinct from true
    or v_first.daily_date_key is distinct from v_reservation.daily_date_key
    or v_second.daily_date_key is distinct from v_reservation.daily_date_key
    or v_first.mode is distinct from v_reservation.mode
    or v_second.mode is distinct from v_reservation.mode
    or v_first.rating_bucket is distinct from v_reservation.rating_bucket
    or v_second.rating_bucket is distinct from v_reservation.rating_bucket
    or v_first.hard_mode is distinct from v_reservation.hard_mode
    or v_second.hard_mode is distinct from v_reservation.hard_mode
    or v_first.word_length <> 5
    or v_second.word_length <> 5
    or v_first.time_limit_ms is not null
    or v_second.time_limit_ms is not null
    or coalesce(nullif(v_first.matched_game_id, ''), nullif(v_first.matched_match_id, '')) <> v_reservation.game_id
    or coalesce(nullif(v_second.matched_game_id, ''), nullif(v_second.matched_match_id, '')) <> v_reservation.game_id
    or not public.phase55_ranked_queue_settings_are_valid(
      v_first.scope,
      v_first.daily_date_key,
      v_first.mode,
      v_first.word_length,
      v_first.rating_bucket,
      v_first.time_limit_ms
    )
  then
    raise exception 'Matched ranked Daily reservation contains incompatible settings.' using errcode = '22023';
  end if;

  v_app_rating_bucket := public.phase55_ranked_app_bucket(v_reservation.rating_bucket);
  if v_app_rating_bucket is null
    or p_game_projection ->> 'id' is distinct from v_reservation.game_id
    or lower(coalesce(p_game_projection ->> 'mode', '')) <> v_reservation.mode
    or lower(coalesce(p_game_projection ->> 'scope', '')) <> 'daily'
    or p_game_projection ->> 'dailyDateKey' is distinct from v_reservation.daily_date_key
    or p_game_projection ->> 'ranked' is distinct from 'true'
    or p_game_projection ->> 'ratingBucket' is distinct from v_app_rating_bucket
    or p_game_projection ->> 'wordLength' is distinct from '5'
    or p_game_projection ->> 'difficulty' is distinct from 'expert'
    or p_game_projection ->> 'hardMode' is distinct from v_reservation.hard_mode::text
    or nullif(p_game_projection ->> 'timeLimitMs', '') is not null
    or nullif(p_game_projection ->> 'customGameCode', '') is not null
    or p_game_projection #>> '{playerUserIds,player-one}' is distinct from v_reservation.player_one_user_id::text
    or p_game_projection #>> '{playerUserIds,player-two}' is distinct from v_reservation.player_two_user_id::text
    or jsonb_typeof(p_game_projection -> 'moves') <> 'array'
    or jsonb_array_length(p_game_projection -> 'moves') <> 0
  then
    raise exception 'Ranked Daily projection does not match its server reservation.' using errcode = '22023';
  end if;

  v_go_puzzle_count := case when v_reservation.mode = 'go' then 5 else null end;
  if (v_reservation.mode = 'go' and p_game_projection ->> 'goPuzzleCount' is distinct from '5')
    or (v_reservation.mode = 'og' and nullif(p_game_projection ->> 'goPuzzleCount', '') is not null)
  then
    raise exception 'Ranked Daily uses the canonical GO puzzle count only.' using errcode = '22023';
  end if;

  v_answers := brrrdle_private.phase55_ranked_daily_answers(
    v_reservation.daily_date_key,
    v_reservation.mode
  );
  v_idempotency_key := 'phase55-ranked-daily-v1:finalize:' || v_reservation.game_id;
  if nullif(p_idempotency_key, '') is not null and p_idempotency_key <> v_idempotency_key then
    raise exception 'Ranked Daily finalization idempotency key is invalid.' using errcode = '22023';
  end if;

  select * into v_existing_game
  from public.async_multiplayer_games game_row
  where game_row.id = v_reservation.game_id
  for update;

  if found then
    select * into v_existing_authority
    from brrrdle_private.ranked_daily_game_authority authority
    where authority.game_id = v_reservation.game_id;
    if not found
      or v_existing_game.ranked is distinct from true
      or v_existing_game.scope <> 'daily'
      or v_existing_game.daily_date_key is distinct from v_reservation.daily_date_key
      or v_existing_game.mode <> v_reservation.mode
      or v_existing_game.rating_bucket <> v_reservation.rating_bucket
      or v_existing_game.word_length <> 5
      or v_existing_game.player_one_user_id is distinct from v_reservation.player_one_user_id
      or v_existing_game.player_two_user_id is distinct from v_reservation.player_two_user_id
      or v_existing_authority.answers is distinct from v_answers
    then
      raise exception 'Existing ranked Daily game does not match this reservation.' using errcode = '23505';
    end if;
    return query select
      v_existing_game.id,
      p_request_id,
      case when p_request_id = v_reservation.request_one_id
        then v_reservation.request_two_id else v_reservation.request_one_id end,
      'matched'::text,
      false,
      true;
    return;
  end if;

  -- Strip every session/answer-bearing and participant-derived outcome field.
  -- Clients deterministically hydrate playable sessions from the canonical
  -- date/mode settings after loading this answerless projection.
  v_public_projection := p_game_projection
    - 'serializedSession'
    - 'playerSessions'
    - 'moves'
    - 'winnerId'
    - 'forfeitedPlayerId'
    - 'timedOutPlayerId'
    - 'endedAt'
    - 'timeRemainingMs'
    - 'turnStartedAt'
    - 'deadlineAt'
    - 'seed'
    - 'status'
    - 'currentTurn'
    - 'createdAt'
    - 'updatedAt'
    - 'matchmakingRequestId';
  v_public_projection := v_public_projection
    || jsonb_build_object(
      'id', v_reservation.game_id,
      'scope', 'daily',
      'mode', v_reservation.mode,
      'dailyDateKey', v_reservation.daily_date_key,
      'ranked', true,
      'ratingBucket', v_app_rating_bucket,
      'wordLength', 5,
      'difficulty', 'expert',
      'hardMode', v_reservation.hard_mode,
      'goPuzzleCount', v_go_puzzle_count,
      'playerUserIds', jsonb_build_object(
        'player-one', v_reservation.player_one_user_id,
        'player-two', v_reservation.player_two_user_id
      ),
      'matchmakingRequestId', v_idempotency_key,
      'status', 'playing',
      'currentTurn', 'player-one',
      'moves', '[]'::jsonb,
      'authorityVersion', 0,
      'createdAt', v_reservation.matched_at,
      'updatedAt', v_now,
      'deadlineAt', ((v_reservation.daily_date_key::date + 1)::timestamp at time zone 'UTC')
    );

  insert into public.async_multiplayer_games (
    id,
    scope,
    mode,
    daily_date_key,
    status,
    current_turn,
    word_length,
    difficulty,
    go_puzzle_count,
    host_user_id,
    player_one_user_id,
    player_two_user_id,
    ranked,
    rating_bucket,
    matchmaking_request_id,
    custom_game_code,
    winner_player_id,
    deadline_at,
    ended_at,
    projection,
    created_at,
    updated_at
  ) values (
    v_reservation.game_id,
    'daily',
    v_reservation.mode,
    v_reservation.daily_date_key,
    'playing',
    'player-one',
    5,
    'expert',
    v_go_puzzle_count,
    v_reservation.player_one_user_id,
    v_reservation.player_one_user_id,
    v_reservation.player_two_user_id,
    true,
    v_reservation.rating_bucket,
    v_idempotency_key,
    null,
    null,
    ((v_reservation.daily_date_key::date + 1)::timestamp at time zone 'UTC'),
    null,
    v_public_projection,
    v_reservation.matched_at,
    v_now
  );

  insert into brrrdle_private.ranked_daily_game_authority (
    game_id,
    daily_date_key,
    mode,
    hard_mode,
    go_puzzle_count,
    answers,
    player_one_user_id,
    player_two_user_id,
    current_turn
  ) values (
    v_reservation.game_id,
    v_reservation.daily_date_key,
    v_reservation.mode,
    v_reservation.hard_mode,
    v_go_puzzle_count,
    v_answers,
    v_reservation.player_one_user_id,
    v_reservation.player_two_user_id,
    'player-one'
  );

  update brrrdle_private.ranked_daily_pair_reservations reservation
  set finalized_at = v_now
  where reservation.game_id = v_reservation.game_id;

  return query select
    v_reservation.game_id,
    p_request_id,
    case when p_request_id = v_reservation.request_one_id
      then v_reservation.request_two_id else v_reservation.request_one_id end,
    'matched'::text,
    true,
    false;
end;
$$;

create or replace function public.save_ranked_daily_async_multiplayer_action(
  p_game_id text,
  p_expected_version integer,
  p_expected_move_count integer,
  p_action_id text,
  p_guess text default null,
  p_forfeit boolean default false
)
returns table (game_projection jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_game public.async_multiplayer_games%rowtype;
  authority_row brrrdle_private.ranked_daily_game_authority%rowtype;
  v_reservation brrrdle_private.ranked_daily_pair_reservations%rowtype;
  v_existing_action brrrdle_private.ranked_daily_action_ledger%rowtype;
  v_action_type text;
  v_answer text;
  v_attempt_limit integer;
  v_created_at timestamptz := now();
  v_evidence jsonb;
  v_expected_tiles jsonb;
  v_forfeited_player_id text;
  v_guess text := lower(nullif(btrim(p_guess), ''));
  v_ledger_moves jsonb;
  v_left_points integer;
  v_next_move_count integer;
  v_next_puzzle_index integer;
  v_next_turn text;
  v_next_version integer;
  v_other_attempts integer;
  v_other_player_id text;
  v_player_attempts integer;
  v_player_id text;
  v_projection_status text;
  v_right_points integer;
  v_solved boolean := false;
  v_terminal_status text := 'playing';
  v_updated_projection jsonb;
  v_winner_player_id text;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;
  if nullif(p_game_id, '') is null
    or nullif(p_action_id, '') is null
    or length(p_action_id) > 200
    or p_expected_version is null
    or p_expected_move_count is null
    or ((v_guess is null) = (coalesce(p_forfeit, false) is false))
  then
    raise exception 'Ranked Daily action evidence is invalid.' using errcode = '22023';
  end if;

  -- All ranked Daily game mutations use one lock order: reservation, authority,
  -- public projection. Settlement follows the same order before rating rows.
  select * into v_reservation
  from brrrdle_private.ranked_daily_pair_reservations reservation
  where reservation.game_id = p_game_id
  for update;
  select * into authority_row
  from brrrdle_private.ranked_daily_game_authority authority
  where authority.game_id = p_game_id
  for update;
  select * into v_game
  from public.async_multiplayer_games game_row
  where game_row.id = p_game_id
  for update;

  if v_reservation.game_id is null or authority_row.game_id is null or v_game.id is null then
    raise exception 'Ranked Daily authority was not found.' using errcode = 'P0002';
  end if;
  if v_user_id = authority_row.player_one_user_id then
    v_player_id := 'player-one';
    v_other_player_id := 'player-two';
  elsif v_user_id = authority_row.player_two_user_id then
    v_player_id := 'player-two';
    v_other_player_id := 'player-one';
  else
    raise exception 'Only ranked Daily participants can submit actions.' using errcode = '42501';
  end if;

  select * into v_existing_action
  from brrrdle_private.ranked_daily_action_ledger action
  where action.game_id = p_game_id and action.action_id = p_action_id;
  if found then
    if v_existing_action.player_user_id <> v_user_id
      or (v_existing_action.action_type = 'guess') is distinct from (v_guess is not null)
      or v_existing_action.guess is distinct from v_guess
    then
      raise exception 'Ranked Daily action id belongs to different evidence.' using errcode = '23505';
    end if;
    return query select v_game.projection;
    return;
  end if;

  if authority_row.terminal_status <> 'playing' then
    raise exception 'Ranked Daily game is already terminal.' using errcode = '22023';
  end if;
  if authority_row.version <> p_expected_version
    or authority_row.move_count <> p_expected_move_count
  then
    raise exception 'Ranked Daily action has stale expected_version or move count.' using errcode = '40001';
  end if;
  if v_game.ranked is distinct from true
    or v_game.scope <> 'daily'
    or v_game.daily_date_key is distinct from authority_row.daily_date_key
    or v_game.mode is distinct from authority_row.mode
    or v_game.player_one_user_id is distinct from authority_row.player_one_user_id
    or v_game.player_two_user_id is distinct from authority_row.player_two_user_id
    or v_game.rating_bucket is distinct from public.phase55_ranked_storage_bucket('daily', authority_row.mode, null)
    or v_game.word_length <> 5
    or v_game.difficulty <> 'expert'
    or v_game.custom_game_code is not null
    or v_game.deadline_at is distinct from ((authority_row.daily_date_key::date + 1)::timestamp at time zone 'UTC')
  then
    raise exception 'Ranked Daily public projection does not match server authority.' using errcode = '22023';
  end if;
  if v_created_at >= ((authority_row.daily_date_key::date + 1)::timestamp at time zone 'UTC') then
    raise exception 'Ranked Daily game has expired.' using errcode = '22023';
  end if;

  v_next_version := authority_row.version + 1;
  v_next_move_count := authority_row.move_count;
  v_next_turn := authority_row.current_turn;
  v_next_puzzle_index := authority_row.current_puzzle_index;

  if coalesce(p_forfeit, false) then
    v_action_type := case when authority_row.move_count = 0 then 'cancel' else 'forfeit' end;
    v_terminal_status := case when v_action_type = 'cancel' then 'cancelled' else 'completed' end;
    v_projection_status := case when v_action_type = 'cancel' then 'cancelled' else 'lost' end;
    if v_action_type = 'forfeit' then
      v_forfeited_player_id := v_player_id;
      v_winner_player_id := v_other_player_id;
    end if;

    insert into brrrdle_private.ranked_daily_action_ledger (
      game_id,
      sequence_no,
      action_id,
      action_type,
      player_user_id,
      player_id,
      created_at
    ) values (
      p_game_id,
      v_next_version,
      p_action_id,
      v_action_type,
      v_user_id,
      v_player_id,
      v_created_at
    );
  else
    if v_player_id <> authority_row.current_turn then
      raise exception 'It is not this ranked Daily participant''s turn.' using errcode = '22023';
    end if;
    if v_guess !~ '^[a-z]{5}$'
      or not exists (
        select 1 from brrrdle_private.ranked_daily_word_catalog catalog
        where catalog.kind = 'valid_guess' and catalog.word = v_guess
      )
    then
      raise exception 'Ranked Daily guess is not in the canonical dictionary.' using errcode = '22023';
    end if;

    v_answer := authority_row.answers[authority_row.current_puzzle_index + 1];
    v_expected_tiles := brrrdle_private.phase55_ranked_daily_tiles(v_guess, v_answer);
    v_evidence := brrrdle_private.phase55_ranked_daily_hard_mode_evidence(
      p_game_id,
      authority_row.current_puzzle_index,
      authority_row.answers
    );
    if authority_row.hard_mode
      and not brrrdle_private.phase55_ranked_daily_hard_mode_guess_is_valid(
        v_evidence,
        authority_row.current_puzzle_index,
        v_guess
      )
    then
      raise exception 'Ranked Daily guess violates Hard Mode.' using errcode = '22023';
    end if;

    v_attempt_limit := case when authority_row.mode = 'go'
      then 6 - authority_row.current_puzzle_index
      else 6
    end;
    select count(*)::integer into v_player_attempts
    from brrrdle_private.ranked_daily_action_ledger action
    where action.game_id = p_game_id
      and action.action_type = 'guess'
      and action.player_id = v_player_id
      and action.puzzle_index = authority_row.current_puzzle_index;
    if v_player_attempts >= v_attempt_limit then
      raise exception 'Ranked Daily participant has no attempts remaining.' using errcode = '22023';
    end if;

    v_solved := v_guess = v_answer;
    insert into brrrdle_private.ranked_daily_action_ledger (
      game_id,
      sequence_no,
      action_id,
      action_type,
      player_user_id,
      player_id,
      puzzle_index,
      guess,
      tiles,
      created_at
    ) values (
      p_game_id,
      v_next_version,
      p_action_id,
      'guess',
      v_user_id,
      v_player_id,
      authority_row.current_puzzle_index,
      v_guess,
      v_expected_tiles,
      v_created_at
    );
    v_next_move_count := authority_row.move_count + 1;
    v_player_attempts := v_player_attempts + 1;
    select count(*)::integer into v_other_attempts
    from brrrdle_private.ranked_daily_action_ledger action
    where action.game_id = p_game_id
      and action.action_type = 'guess'
      and action.player_id = v_other_player_id
      and action.puzzle_index = authority_row.current_puzzle_index;

    if authority_row.mode = 'og' and v_solved then
      v_terminal_status := 'completed';
      v_projection_status := 'won';
      v_winner_player_id := v_player_id;
    elsif authority_row.mode = 'go'
      and v_solved
      and authority_row.current_puzzle_index = 4
    then
      v_terminal_status := 'completed';
      v_projection_status := 'won';
    elsif authority_row.mode = 'go' and v_solved then
      v_next_puzzle_index := authority_row.current_puzzle_index + 1;
      v_next_turn := v_other_player_id;
      v_projection_status := 'playing';
    elsif v_player_attempts >= v_attempt_limit and v_other_attempts >= v_attempt_limit then
      v_terminal_status := 'completed';
      v_projection_status := case when authority_row.mode = 'og' then 'lost' else 'won' end;
    elsif v_player_attempts >= v_attempt_limit then
      v_next_turn := v_other_player_id;
      v_projection_status := 'playing';
    elsif v_other_attempts >= v_attempt_limit then
      v_next_turn := v_player_id;
      v_projection_status := 'playing';
    else
      v_next_turn := v_other_player_id;
      v_projection_status := 'playing';
    end if;

    if v_terminal_status = 'completed' and v_winner_player_id is null then
      v_ledger_moves := brrrdle_private.phase55_ranked_daily_ledger_moves(p_game_id);
      v_left_points := public.phase55_ranked_daily_player_points(
        v_ledger_moves,
        'player-one',
        authority_row.hard_mode
      );
      v_right_points := public.phase55_ranked_daily_player_points(
        v_ledger_moves,
        'player-two',
        authority_row.hard_mode
      );
      v_winner_player_id := case
        when v_left_points > v_right_points then 'player-one'
        when v_right_points > v_left_points then 'player-two'
        else null
      end;
    end if;
  end if;

  v_ledger_moves := brrrdle_private.phase55_ranked_daily_ledger_moves(p_game_id);
  v_updated_projection := v_game.projection
    - 'winnerId'
    - 'forfeitedPlayerId'
    - 'timedOutPlayerId'
    - 'endedAt';
  v_updated_projection := v_updated_projection
    || jsonb_build_object(
      'moves', v_ledger_moves,
      'status', v_projection_status,
      'currentTurn', v_next_turn,
      'updatedAt', v_created_at,
      'authorityVersion', v_next_version
    );
  if v_terminal_status <> 'playing' then
    v_updated_projection := v_updated_projection
      || jsonb_build_object('endedAt', v_created_at);
  end if;
  if v_winner_player_id is not null then
    v_updated_projection := v_updated_projection
      || jsonb_build_object('winnerId', v_winner_player_id);
  end if;
  if v_forfeited_player_id is not null then
    v_updated_projection := v_updated_projection
      || jsonb_build_object('forfeitedPlayerId', v_forfeited_player_id);
  end if;

  update brrrdle_private.ranked_daily_game_authority authority
  set
    current_turn = v_next_turn,
    current_puzzle_index = v_next_puzzle_index,
    version = v_next_version,
    move_count = v_next_move_count,
    terminal_status = v_terminal_status,
    winner_player_id = v_winner_player_id,
    forfeited_player_id = v_forfeited_player_id,
    ended_at = case when v_terminal_status <> 'playing' then v_created_at else null end,
    updated_at = v_created_at
  where authority.game_id = p_game_id;

  update public.async_multiplayer_games game_row
  set
    status = v_projection_status,
    current_turn = v_next_turn,
    winner_player_id = v_winner_player_id,
    ended_at = case when v_terminal_status <> 'playing' then v_created_at else null end,
    projection = v_updated_projection,
    updated_at = v_created_at
  where game_row.id = p_game_id;

  if v_action_type = 'cancel' then
    update public.multiplayer_matchmaking_queue queue_row
    set status = 'cancelled'
    where queue_row.id in (v_reservation.request_one_id, v_reservation.request_two_id)
      and queue_row.status = 'matched';
    perform public.release_daily_multiplayer_claim(
      authority_row.player_one_user_id::text,
      'async',
      authority_row.mode,
      authority_row.daily_date_key,
      'async_game',
      p_game_id,
      true
    );
    perform public.release_daily_multiplayer_claim(
      authority_row.player_two_user_id::text,
      'async',
      authority_row.mode,
      authority_row.daily_date_key,
      'async_game',
      p_game_id,
      true
    );
  end if;

  return query select v_updated_projection;
end;
$$;

create or replace function public.settle_ranked_async_multiplayer_match_v2(
  p_game_id text,
  p_idempotency_key text default null
)
returns table (
  match_result_id text,
  bucket text,
  user_id uuid,
  opponent_user_id uuid,
  outcome text,
  old_rating integer,
  new_rating integer,
  rating_delta integer,
  expected_score numeric,
  idempotent boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_game public.async_multiplayer_games%rowtype;
  authority_row brrrdle_private.ranked_daily_game_authority%rowtype;
  v_reservation brrrdle_private.ranked_daily_pair_reservations%rowtype;
  v_bucket text;
  v_expected_idempotency_key text;
  v_existing_result_id text;
  v_hard_mode boolean := false;
  v_left_attempts integer := 0;
  v_left_delta integer;
  v_left_expected numeric;
  v_left_k integer;
  v_left_new_games integer;
  v_left_new_provisional boolean;
  v_left_new_rating integer;
  v_left_outcome text;
  v_left_profile public.multiplayer_rating_profiles%rowtype;
  v_left_puzzles integer := 0;
  v_left_score numeric;
  v_left_user_id uuid;
  v_match_result_id text;
  v_moves jsonb := '[]'::jsonb;
  v_right_attempts integer := 0;
  v_right_delta integer;
  v_right_expected numeric;
  v_right_k integer;
  v_right_new_games integer;
  v_right_new_provisional boolean;
  v_right_new_rating integer;
  v_right_outcome text;
  v_right_profile public.multiplayer_rating_profiles%rowtype;
  v_right_puzzles integer := 0;
  v_right_score numeric;
  v_right_user_id uuid;
  v_winner_player text;
  v_winner_user_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;
  if p_game_id is null or p_game_id = '' then
    raise exception 'Ranked settlement requires a game id.' using errcode = '22023';
  end if;

  select * into v_game
  from public.async_multiplayer_games game_row
  where game_row.id = p_game_id;
  if not found then
    raise exception 'Ranked game not found.' using errcode = 'P0002';
  end if;

  if v_game.scope = 'practice' then
    return query select * from public.settle_ranked_async_multiplayer_match(p_game_id, p_idempotency_key);
    return;
  end if;

  -- Use the same lock order as the action RPC: reservation, authority, public
  -- projection, then rating profiles ordered by user id.
  select * into v_reservation
  from brrrdle_private.ranked_daily_pair_reservations reservation
  where reservation.game_id = p_game_id
  for update;
  if not found then
    raise exception 'Ranked Daily reservation was not found.' using errcode = 'P0002';
  end if;
  select * into authority_row
  from brrrdle_private.ranked_daily_game_authority authority
  where authority.game_id = p_game_id
  for update;
  if not found then
    raise exception 'Ranked Daily authority was not found.' using errcode = 'P0002';
  end if;
  select * into v_game
  from public.async_multiplayer_games game_row
  where game_row.id = p_game_id
  for update;

  if v_user_id is distinct from v_game.host_user_id
    and v_user_id is distinct from v_game.player_one_user_id
    and v_user_id is distinct from v_game.player_two_user_id
  then
    raise exception 'Only ranked match participants can settle this match.' using errcode = '42501';
  end if;

  v_left_user_id := v_game.player_one_user_id;
  v_right_user_id := v_game.player_two_user_id;
  v_bucket := public.phase55_ranked_storage_bucket('daily', v_game.mode, null);

  if v_game.ranked is distinct from true
    or v_game.scope <> 'daily'
    or v_game.daily_date_key is null
    or v_game.daily_date_key !~ '^\d{4}-\d{2}-\d{2}$'
    or v_game.word_length <> 5
    or v_game.rating_bucket is distinct from v_bucket
    or v_game.custom_game_code is not null
    or nullif(v_game.projection ->> 'timeLimitMs', '') is not null
    or v_game.projection ->> 'dailyDateKey' is distinct from v_game.daily_date_key
    or authority_row.daily_date_key is distinct from v_game.daily_date_key
    or authority_row.mode is distinct from v_game.mode
    or authority_row.player_one_user_id is distinct from v_game.player_one_user_id
    or authority_row.player_two_user_id is distinct from v_game.player_two_user_id
    or authority_row.go_puzzle_count is distinct from v_game.go_puzzle_count
    or authority_row.winner_player_id is distinct from v_game.winner_player_id
    or authority_row.ended_at is distinct from v_game.ended_at
    or authority_row.move_count <> (
      select count(*)::integer
      from brrrdle_private.ranked_daily_action_ledger action
      where action.game_id = p_game_id and action.action_type = 'guess'
    )
    or authority_row.version <> (
      select count(*)::integer
      from brrrdle_private.ranked_daily_action_ledger action
      where action.game_id = p_game_id
    )
  then
    raise exception 'Ranked Daily settlement evidence is invalid.' using errcode = '22023';
  end if;
  if v_left_user_id is null or v_right_user_id is null or v_left_user_id = v_right_user_id then
    raise exception 'Ranked settlement requires two distinct participant users.' using errcode = '22023';
  end if;
  if authority_row.terminal_status <> 'completed' then
    raise exception 'Ranked settlement requires a server-authorized terminal result.' using errcode = '22023';
  end if;
  v_hard_mode := authority_row.hard_mode;

  if v_reservation.player_one_user_id is distinct from v_left_user_id
    or v_reservation.player_two_user_id is distinct from v_right_user_id
    or v_reservation.daily_date_key is distinct from v_game.daily_date_key
    or v_reservation.mode is distinct from v_game.mode
    or v_reservation.hard_mode is distinct from v_hard_mode
    or v_reservation.rating_bucket is distinct from v_bucket
    or v_reservation.finalized_at is null
  then
    raise exception 'Ranked Daily settlement requires a matched queue reservation.' using errcode = '42501';
  end if;

  v_expected_idempotency_key := 'phase55-ranked-daily-v1:async:' || v_game.id || ':' || v_bucket;
  if nullif(p_idempotency_key, '') is not null and p_idempotency_key <> v_expected_idempotency_key then
    raise exception 'Ranked Daily settlement idempotency key is invalid.' using errcode = '22023';
  end if;

  select result_row.id into v_existing_result_id
  from public.multiplayer_match_results result_row
  where result_row.idempotency_key = v_expected_idempotency_key;
  if v_existing_result_id is not null then
    return query
    select
      tx.match_result_id,
      tx.bucket,
      tx.user_id,
      tx.opponent_user_id,
      tx.outcome,
      tx.old_rating,
      tx.new_rating,
      tx.rating_delta,
      tx.expected_score,
      true
    from public.multiplayer_rating_transactions tx
    where tx.match_result_id = v_existing_result_id
    order by tx.user_id;
    return;
  end if;

  v_moves := brrrdle_private.phase55_ranked_daily_ledger_moves(p_game_id);
  v_winner_player := authority_row.winner_player_id;

  v_winner_user_id := case v_winner_player
    when 'player-one' then v_left_user_id
    when 'player-two' then v_right_user_id
    else null
  end;
  if v_winner_user_id is null then
    v_left_outcome := 'draw';
    v_right_outcome := 'draw';
    v_left_score := 0.5;
    v_right_score := 0.5;
  elsif v_winner_user_id = v_left_user_id then
    v_left_outcome := 'win';
    v_right_outcome := 'loss';
    v_left_score := 1;
    v_right_score := 0;
  else
    v_left_outcome := 'loss';
    v_right_outcome := 'win';
    v_left_score := 0;
    v_right_score := 1;
  end if;

  select count(*)::integer into v_left_attempts
  from jsonb_array_elements(v_moves) as move(move_value)
  where move.move_value ->> 'playerId' = 'player-one';
  select count(*)::integer into v_right_attempts
  from jsonb_array_elements(v_moves) as move(move_value)
  where move.move_value ->> 'playerId' = 'player-two';

  select count(distinct (
    case when coalesce(move.move_value ->> 'puzzleIndex', '0') ~ '^[0-9]+$'
      then (coalesce(move.move_value ->> 'puzzleIndex', '0'))::integer
      else 0
    end
  ))::integer into v_left_puzzles
  from jsonb_array_elements(v_moves) as move(move_value)
  where move.move_value ->> 'playerId' = 'player-one'
    and exists (
      select 1 from jsonb_array_elements(
        case when jsonb_typeof(move.move_value -> 'tiles') = 'array' then move.move_value -> 'tiles' else '[]'::jsonb end
      ) tile(tile_value)
    )
    and not exists (
      select 1 from jsonb_array_elements(
        case when jsonb_typeof(move.move_value -> 'tiles') = 'array' then move.move_value -> 'tiles' else '[]'::jsonb end
      ) tile(tile_value)
      where tile.tile_value ->> 'state' <> 'correct'
    );

  select count(distinct (
    case when coalesce(move.move_value ->> 'puzzleIndex', '0') ~ '^[0-9]+$'
      then (coalesce(move.move_value ->> 'puzzleIndex', '0'))::integer
      else 0
    end
  ))::integer into v_right_puzzles
  from jsonb_array_elements(v_moves) as move(move_value)
  where move.move_value ->> 'playerId' = 'player-two'
    and exists (
      select 1 from jsonb_array_elements(
        case when jsonb_typeof(move.move_value -> 'tiles') = 'array' then move.move_value -> 'tiles' else '[]'::jsonb end
      ) tile(tile_value)
    )
    and not exists (
      select 1 from jsonb_array_elements(
        case when jsonb_typeof(move.move_value -> 'tiles') = 'array' then move.move_value -> 'tiles' else '[]'::jsonb end
      ) tile(tile_value)
      where tile.tile_value ->> 'state' <> 'correct'
    );

  insert into public.multiplayer_rating_profiles (user_id, bucket)
  values (v_left_user_id, v_bucket), (v_right_user_id, v_bucket)
  on conflict on constraint multiplayer_rating_profiles_pkey do nothing;

  perform 1
  from public.multiplayer_rating_profiles profile
  where profile.bucket = v_bucket
    and profile.user_id in (v_left_user_id, v_right_user_id)
  order by profile.user_id
  for update;

  select * into v_left_profile
  from public.multiplayer_rating_profiles profile
  where profile.user_id = v_left_user_id and profile.bucket = v_bucket;
  select * into v_right_profile
  from public.multiplayer_rating_profiles profile
  where profile.user_id = v_right_user_id and profile.bucket = v_bucket;

  v_left_expected := public.phase27_expected_score(v_left_profile.rating, v_right_profile.rating);
  v_right_expected := public.phase27_expected_score(v_right_profile.rating, v_left_profile.rating);
  v_left_k := public.phase27_k_factor(v_left_profile.games_played);
  v_right_k := public.phase27_k_factor(v_right_profile.games_played);
  v_left_delta := round(v_left_k * (v_left_score - v_left_expected))::integer;
  v_right_delta := round(v_right_k * (v_right_score - v_right_expected))::integer;
  v_left_new_rating := v_left_profile.rating + v_left_delta;
  v_right_new_rating := v_right_profile.rating + v_right_delta;
  v_left_new_games := v_left_profile.games_played + 1;
  v_right_new_games := v_right_profile.games_played + 1;
  v_left_new_provisional := v_left_new_games < 10;
  v_right_new_provisional := v_right_new_games < 10;
  v_match_result_id := 'phase55-result-' || replace(replace(v_game.id, ':', '-'), '/', '-');

  insert into public.multiplayer_match_results (
    id,
    source_match_id,
    source_transport,
    mode,
    scope,
    daily_date_key,
    ranked,
    rating_bucket,
    terminal_status,
    winner_user_id,
    summary,
    idempotency_key,
    settlement_version,
    settlement_source
  ) values (
    v_match_result_id,
    v_game.id,
    'async',
    v_game.mode,
    'daily',
    v_game.daily_date_key,
    true,
    v_bucket,
    'completed',
    v_winner_user_id,
    'Phase 55 trusted ranked Daily settlement',
    v_expected_idempotency_key,
    'phase55-ranked-daily-v1',
    'trusted_rpc'
  );

  insert into public.multiplayer_player_results (
    match_result_id,
    user_id,
    player_id,
    outcome,
    attempts_used,
    puzzles_solved,
    completed_at,
    summary
  ) values
    (v_match_result_id, v_left_user_id, 'player-one', v_left_outcome, v_left_attempts, coalesce(v_left_puzzles, 0), coalesce(v_game.ended_at, now()), 'Trusted ranked Daily player-one result'),
    (v_match_result_id, v_right_user_id, 'player-two', v_right_outcome, v_right_attempts, coalesce(v_right_puzzles, 0), coalesce(v_game.ended_at, now()), 'Trusted ranked Daily player-two result');

  update public.multiplayer_rating_profiles profile set
    rating = v_left_new_rating,
    games_played = v_left_new_games,
    wins = profile.wins + case when v_left_outcome = 'win' then 1 else 0 end,
    losses = profile.losses + case when v_left_outcome = 'loss' then 1 else 0 end,
    draws = profile.draws + case when v_left_outcome = 'draw' then 1 else 0 end,
    provisional = v_left_new_provisional,
    updated_at = now()
  where profile.user_id = v_left_user_id and profile.bucket = v_bucket;

  update public.multiplayer_rating_profiles profile set
    rating = v_right_new_rating,
    games_played = v_right_new_games,
    wins = profile.wins + case when v_right_outcome = 'win' then 1 else 0 end,
    losses = profile.losses + case when v_right_outcome = 'loss' then 1 else 0 end,
    draws = profile.draws + case when v_right_outcome = 'draw' then 1 else 0 end,
    provisional = v_right_new_provisional,
    updated_at = now()
  where profile.user_id = v_right_user_id and profile.bucket = v_bucket;

  insert into public.multiplayer_rating_transactions (
    match_result_id,
    bucket,
    user_id,
    opponent_user_id,
    outcome,
    old_rating,
    new_rating,
    rating_delta,
    expected_score,
    idempotency_key,
    old_games_played,
    new_games_played,
    old_provisional,
    new_provisional,
    k_factor,
    settlement_version
  ) values
    (
      v_match_result_id, v_bucket, v_left_user_id, v_right_user_id, v_left_outcome,
      v_left_profile.rating, v_left_new_rating, v_left_delta, v_left_expected,
      v_expected_idempotency_key || ':' || v_left_user_id::text,
      v_left_profile.games_played, v_left_new_games, v_left_profile.provisional,
      v_left_new_provisional, v_left_k, 'phase55-ranked-daily-v1'
    ),
    (
      v_match_result_id, v_bucket, v_right_user_id, v_left_user_id, v_right_outcome,
      v_right_profile.rating, v_right_new_rating, v_right_delta, v_right_expected,
      v_expected_idempotency_key || ':' || v_right_user_id::text,
      v_right_profile.games_played, v_right_new_games, v_right_profile.provisional,
      v_right_new_provisional, v_right_k, 'phase55-ranked-daily-v1'
    );

  return query
  select
    tx.match_result_id,
    tx.bucket,
    tx.user_id,
    tx.opponent_user_id,
    tx.outcome,
    tx.old_rating,
    tx.new_rating,
    tx.rating_delta,
    tx.expected_score,
    false
  from public.multiplayer_rating_transactions tx
  where tx.match_result_id = v_match_result_id
  order by tx.user_id;
end;
$$;

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

  v_storage_bucket := case v_bucket
    when 'multiplayer:og' then 'async:og'
    when 'multiplayer:go' then 'async:go'
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
        when 'async:og' then 'multiplayer:og'
        when 'async:go' then 'multiplayer:go'
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
        'async:og',
        'async:go',
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

comment on function public.claim_daily_multiplayer_participation(text, text, text, text, text, text, boolean)
  is 'Phase 55 internal ranked-aware Daily claim authority. Not browser-executable.';
comment on function public.claim_daily_multiplayer_participation(text, text, text, text, text, text)
  is 'Backward-compatible unranked-only Daily claim wrapper.';
comment on function public.release_daily_multiplayer_claim(text, text, text, text, text, text, boolean)
  is 'Phase 55 internal ranked-aware Daily claim release authority. Not browser-executable.';
comment on function public.release_daily_multiplayer_claim(text, text, text, text, text, text)
  is 'Backward-compatible unranked-only Daily claim release wrapper.';
comment on function public.create_ranked_async_matchmaking_request_v2(text, integer, boolean, text, text, text, integer, timestamptz)
  is 'Participant-owned ranked async queue creation for Practice or current-date fixed-settings Daily.';
comment on function public.claim_ranked_async_matchmaking_pair(text, text)
  is 'Claims the oldest compatible ranked async Practice or Daily opponent with FIFO row locking.';
comment on function public.get_ranked_async_matchmaking_status_v2(text)
  is 'Participant-owned ranked Practice or Daily queue status with deterministic seats and Daily date evidence.';
comment on function public.finalize_ranked_async_matchmaking_game_v2(text, text, jsonb, text)
  is 'Trusted ranked Practice delegation and ranked Daily finalization from a matched queue reservation.';
comment on function public.save_ranked_daily_async_multiplayer_action(text, integer, integer, text, text, boolean)
  is 'Participant-scoped idempotent ranked Daily guess/forfeit action backed by private server authority and an immutable action ledger.';
comment on function public.settle_ranked_async_multiplayer_match_v2(text, text)
  is 'Trusted ranked Practice delegation and ranked Daily settlement from private server-authorized terminal evidence.';
comment on function public.get_public_ranked_leaderboard(text, integer, integer)
  is 'Authenticated public-safe ranked Practice and ranked Daily leaderboard projection.';

revoke all on function public.phase55_ranked_storage_bucket(text, text, integer) from public;
revoke all on function public.phase55_ranked_storage_bucket(text, text, integer) from anon;
revoke all on function public.phase55_ranked_storage_bucket(text, text, integer) from authenticated;
revoke all on function public.phase55_ranked_app_bucket(text) from public;
revoke all on function public.phase55_ranked_app_bucket(text) from anon;
revoke all on function public.phase55_ranked_app_bucket(text) from authenticated;
revoke all on function public.phase55_ranked_queue_settings_are_valid(text, text, text, integer, text, integer) from public;
revoke all on function public.phase55_ranked_queue_settings_are_valid(text, text, text, integer, text, integer) from anon;
revoke all on function public.phase55_ranked_queue_settings_are_valid(text, text, text, integer, text, integer) from authenticated;
revoke all on function public.phase55_ranked_daily_lane_lock_key(uuid, text, text) from public;
revoke all on function public.phase55_ranked_daily_lane_lock_key(uuid, text, text) from anon;
revoke all on function public.phase55_ranked_daily_lane_lock_key(uuid, text, text) from authenticated;
revoke all on function public.phase55_ranked_daily_tiles(text, text) from public;
revoke all on function public.phase55_ranked_daily_tiles(text, text) from anon;
revoke all on function public.phase55_ranked_daily_tiles(text, text) from authenticated;
revoke all on function public.phase55_ranked_daily_hard_mode_guess_is_valid(jsonb, integer, text) from public;
revoke all on function public.phase55_ranked_daily_hard_mode_guess_is_valid(jsonb, integer, text) from anon;
revoke all on function public.phase55_ranked_daily_hard_mode_guess_is_valid(jsonb, integer, text) from authenticated;
revoke all on function public.phase55_ranked_daily_session_answers(jsonb, text) from public;
revoke all on function public.phase55_ranked_daily_session_answers(jsonb, text) from anon;
revoke all on function public.phase55_ranked_daily_session_answers(jsonb, text) from authenticated;
revoke all on function public.phase55_ranked_daily_player_points(jsonb, text, boolean) from public;
revoke all on function public.phase55_ranked_daily_player_points(jsonb, text, boolean) from anon;
revoke all on function public.phase55_ranked_daily_player_points(jsonb, text, boolean) from authenticated;

revoke all on function public.claim_daily_multiplayer_participation(text, text, text, text, text, text, boolean) from public;
revoke all on function public.claim_daily_multiplayer_participation(text, text, text, text, text, text, boolean) from anon;
revoke all on function public.claim_daily_multiplayer_participation(text, text, text, text, text, text, boolean) from authenticated;
revoke all on function public.claim_daily_multiplayer_participation(text, text, text, text, text, text) from public;
revoke all on function public.claim_daily_multiplayer_participation(text, text, text, text, text, text) from anon;
revoke all on function public.claim_daily_multiplayer_participation(text, text, text, text, text, text) from authenticated;
grant execute on function public.claim_daily_multiplayer_participation(text, text, text, text, text, text) to authenticated;

revoke all on function public.release_daily_multiplayer_claim(text, text, text, text, text, text, boolean) from public;
revoke all on function public.release_daily_multiplayer_claim(text, text, text, text, text, text, boolean) from anon;
revoke all on function public.release_daily_multiplayer_claim(text, text, text, text, text, text, boolean) from authenticated;
revoke all on function public.release_daily_multiplayer_claim(text, text, text, text, text, text) from public;
revoke all on function public.release_daily_multiplayer_claim(text, text, text, text, text, text) from anon;
revoke all on function public.release_daily_multiplayer_claim(text, text, text, text, text, text) from authenticated;

revoke all on function public.enforce_async_daily_multiplayer_claim() from public;
revoke all on function public.enforce_async_daily_multiplayer_claim() from anon;
revoke all on function public.enforce_async_daily_multiplayer_claim() from authenticated;
revoke all on function public.enforce_live_lobby_daily_multiplayer_claim() from public;
revoke all on function public.enforce_live_lobby_daily_multiplayer_claim() from anon;
revoke all on function public.enforce_live_lobby_daily_multiplayer_claim() from authenticated;
revoke all on function public.enforce_live_match_daily_multiplayer_claim() from public;
revoke all on function public.enforce_live_match_daily_multiplayer_claim() from anon;
revoke all on function public.enforce_live_match_daily_multiplayer_claim() from authenticated;

revoke all on function public.create_ranked_async_matchmaking_request_v2(text, integer, boolean, text, text, text, integer, timestamptz) from public;
revoke all on function public.create_ranked_async_matchmaking_request_v2(text, integer, boolean, text, text, text, integer, timestamptz) from anon;
revoke all on function public.create_ranked_async_matchmaking_request_v2(text, integer, boolean, text, text, text, integer, timestamptz) from authenticated;
revoke all on function public.claim_ranked_async_matchmaking_pair(text, text) from public;
revoke all on function public.claim_ranked_async_matchmaking_pair(text, text) from anon;
revoke all on function public.claim_ranked_async_matchmaking_pair(text, text) from authenticated;
revoke all on function public.get_ranked_async_matchmaking_status_v2(text) from public;
revoke all on function public.get_ranked_async_matchmaking_status_v2(text) from anon;
revoke all on function public.get_ranked_async_matchmaking_status_v2(text) from authenticated;
revoke all on function public.finalize_ranked_async_matchmaking_game_v2(text, text, jsonb, text) from public;
revoke all on function public.finalize_ranked_async_matchmaking_game_v2(text, text, jsonb, text) from anon;
revoke all on function public.finalize_ranked_async_matchmaking_game_v2(text, text, jsonb, text) from authenticated;
revoke all on function public.save_ranked_daily_async_multiplayer_action(text, integer, integer, text, text, boolean) from public;
revoke all on function public.save_ranked_daily_async_multiplayer_action(text, integer, integer, text, text, boolean) from anon;
revoke all on function public.save_ranked_daily_async_multiplayer_action(text, integer, integer, text, text, boolean) from authenticated;
revoke all on function public.settle_ranked_async_multiplayer_match_v2(text, text) from public;
revoke all on function public.settle_ranked_async_multiplayer_match_v2(text, text) from anon;
revoke all on function public.settle_ranked_async_multiplayer_match_v2(text, text) from authenticated;
revoke all on function public.get_public_ranked_leaderboard(text, integer, integer) from public;
revoke all on function public.get_public_ranked_leaderboard(text, integer, integer) from anon;
revoke all on function public.get_public_ranked_leaderboard(text, integer, integer) from authenticated;

revoke all on all functions in schema brrrdle_private from public, anon, authenticated;
revoke all on all tables in schema brrrdle_private from public, anon, authenticated;

grant execute on function public.create_ranked_async_matchmaking_request_v2(text, integer, boolean, text, text, text, integer, timestamptz) to authenticated;
grant execute on function public.claim_ranked_async_matchmaking_pair(text, text) to authenticated;
grant execute on function public.get_ranked_async_matchmaking_status_v2(text) to authenticated;
grant execute on function public.finalize_ranked_async_matchmaking_game_v2(text, text, jsonb, text) to authenticated;
grant execute on function public.save_ranked_daily_async_multiplayer_action(text, integer, integer, text, text, boolean) to authenticated;
grant execute on function public.settle_ranked_async_multiplayer_match_v2(text, text) to authenticated;
grant execute on function public.get_public_ranked_leaderboard(text, integer, integer) to authenticated;

alter table public.multiplayer_daily_claims enable row level security;
grant select on table public.multiplayer_daily_claims to authenticated;
revoke insert, update, delete on table public.multiplayer_daily_claims from authenticated;
grant select on table public.multiplayer_matchmaking_queue to authenticated;
revoke insert, update, delete on table public.multiplayer_matchmaking_queue from authenticated;

drop policy if exists "Users can read compatible queued requests" on public.multiplayer_matchmaking_queue;
drop policy if exists "Users can read own matchmaking requests" on public.multiplayer_matchmaking_queue;
create policy "Users can read own matchmaking requests"
  on public.multiplayer_matchmaking_queue for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create own async games" on public.async_multiplayer_games;
drop policy if exists "Users can create non-ranked-Daily async games" on public.async_multiplayer_games;
create policy "Users can create non-ranked-Daily async games"
  on public.async_multiplayer_games for insert
  to authenticated
  with check (
    (select auth.uid()) = host_user_id
    and (player_one_user_id is null or player_one_user_id = (select auth.uid()))
    and player_two_user_id is null
    and not (ranked = true and scope = 'daily')
  );

drop policy if exists "Async participants can update their games" on public.async_multiplayer_games;
drop policy if exists "Async participants can update non-ranked-Daily games" on public.async_multiplayer_games;
create policy "Async participants can update non-ranked-Daily games"
  on public.async_multiplayer_games for update
  to authenticated
  using (
    not (ranked = true and scope = 'daily')
    and (
      host_user_id = (select auth.uid())
      or player_one_user_id = (select auth.uid())
      or player_two_user_id = (select auth.uid())
      or status = 'waiting'
    )
  )
  with check (
    not (ranked = true and scope = 'daily')
    and (
      host_user_id = (select auth.uid())
      or player_one_user_id = (select auth.uid())
      or player_two_user_id = (select auth.uid())
    )
  );

-- Rollback notes:
-- 1. Stop new ranked Daily traffic and verify no ranked Daily queue/game/result
--    rows remain before removing v2 RPCs or Daily rating buckets.
-- 2. The claim primary key cannot be narrowed safely while any ranked=true
--    claim exists. Preserve all unranked rows and restore the old key only
--    after ranked rows are archived by a separately reviewed operation.
-- 3. Restore the Phase 50 Practice-only claim function only after v2 clients
--    are retired. Never delete or coalesce an existing unranked claim.
-- 4. Do not drop `brrrdle_private` authority/catalog/ledger objects while any
--    ranked Daily result, game, claim, queue reservation, or rating evidence
--    depends on them. Any archive/removal requires a separate reviewed plan.

-- Remote probes (run only after separate authorization):
-- - compare migration ledgers and verify this exact filename is the sole delta;
-- - inspect claim PK/column defaults and prove legacy rows remain ranked=false;
-- - fingerprint all v2/action functions, owners, empty search paths, and ACLs;
-- - verify catalog counts/order/digests and multi-date answer parity without
--   printing answers; prove the `brrrdle_private` schema is browser-inaccessible;
-- - prove direct ranked Daily writes and forged/stale/out-of-turn actions fail;
-- - prove action retry idempotency, GO prefill attempts/Hard Mode, ledger-only
--   settlement, deterministic locks, one pair reservation, and answerless load;
-- - create temporary users to prove four claim lanes, FIFO, queue isolation,
--   ranked Practice/unranked Daily preservation, leaderboard allowlists, and
--   complete remote/local cleanup.
