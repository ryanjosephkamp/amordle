-- Amordle authoritative Ranked Practice and unranked Daily COMBAT v2.
--
-- Version-zero rows and RPCs remain available to the accepted shell. Amordle
-- version-two rows are readable and mutable only through the narrow RPCs in
-- this migration. Hidden answers, seeds, raw participant identifiers, clocks,
-- and the accepted-action ledger stay in brrrdle_private.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists brrrdle_private;
revoke all on schema brrrdle_private from public, anon, authenticated;

alter table public.async_multiplayer_games
  add column if not exists authority_version integer not null default 0,
  add column if not exists source_kind text not null default 'legacy',
  add column if not exists visibility_kind text not null default 'restricted',
  add column if not exists state_version integer not null default 0,
  add column if not exists move_count integer not null default 0;

alter table public.async_multiplayer_games
  drop constraint if exists async_multiplayer_games_authority_version_check;
alter table public.async_multiplayer_games
  add constraint async_multiplayer_games_authority_version_check
  check (authority_version in (0, 2));
alter table public.async_multiplayer_games
  drop constraint if exists async_multiplayer_games_source_kind_check;
alter table public.async_multiplayer_games
  add constraint async_multiplayer_games_source_kind_check
  check (source_kind in (
    'legacy',
    'public_lobby',
    'ranked_queue',
    'daily_lobby',
    'private_request',
    'rematch'
  ));
alter table public.async_multiplayer_games
  drop constraint if exists async_multiplayer_games_visibility_kind_check;
alter table public.async_multiplayer_games
  add constraint async_multiplayer_games_visibility_kind_check
  check (visibility_kind in ('public', 'restricted'));
alter table public.async_multiplayer_games
  drop constraint if exists async_multiplayer_games_state_version_check;
alter table public.async_multiplayer_games
  add constraint async_multiplayer_games_state_version_check
  check (state_version >= 0 and move_count >= 0);

alter table public.multiplayer_matchmaking_queue
  add column if not exists difficulty text,
  add column if not exists go_puzzle_count integer,
  add column if not exists authority_version integer not null default 0;

alter table public.multiplayer_matchmaking_queue
  drop constraint if exists multiplayer_matchmaking_queue_amordle_difficulty_check;
alter table public.multiplayer_matchmaking_queue
  add constraint multiplayer_matchmaking_queue_amordle_difficulty_check
  check (difficulty is null or difficulty in ('casual', 'standard', 'expert'));
alter table public.multiplayer_matchmaking_queue
  drop constraint if exists multiplayer_matchmaking_queue_amordle_go_count_check;
alter table public.multiplayer_matchmaking_queue
  add constraint multiplayer_matchmaking_queue_amordle_go_count_check
  check (go_puzzle_count is null or go_puzzle_count in (5, 7, 10));
alter table public.multiplayer_matchmaking_queue
  drop constraint if exists multiplayer_matchmaking_queue_amordle_authority_check;
alter table public.multiplayer_matchmaking_queue
  add constraint multiplayer_matchmaking_queue_amordle_authority_check
  check (authority_version in (0, 2));

-- Authoritative rating buckets are isolated from participant-writable legacy
-- settlement. Existing ratings seed the new buckets once; later legacy writes
-- cannot modify them.
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
      'async:go:daily:v1'::text,
      'async:og:amordle:v2'::text,
      'async:go:amordle:v2'::text,
      'async:og:timed:amordle:v2'::text,
      'async:go:timed:amordle:v2'::text
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
      'async:go:daily:v1'::text,
      'async:og:amordle:v2'::text,
      'async:go:amordle:v2'::text,
      'async:og:timed:amordle:v2'::text,
      'async:go:timed:amordle:v2'::text
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
      'async:go:daily:v1'::text,
      'async:og:amordle:v2'::text,
      'async:go:amordle:v2'::text,
      'async:og:timed:amordle:v2'::text,
      'async:go:timed:amordle:v2'::text
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
      'async:go:daily:v1'::text,
      'async:og:amordle:v2'::text,
      'async:go:amordle:v2'::text,
      'async:og:timed:amordle:v2'::text,
      'async:go:timed:amordle:v2'::text
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
      'async:go:daily:v1'::text,
      'async:og:amordle:v2'::text,
      'async:go:amordle:v2'::text,
      'async:og:timed:amordle:v2'::text,
      'async:go:timed:amordle:v2'::text
    ]));
end $$;

insert into public.multiplayer_rating_profiles (
  user_id,
  bucket,
  rating,
  games_played,
  wins,
  losses,
  draws,
  provisional,
  updated_at
)
select
  legacy.user_id,
  case legacy.bucket
    when 'async:og' then 'async:og:amordle:v2'
    when 'async:go' then 'async:go:amordle:v2'
    when 'async:og:timed:v1' then 'async:og:timed:amordle:v2'
    when 'async:go:timed:v1' then 'async:go:timed:amordle:v2'
  end,
  legacy.rating,
  legacy.games_played,
  legacy.wins,
  legacy.losses,
  legacy.draws,
  legacy.provisional,
  legacy.updated_at
from public.multiplayer_rating_profiles legacy
where legacy.bucket in (
  'async:og',
  'async:go',
  'async:og:timed:v1',
  'async:go:timed:v1'
)
on conflict (user_id, bucket) do nothing;

create table if not exists brrrdle_private.amordle_ranked_practice_reservations (
  game_id text primary key,
  request_one_id text not null unique references public.multiplayer_matchmaking_queue(id),
  request_two_id text not null unique references public.multiplayer_matchmaking_queue(id),
  player_one_user_id uuid not null references auth.users(id) on delete cascade,
  player_two_user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('og', 'go')),
  word_length integer not null check (word_length between 2 and 35),
  difficulty text not null check (difficulty in ('casual', 'standard', 'expert')),
  hard_mode boolean not null,
  go_puzzle_count integer,
  time_limit_ms integer,
  rating_bucket text not null,
  matched_at timestamptz not null default now(),
  finalized_at timestamptz,
  check (request_one_id <> request_two_id),
  check (player_one_user_id <> player_two_user_id),
  check (
    (mode = 'og' and go_puzzle_count is null)
    or (mode = 'go' and go_puzzle_count in (5, 7, 10))
  ),
  check (time_limit_ms is null or time_limit_ms = 300000)
);

create table if not exists brrrdle_private.amordle_combat_authority (
  game_id text primary key references public.async_multiplayer_games(id) on delete cascade,
  creation_key text not null unique,
  source_kind text not null check (source_kind in ('ranked_queue', 'daily_lobby')),
  visibility_kind text not null check (visibility_kind in ('public', 'restricted')),
  scope text not null check (scope in ('practice', 'daily')),
  mode text not null check (mode in ('og', 'go')),
  word_length integer not null check (word_length between 2 and 35),
  difficulty text not null check (difficulty in ('casual', 'standard', 'expert')),
  hard_mode boolean not null,
  go_puzzle_count integer,
  time_limit_ms integer,
  ranked boolean not null,
  rating_bucket text,
  catalog_revision text not null,
  answers text[] not null,
  player_one_user_id uuid not null references auth.users(id) on delete cascade,
  player_two_user_id uuid references auth.users(id) on delete cascade,
  status text not null check (status in ('waiting', 'playing', 'holding', 'completed', 'cancelled')),
  current_turn text not null check (current_turn in ('player-one', 'player-two')),
  current_puzzle_index integer not null default 0 check (current_puzzle_index >= 0),
  hold_until timestamptz,
  player_one_time_remaining_ms integer,
  player_two_time_remaining_ms integer,
  turn_started_at timestamptz,
  version integer not null default 0 check (version >= 0),
  move_count integer not null default 0 check (move_count >= 0),
  terminal_reason text check (terminal_reason is null or terminal_reason in (
    'cancelled',
    'forfeit',
    'timeout',
    'solve',
    'points',
    'draw'
  )),
  winner_player_id text check (winner_player_id is null or winner_player_id in ('player-one', 'player-two')),
  forfeited_player_id text check (forfeited_player_id is null or forfeited_player_id in ('player-one', 'player-two')),
  timed_out_player_id text check (timed_out_player_id is null or timed_out_player_id in ('player-one', 'player-two')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  check (
    (mode = 'og' and go_puzzle_count is null and cardinality(answers) = 1)
    or (mode = 'go' and go_puzzle_count in (5, 7, 10) and cardinality(answers) = go_puzzle_count)
  ),
  check (array_position(answers, null) is null),
  check (player_two_user_id is null or player_one_user_id <> player_two_user_id),
  check (
    (time_limit_ms is null and player_one_time_remaining_ms is null and player_two_time_remaining_ms is null)
    or (
      time_limit_ms is not null
      and player_one_time_remaining_ms between 0 and time_limit_ms
      and player_two_time_remaining_ms between 0 and time_limit_ms
    )
  ),
  check (
    (status in ('waiting', 'playing') and hold_until is null and ended_at is null)
    or (status = 'holding' and hold_until is not null and ended_at is null)
    or (status in ('completed', 'cancelled') and ended_at is not null)
  )
);

create table if not exists brrrdle_private.amordle_combat_action_ledger (
  game_id text not null references brrrdle_private.amordle_combat_authority(game_id) on delete cascade,
  sequence_no integer not null check (sequence_no > 0),
  action_id text not null check (length(action_id) between 1 and 200),
  action_type text not null check (action_type in ('guess', 'cancel', 'forfeit', 'timeout', 'advance')),
  requested_command text check (requested_command is null or requested_command in ('guess', 'cancel', 'forfeit', 'advance')),
  requested_guess text,
  player_user_id uuid,
  player_id text check (player_id is null or player_id in ('player-one', 'player-two')),
  puzzle_index integer,
  guess text,
  tiles jsonb,
  points_awarded integer,
  clock_debit_ms integer,
  resulting_version integer not null check (resulting_version >= 0),
  resulting_move_count integer not null check (resulting_move_count >= 0),
  created_at timestamptz not null default now(),
  primary key (game_id, sequence_no),
  unique (game_id, action_id),
  check (
    (action_type = 'guess' and player_user_id is not null and player_id is not null
      and puzzle_index >= 0 and guess is not null and jsonb_typeof(tiles) = 'array')
    or (action_type in ('cancel', 'forfeit', 'timeout') and player_user_id is not null
      and player_id is not null and puzzle_index is null and guess is null and tiles is null)
    or (action_type = 'advance' and puzzle_index >= 0 and guess is null and tiles is null)
  )
);

alter table brrrdle_private.amordle_combat_action_ledger
  add column if not exists requested_command text,
  add column if not exists requested_guess text;
alter table brrrdle_private.amordle_combat_action_ledger
  drop constraint if exists amordle_combat_action_ledger_requested_command_check;
alter table brrrdle_private.amordle_combat_action_ledger
  add constraint amordle_combat_action_ledger_requested_command_check
  check (requested_command is null or requested_command in ('guess', 'cancel', 'forfeit', 'advance'));

create index if not exists amordle_authority_participant_one_idx
  on brrrdle_private.amordle_combat_authority (player_one_user_id, updated_at desc);
create index if not exists amordle_authority_participant_two_idx
  on brrrdle_private.amordle_combat_authority (player_two_user_id, updated_at desc);
create index if not exists amordle_authority_live_idx
  on brrrdle_private.amordle_combat_authority (visibility_kind, scope, status, updated_at desc);
create index if not exists amordle_action_game_puzzle_player_idx
  on brrrdle_private.amordle_combat_action_ledger (game_id, puzzle_index, player_id, sequence_no);
create index if not exists amordle_ranked_queue_v2_idx
  on public.multiplayer_matchmaking_queue (
    authority_version,
    transport,
    scope,
    mode,
    word_length,
    difficulty,
    hard_mode,
    go_puzzle_count,
    time_limit_ms,
    rating_bucket,
    status,
    queued_at,
    id
  )
  where authority_version = 2 and status = 'queued';

revoke all on all tables in schema brrrdle_private from public, anon, authenticated;

create or replace function brrrdle_private.amordle_storage_bucket(
  p_mode text,
  p_time_limit_ms integer
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when lower(coalesce(p_mode, '')) = 'og' and p_time_limit_ms is null
      then 'async:og:amordle:v2'
    when lower(coalesce(p_mode, '')) = 'go' and p_time_limit_ms is null
      then 'async:go:amordle:v2'
    when lower(coalesce(p_mode, '')) = 'og' and p_time_limit_ms = 300000
      then 'async:og:timed:amordle:v2'
    when lower(coalesce(p_mode, '')) = 'go' and p_time_limit_ms = 300000
      then 'async:go:timed:amordle:v2'
    else null
  end
$$;

create or replace function brrrdle_private.amordle_app_bucket(p_storage_bucket text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case coalesce(p_storage_bucket, '')
    when 'async:og:amordle:v2' then 'multiplayer:og'
    when 'async:go:amordle:v2' then 'multiplayer:go'
    when 'async:og:timed:amordle:v2' then 'multiplayer:og:timed:v1'
    when 'async:go:timed:amordle:v2' then 'multiplayer:go:timed:v1'
    else null
  end
$$;

create or replace function brrrdle_private.amordle_attempt_budget(p_puzzle_index integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(2, 6 - greatest(coalesce(p_puzzle_index, 0), 0))
$$;

create or replace function brrrdle_private.amordle_difficulty_answers(
  p_revision text,
  p_word_length integer,
  p_difficulty text
)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case lower(coalesce(p_difficulty, ''))
    when 'casual' then catalog.casual_answers
    when 'standard' then catalog.standard_answers
    when 'expert' then catalog.expert_answers
    else null
  end
  from brrrdle_private.amordle_word_catalogs catalog
  where catalog.revision = p_revision and catalog.word_length = p_word_length
$$;

create or replace function brrrdle_private.amordle_select_answers(
  p_revision text,
  p_word_length integer,
  p_difficulty text,
  p_count integer
)
returns text[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_pool text[];
  v_result text[];
begin
  v_pool := brrrdle_private.amordle_difficulty_answers(
    p_revision,
    p_word_length,
    p_difficulty
  );
  if v_pool is null or cardinality(v_pool) < p_count or p_count < 1 then
    raise exception 'CATALOG_UNAVAILABLE'
      using errcode = 'P0001', detail = 'CATALOG_UNAVAILABLE';
  end if;
  select array_agg(word order by random())
  into v_result
  from (
    select word
    from unnest(v_pool) word
    order by random()
    limit p_count
  ) selected;
  return v_result;
end;
$$;

create or replace function brrrdle_private.amordle_tiles(
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
  v_length integer := length(v_answer);
  v_states text[];
  v_remaining jsonb := '{}'::jsonb;
  v_index integer;
  v_letter text;
  v_count integer;
  v_tiles jsonb := '[]'::jsonb;
begin
  if v_length < 2 or v_length > 35 or length(v_guess) <> v_length
    or v_guess !~ '^[a-z]+$' or v_answer !~ '^[a-z]+$'
  then
    raise exception 'INVALID_GUESS' using errcode = '22023', detail = 'INVALID_GUESS';
  end if;
  v_states := array_fill('absent'::text, array[v_length]);
  for v_index in 1..v_length loop
    if substr(v_guess, v_index, 1) = substr(v_answer, v_index, 1) then
      v_states[v_index] := 'correct';
    else
      v_letter := substr(v_answer, v_index, 1);
      v_remaining := jsonb_set(
        v_remaining,
        array[v_letter],
        to_jsonb(coalesce((v_remaining ->> v_letter)::integer, 0) + 1),
        true
      );
    end if;
  end loop;
  for v_index in 1..v_length loop
    if v_states[v_index] = 'correct' then continue; end if;
    v_letter := substr(v_guess, v_index, 1);
    v_count := coalesce((v_remaining ->> v_letter)::integer, 0);
    if v_count > 0 then
      v_states[v_index] := 'present';
      v_remaining := jsonb_set(v_remaining, array[v_letter], to_jsonb(v_count - 1), true);
    end if;
  end loop;
  for v_index in 1..v_length loop
    v_tiles := v_tiles || jsonb_build_array(jsonb_build_object(
      'letter', upper(substr(v_guess, v_index, 1)),
      'state', v_states[v_index]
    ));
  end loop;
  return v_tiles;
end;
$$;

create or replace function brrrdle_private.amordle_action_points(
  p_tiles jsonb,
  p_solved boolean,
  p_unused_attempts integer,
  p_hard_mode boolean
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select coalesce(sum(case tile ->> 'state'
    when 'correct' then 5
    when 'present' then 2
    else 0
  end), 0)::integer
  + case when p_solved then 100 else 0 end
  + case when p_solved then greatest(coalesce(p_unused_attempts, 0), 0) * 10 else 0 end
  + case when p_solved and p_hard_mode then 15 else 0 end
  from jsonb_array_elements(coalesce(p_tiles, '[]'::jsonb)) tile
$$;

create or replace function brrrdle_private.amordle_hard_mode_guess_is_valid(
  p_game_id text,
  p_puzzle_index integer,
  p_guess text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_authority brrrdle_private.amordle_combat_authority%rowtype;
  v_answer text;
  v_rows jsonb := '[]'::jsonb;
  v_row jsonb;
  v_tile jsonb;
  v_index integer;
  v_letter text;
  v_state text;
  v_locks jsonb := '{}'::jsonb;
  v_required jsonb := '{}'::jsonb;
  v_positive_in_row jsonb;
  v_positive_seen jsonb := '{}'::jsonb;
  v_absent_seen jsonb := '{}'::jsonb;
  v_entry record;
begin
  select * into v_authority
  from brrrdle_private.amordle_combat_authority authority
  where authority.game_id = p_game_id;
  if not found or p_puzzle_index <> v_authority.current_puzzle_index then
    return false;
  end if;
  v_answer := v_authority.answers[p_puzzle_index + 1];

  if v_authority.mode = 'go' and p_puzzle_index > 0 then
    for v_index in 1..p_puzzle_index loop
      v_rows := v_rows || jsonb_build_array(
        brrrdle_private.amordle_tiles(v_authority.answers[v_index], v_answer)
      );
    end loop;
  end if;
  select v_rows || coalesce(jsonb_agg(action.tiles order by action.sequence_no), '[]'::jsonb)
  into v_rows
  from brrrdle_private.amordle_combat_action_ledger action
  where action.game_id = p_game_id
    and action.action_type = 'guess'
    and action.puzzle_index = p_puzzle_index;

  for v_row in select value from jsonb_array_elements(v_rows) value loop
    v_positive_in_row := '{}'::jsonb;
    v_index := 0;
    for v_tile in select value from jsonb_array_elements(v_row) value loop
      v_index := v_index + 1;
      v_letter := lower(v_tile ->> 'letter');
      v_state := v_tile ->> 'state';
      if v_state = 'correct' then
        v_locks := jsonb_set(v_locks, array[v_index::text], to_jsonb(v_letter), true);
      end if;
      if v_state in ('correct', 'present') then
        v_positive_seen := jsonb_set(v_positive_seen, array[v_letter], 'true'::jsonb, true);
        v_positive_in_row := jsonb_set(
          v_positive_in_row,
          array[v_letter],
          to_jsonb(coalesce((v_positive_in_row ->> v_letter)::integer, 0) + 1),
          true
        );
      elsif v_state = 'absent' then
        v_absent_seen := jsonb_set(v_absent_seen, array[v_letter], 'true'::jsonb, true);
      end if;
    end loop;
    for v_entry in select key, value from jsonb_each_text(v_positive_in_row) loop
      if v_entry.value::integer > coalesce((v_required ->> v_entry.key)::integer, 0) then
        v_required := jsonb_set(v_required, array[v_entry.key], to_jsonb(v_entry.value::integer), true);
      end if;
    end loop;
  end loop;

  for v_entry in select key, value from jsonb_each_text(v_locks) loop
    if substr(lower(p_guess), v_entry.key::integer, 1) <> v_entry.value then
      return false;
    end if;
  end loop;
  for v_entry in select key, value from jsonb_each_text(v_required) loop
    if length(lower(p_guess)) - length(replace(lower(p_guess), v_entry.key, '')) < v_entry.value::integer then
      return false;
    end if;
  end loop;
  for v_entry in select key from jsonb_each(v_absent_seen) loop
    if not (v_positive_seen ? v_entry.key) and position(v_entry.key in lower(p_guess)) > 0 then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function brrrdle_private.amordle_ledger_moves(p_game_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'sequenceNo', action.sequence_no,
    'actionId', action.action_id,
    'type', action.action_type,
    'seat', action.player_id,
    'puzzleIndex', action.puzzle_index,
    'guess', case when action.action_type = 'guess' then upper(action.guess) else null end,
    'tiles', action.tiles,
    'pointsAwarded', action.points_awarded,
    'createdAt', action.created_at
  )) order by action.sequence_no), '[]'::jsonb)
  from brrrdle_private.amordle_combat_action_ledger action
  where action.game_id = p_game_id
$$;

create or replace function brrrdle_private.amordle_seeded_rows(
  p_game_id text,
  p_puzzle_index integer
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when authority.mode <> 'go' or p_puzzle_index <= 0 then '[]'::jsonb
    else coalesce((
      select jsonb_agg(jsonb_build_object(
        'sourcePuzzleIndex', source_index - 1,
        'label', 'P' || source_index::text,
        'guess', upper(authority.answers[source_index]),
        'tiles', brrrdle_private.amordle_tiles(
          authority.answers[source_index],
          authority.answers[p_puzzle_index + 1]
        ),
        'consumesAttemptSlot', true,
        'countsAsPlayerGuess', false,
        'awardsPoints', false
      ) order by source_index)
      from generate_series(1, p_puzzle_index) source_index
    ), '[]'::jsonb)
  end
  from brrrdle_private.amordle_combat_authority authority
  where authority.game_id = p_game_id
$$;

create or replace function brrrdle_private.amordle_player_points(
  p_game_id text,
  p_player_id text
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(action.points_awarded), 0)::integer
  from brrrdle_private.amordle_combat_action_ledger action
  where action.game_id = p_game_id
    and action.player_id = p_player_id
    and action.action_type = 'guess'
$$;

create or replace function brrrdle_private.amordle_player_attempts(
  p_game_id text,
  p_player_id text,
  p_puzzle_index integer
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from brrrdle_private.amordle_combat_action_ledger action
  where action.game_id = p_game_id
    and action.player_id = p_player_id
    and action.action_type = 'guess'
    and action.puzzle_index = p_puzzle_index
$$;

create or replace function brrrdle_private.amordle_player_solved(
  p_game_id text,
  p_player_id text,
  p_puzzle_index integer
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from brrrdle_private.amordle_combat_action_ledger action
    where action.game_id = p_game_id
      and action.player_id = p_player_id
      and action.action_type = 'guess'
      and action.puzzle_index = p_puzzle_index
      and not exists (
        select 1
        from jsonb_array_elements(action.tiles) tile
        where tile ->> 'state' <> 'correct'
      )
  )
$$;

create or replace function brrrdle_private.amordle_participant_projection(
  p_game_id text,
  p_viewer_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_authority brrrdle_private.amordle_combat_authority%rowtype;
  v_viewer_seat text;
  v_players jsonb;
  v_left_attempts integer;
  v_right_attempts integer;
  v_left_solved integer;
  v_right_solved integer;
  v_daily_date_key text;
  v_projection jsonb;
begin
  select * into v_authority
  from brrrdle_private.amordle_combat_authority authority
  where authority.game_id = p_game_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002', detail = 'NOT_FOUND';
  end if;
  select public_game.daily_date_key
  into v_daily_date_key
  from public.async_multiplayer_games public_game
  where public_game.id = p_game_id
    and public_game.authority_version = 2;
  v_viewer_seat := case
    when p_viewer_id = v_authority.player_one_user_id then 'player-one'
    when p_viewer_id = v_authority.player_two_user_id then 'player-two'
    else null
  end;
  if v_viewer_seat is null then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'FORBIDDEN';
  end if;

  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'seat', seat.seat,
    'publicProfileId', profile.public_profile_id,
    'displayName', coalesce(nullif(profile.display_name, ''), initcap(replace(seat.seat, '-', ' '))),
    'avatarUrl', nullif(profile.avatar_url, ''),
    'accentColor', nullif(profile.accent_color, ''),
    'initials', nullif(upper(left(regexp_replace(coalesce(profile.display_name, ''), '[^[:alnum:]]', '', 'g'), 2)), '')
  )) order by seat.sort_order), '[]'::jsonb)
  into v_players
  from (
    values
      ('player-one'::text, 1, v_authority.player_one_user_id),
      ('player-two'::text, 2, v_authority.player_two_user_id)
  ) seat(seat, sort_order, user_id)
  left join public.public_player_profiles profile
    on profile.user_id = seat.user_id
    and profile.visibility = 'public'
    and profile.moderation_status = 'active'
  where seat.user_id is not null;

  v_left_attempts := brrrdle_private.amordle_player_attempts(
    p_game_id, 'player-one', v_authority.current_puzzle_index
  );
  v_right_attempts := brrrdle_private.amordle_player_attempts(
    p_game_id, 'player-two', v_authority.current_puzzle_index
  );
  select count(distinct action.puzzle_index)::integer
  into v_left_solved
  from brrrdle_private.amordle_combat_action_ledger action
  where action.game_id = p_game_id and action.player_id = 'player-one'
    and action.action_type = 'guess'
    and not exists (
      select 1 from jsonb_array_elements(action.tiles) tile
      where tile ->> 'state' <> 'correct'
    );
  select count(distinct action.puzzle_index)::integer
  into v_right_solved
  from brrrdle_private.amordle_combat_action_ledger action
  where action.game_id = p_game_id and action.player_id = 'player-two'
    and action.action_type = 'guess'
    and not exists (
      select 1 from jsonb_array_elements(action.tiles) tile
      where tile ->> 'state' <> 'correct'
    );

  v_projection := jsonb_strip_nulls(jsonb_build_object(
    'schemaVersion', 2,
    'authorityVersion', 2,
    'id', v_authority.game_id,
    'scope', v_authority.scope,
    'mode', v_authority.mode,
    'dailyDateKey', v_daily_date_key,
    'sourceKind', replace(v_authority.source_kind, '_', '-'),
    'visibilityKind', v_authority.visibility_kind,
    'wordLength', v_authority.word_length,
    'difficulty', v_authority.difficulty,
    'hardMode', v_authority.hard_mode,
    'goPuzzleCount', v_authority.go_puzzle_count,
    'timeLimitMs', v_authority.time_limit_ms,
    'ranked', v_authority.ranked,
    'ratingBucket', brrrdle_private.amordle_app_bucket(v_authority.rating_bucket),
    'status', v_authority.status,
    'version', v_authority.version,
    'moveCount', v_authority.move_count,
    'serverNow', now(),
    'createdAt', v_authority.created_at,
    'startedAt', v_authority.started_at,
    'updatedAt', v_authority.updated_at,
    'endedAt', v_authority.ended_at,
    'turnStartedAt', v_authority.turn_started_at,
    'currentTurn', case when v_authority.status in ('playing', 'holding') then v_authority.current_turn else null end,
    'currentPuzzleIndex', v_authority.current_puzzle_index,
    'attemptBudget', brrrdle_private.amordle_attempt_budget(v_authority.current_puzzle_index),
    'holdUntil', v_authority.hold_until,
    'viewerSeat', v_viewer_seat,
    'players', v_players,
    'moves', brrrdle_private.amordle_ledger_moves(p_game_id),
    'seededRows', brrrdle_private.amordle_seeded_rows(p_game_id, v_authority.current_puzzle_index),
    'playerState', jsonb_build_object(
      'player-one', jsonb_build_object(
        'points', brrrdle_private.amordle_player_points(p_game_id, 'player-one'),
        'attemptsThisPuzzle', v_left_attempts,
        'puzzlesSolved', coalesce(v_left_solved, 0),
        'timeRemainingMs', v_authority.player_one_time_remaining_ms
      ),
      'player-two', jsonb_build_object(
        'points', brrrdle_private.amordle_player_points(p_game_id, 'player-two'),
        'attemptsThisPuzzle', v_right_attempts,
        'puzzlesSolved', coalesce(v_right_solved, 0),
        'timeRemainingMs', v_authority.player_two_time_remaining_ms
      )
    ),
    'capabilities', jsonb_build_object(
      'canJoin', false,
      'canSubmitGuess', v_authority.status = 'playing' and v_authority.current_turn = v_viewer_seat,
      'canAdvance', v_authority.status = 'holding',
      'canCancel', v_authority.status = 'waiting' or (v_authority.status = 'playing' and v_authority.move_count = 0),
      'canForfeit', v_authority.status in ('playing', 'holding') and v_authority.move_count > 0,
      'canSettleRating', v_authority.ranked and v_authority.status = 'completed'
    ),
    'outcome', jsonb_strip_nulls(jsonb_build_object(
      'terminal', v_authority.status in ('completed', 'cancelled'),
      'reason', v_authority.terminal_reason,
      'winnerSeat', v_authority.winner_player_id,
      'forfeitedSeat', v_authority.forfeited_player_id,
      'timedOutSeat', v_authority.timed_out_player_id
    ))
  ));
  if v_authority.status = 'completed' then
    v_projection := v_projection || jsonb_build_object('revealedAnswers', v_authority.answers);
  end if;
  return v_projection;
end;
$$;

create or replace function public.create_amordle_ranked_practice_request_v2(
  p_mode text,
  p_word_length integer,
  p_difficulty text,
  p_hard_mode boolean,
  p_go_puzzle_count integer,
  p_time_limit_ms integer,
  p_creation_key text,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_mode text := lower(coalesce(p_mode, ''));
  v_difficulty text := lower(coalesce(p_difficulty, ''));
  v_bucket text;
  v_existing public.multiplayer_matchmaking_queue%rowtype;
  v_request public.multiplayer_matchmaking_queue%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000', detail = 'AUTH_REQUIRED';
  end if;
  v_bucket := brrrdle_private.amordle_storage_bucket(v_mode, p_time_limit_ms);
  if nullif(p_creation_key, '') is null or length(p_creation_key) > 200
    or v_mode not in ('og', 'go')
    or p_word_length not between 2 and 35
    or v_difficulty not in ('casual', 'standard', 'expert')
    or p_hard_mode is null
    or v_bucket is null
    or (v_mode = 'og' and p_go_puzzle_count is not null)
    or (v_mode = 'go' and p_go_puzzle_count not in (5, 7, 10))
    or (p_expires_at is not null and p_expires_at <= now())
  then
    raise exception 'INVALID_ARGUMENT' using errcode = '22023', detail = 'INVALID_ARGUMENT';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('amordle-ranked-practice:' || p_creation_key, 0));
  select * into v_existing
  from public.multiplayer_matchmaking_queue queue_row
  where queue_row.idempotency_key = p_creation_key;
  if found then
    if v_existing.user_id <> v_user_id
      or v_existing.authority_version <> 2
      or v_existing.scope <> 'practice'
      or v_existing.mode <> v_mode
      or v_existing.word_length <> p_word_length
      or v_existing.difficulty <> v_difficulty
      or v_existing.hard_mode is distinct from p_hard_mode
      or v_existing.go_puzzle_count is distinct from p_go_puzzle_count
      or v_existing.time_limit_ms is distinct from p_time_limit_ms
      or v_existing.rating_bucket <> v_bucket
    then
      raise exception 'IDEMPOTENCY_CONFLICT'
        using errcode = '23505', detail = 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object(
      'schemaVersion', 2,
      'requestId', v_existing.id,
      'status', v_existing.status,
      'matchedGameId', coalesce(v_existing.matched_game_id, v_existing.matched_match_id),
      'queuedAt', v_existing.queued_at,
      'expiresAt', v_existing.expires_at,
      'idempotent', true
    );
  end if;

  if (
    select count(*)
    from public.multiplayer_matchmaking_queue queue_row
    where queue_row.user_id = v_user_id
      and queue_row.authority_version = 2
      and queue_row.status in ('queued', 'matched')
  ) >= 5 then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'ACTIVE_LIMIT';
  end if;

  insert into public.multiplayer_matchmaking_queue (
    user_id,
    transport,
    mode,
    scope,
    daily_date_key,
    word_length,
    difficulty,
    go_puzzle_count,
    rating_bucket,
    rating_snapshot,
    ranked,
    hard_mode,
    time_limit_ms,
    authority_version,
    status,
    idempotency_key,
    queued_at,
    expires_at
  ) values (
    v_user_id,
    'async',
    v_mode,
    'practice',
    null,
    p_word_length,
    v_difficulty,
    p_go_puzzle_count,
    v_bucket,
    coalesce((
      select profile.rating
      from public.multiplayer_rating_profiles profile
      where profile.user_id = v_user_id and profile.bucket = v_bucket
    ), 1200),
    true,
    p_hard_mode,
    p_time_limit_ms,
    2,
    'queued',
    p_creation_key,
    now(),
    coalesce(p_expires_at, now() + interval '15 minutes')
  )
  returning * into v_request;

  return jsonb_build_object(
    'schemaVersion', 2,
    'requestId', v_request.id,
    'status', v_request.status,
    'queuedAt', v_request.queued_at,
    'expiresAt', v_request.expires_at,
    'idempotent', false
  );
end;
$$;

create or replace function public.claim_amordle_ranked_practice_v2(
  p_request_id text,
  p_action_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.multiplayer_matchmaking_queue%rowtype;
  v_candidate public.multiplayer_matchmaking_queue%rowtype;
  v_game_id text;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000', detail = 'AUTH_REQUIRED';
  end if;
  if nullif(p_request_id, '') is null or nullif(p_action_id, '') is null then
    raise exception 'INVALID_ARGUMENT' using errcode = '22023', detail = 'INVALID_ARGUMENT';
  end if;
  select * into v_request
  from public.multiplayer_matchmaking_queue queue_row
  where queue_row.id = p_request_id
  for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002', detail = 'NOT_FOUND';
  end if;
  if v_request.user_id <> v_user_id or v_request.authority_version <> 2
    or v_request.scope <> 'practice'
  then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'FORBIDDEN';
  end if;
  if v_request.status = 'matched' then
    return jsonb_build_object(
      'schemaVersion', 2,
      'requestId', v_request.id,
      'status', 'matched',
      'matchedGameId', coalesce(v_request.matched_game_id, v_request.matched_match_id),
      'idempotent', true
    );
  end if;
  if v_request.status <> 'queued' or coalesce(v_request.expires_at, now()) <= now() then
    if v_request.status = 'queued' then
      update public.multiplayer_matchmaking_queue set status = 'expired'
      where id = v_request.id;
    end if;
    return jsonb_build_object(
      'schemaVersion', 2,
      'requestId', v_request.id,
      'status', case when v_request.status = 'queued' then 'expired' else v_request.status end,
      'idempotent', false
    );
  end if;

  select * into v_candidate
  from public.multiplayer_matchmaking_queue candidate
  where candidate.authority_version = 2
    and candidate.status = 'queued'
    and candidate.id <> v_request.id
    and candidate.user_id <> v_user_id
    and coalesce(candidate.expires_at, now() + interval '1 second') > now()
    and candidate.transport = 'async'
    and candidate.scope = 'practice'
    and candidate.mode = v_request.mode
    and candidate.word_length = v_request.word_length
    and candidate.difficulty = v_request.difficulty
    and candidate.hard_mode is not distinct from v_request.hard_mode
    and candidate.go_puzzle_count is not distinct from v_request.go_puzzle_count
    and candidate.time_limit_ms is not distinct from v_request.time_limit_ms
    and candidate.rating_bucket = v_request.rating_bucket
  order by candidate.queued_at, candidate.id
  for update skip locked
  limit 1;

  if not found then
    return jsonb_build_object(
      'schemaVersion', 2,
      'requestId', v_request.id,
      'status', 'queued',
      'queuedAt', v_request.queued_at,
      'expiresAt', v_request.expires_at,
      'idempotent', false
    );
  end if;

  v_game_id := 'amordle-combat-v2-' || extensions.gen_random_uuid()::text;
  insert into brrrdle_private.amordle_ranked_practice_reservations (
    game_id,
    request_one_id,
    request_two_id,
    player_one_user_id,
    player_two_user_id,
    mode,
    word_length,
    difficulty,
    hard_mode,
    go_puzzle_count,
    time_limit_ms,
    rating_bucket
  ) values (
    v_game_id,
    case when v_candidate.queued_at < v_request.queued_at
      or (v_candidate.queued_at = v_request.queued_at and v_candidate.id < v_request.id)
      then v_candidate.id else v_request.id end,
    case when v_candidate.queued_at < v_request.queued_at
      or (v_candidate.queued_at = v_request.queued_at and v_candidate.id < v_request.id)
      then v_request.id else v_candidate.id end,
    case when v_candidate.queued_at < v_request.queued_at
      or (v_candidate.queued_at = v_request.queued_at and v_candidate.id < v_request.id)
      then v_candidate.user_id else v_request.user_id end,
    case when v_candidate.queued_at < v_request.queued_at
      or (v_candidate.queued_at = v_request.queued_at and v_candidate.id < v_request.id)
      then v_request.user_id else v_candidate.user_id end,
    v_request.mode,
    v_request.word_length,
    v_request.difficulty,
    v_request.hard_mode,
    v_request.go_puzzle_count,
    v_request.time_limit_ms,
    v_request.rating_bucket
  );
  update public.multiplayer_matchmaking_queue
  set
    status = 'matched',
    matched_match_id = v_game_id,
    matched_game_id = v_game_id,
    matched_at = now()
  where id in (v_request.id, v_candidate.id);

  return jsonb_build_object(
    'schemaVersion', 2,
    'requestId', v_request.id,
    'status', 'matched',
    'matchedGameId', v_game_id,
    'idempotent', false
  );
end;
$$;

create or replace function public.get_amordle_ranked_practice_status_v2(p_request_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.multiplayer_matchmaking_queue%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000', detail = 'AUTH_REQUIRED';
  end if;
  select * into v_request
  from public.multiplayer_matchmaking_queue queue_row
  where queue_row.id = p_request_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002', detail = 'NOT_FOUND';
  end if;
  if v_request.user_id <> v_user_id or v_request.authority_version <> 2 then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'FORBIDDEN';
  end if;
  return jsonb_build_object(
    'schemaVersion', 2,
    'requestId', v_request.id,
    'status', case
      when v_request.status = 'queued' and coalesce(v_request.expires_at, now()) <= now()
        then 'expired'
      else v_request.status
    end,
    'matchedGameId', coalesce(v_request.matched_game_id, v_request.matched_match_id),
    'queuedAt', v_request.queued_at,
    'matchedAt', v_request.matched_at,
    'expiresAt', v_request.expires_at
  );
end;
$$;

create or replace function public.cancel_amordle_ranked_practice_v2(
  p_request_id text,
  p_action_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.multiplayer_matchmaking_queue%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000', detail = 'AUTH_REQUIRED';
  end if;
  select * into v_request
  from public.multiplayer_matchmaking_queue queue_row
  where queue_row.id = p_request_id
  for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002', detail = 'NOT_FOUND';
  end if;
  if v_request.user_id <> v_user_id or v_request.authority_version <> 2 then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'FORBIDDEN';
  end if;
  if v_request.status = 'queued' then
    update public.multiplayer_matchmaking_queue set status = 'cancelled'
    where id = v_request.id;
  elsif v_request.status = 'matched' then
    raise exception 'TERMINAL' using errcode = '22023', detail = 'MATCH_ALREADY_RESERVED';
  end if;
  return jsonb_build_object(
    'schemaVersion', 2,
    'requestId', v_request.id,
    'status', case when v_request.status = 'queued' then 'cancelled' else v_request.status end,
    'idempotent', v_request.status <> 'queued'
  );
end;
$$;

create or replace function public.finalize_amordle_ranked_practice_v2(
  p_request_id text,
  p_game_id text,
  p_action_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_reservation brrrdle_private.amordle_ranked_practice_reservations%rowtype;
  v_request public.multiplayer_matchmaking_queue%rowtype;
  v_existing brrrdle_private.amordle_combat_authority%rowtype;
  v_revision text;
  v_answers text[];
  v_count integer;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000', detail = 'AUTH_REQUIRED';
  end if;
  select * into v_reservation
  from brrrdle_private.amordle_ranked_practice_reservations reservation
  where reservation.game_id = p_game_id
  for update;
  if not found or p_request_id not in (v_reservation.request_one_id, v_reservation.request_two_id)
    or v_user_id not in (v_reservation.player_one_user_id, v_reservation.player_two_user_id)
  then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'FORBIDDEN';
  end if;
  select * into v_request
  from public.multiplayer_matchmaking_queue queue_row
  where queue_row.id = p_request_id;
  if not found or v_request.status <> 'matched'
    or v_request.authority_version <> 2
    or coalesce(v_request.matched_game_id, v_request.matched_match_id) <> p_game_id
    or v_request.mode <> v_reservation.mode
    or v_request.word_length <> v_reservation.word_length
    or v_request.difficulty <> v_reservation.difficulty
    or v_request.hard_mode is distinct from v_reservation.hard_mode
    or v_request.go_puzzle_count is distinct from v_reservation.go_puzzle_count
    or v_request.time_limit_ms is distinct from v_reservation.time_limit_ms
    or v_request.rating_bucket <> v_reservation.rating_bucket
  then
    raise exception 'INVALID_ARGUMENT' using errcode = '22023', detail = 'RESERVATION_MISMATCH';
  end if;

  select * into v_existing
  from brrrdle_private.amordle_combat_authority authority
  where authority.game_id = p_game_id;
  if found then
    return brrrdle_private.amordle_participant_projection(p_game_id, v_user_id)
      || jsonb_build_object('idempotent', true);
  end if;

  select max(catalog.revision) into v_revision
  from brrrdle_private.amordle_word_catalogs catalog
  where catalog.word_length = v_reservation.word_length;
  v_count := case when v_reservation.mode = 'go' then v_reservation.go_puzzle_count else 1 end;
  v_answers := brrrdle_private.amordle_select_answers(
    v_revision,
    v_reservation.word_length,
    v_reservation.difficulty,
    v_count
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
    projection,
    created_at,
    updated_at,
    authority_version,
    source_kind,
    visibility_kind,
    state_version,
    move_count
  ) values (
    p_game_id,
    'practice',
    v_reservation.mode,
    null,
    'playing',
    'player-one',
    v_reservation.word_length,
    v_reservation.difficulty,
    v_reservation.go_puzzle_count,
    v_reservation.player_one_user_id,
    v_reservation.player_one_user_id,
    v_reservation.player_two_user_id,
    true,
    v_reservation.rating_bucket,
    p_request_id,
    null,
    jsonb_build_object(
      'schemaVersion', 2,
      'authorityVersion', 2,
      'id', p_game_id,
      'scope', 'practice',
      'mode', v_reservation.mode,
      'status', 'playing',
      'ranked', true,
      'wordLength', v_reservation.word_length,
      'difficulty', v_reservation.difficulty,
      'hardMode', v_reservation.hard_mode,
      'goPuzzleCount', v_reservation.go_puzzle_count,
      'timeLimitMs', v_reservation.time_limit_ms,
      'stateVersion', 0,
      'moveCount', 0,
      'createdAt', v_reservation.matched_at,
      'updatedAt', v_now
    ),
    v_reservation.matched_at,
    v_now,
    2,
    'ranked_queue',
    'public',
    0,
    0
  );
  insert into brrrdle_private.amordle_combat_authority (
    game_id,
    creation_key,
    source_kind,
    visibility_kind,
    scope,
    mode,
    word_length,
    difficulty,
    hard_mode,
    go_puzzle_count,
    time_limit_ms,
    ranked,
    rating_bucket,
    catalog_revision,
    answers,
    player_one_user_id,
    player_two_user_id,
    status,
    current_turn,
    player_one_time_remaining_ms,
    player_two_time_remaining_ms,
    turn_started_at,
    created_at,
    started_at,
    updated_at
  ) values (
    p_game_id,
    'ranked-practice:' || p_game_id,
    'ranked_queue',
    'public',
    'practice',
    v_reservation.mode,
    v_reservation.word_length,
    v_reservation.difficulty,
    v_reservation.hard_mode,
    v_reservation.go_puzzle_count,
    v_reservation.time_limit_ms,
    true,
    v_reservation.rating_bucket,
    v_revision,
    v_answers,
    v_reservation.player_one_user_id,
    v_reservation.player_two_user_id,
    'playing',
    'player-one',
    v_reservation.time_limit_ms,
    v_reservation.time_limit_ms,
    case when v_reservation.time_limit_ms is not null then v_now else null end,
    v_reservation.matched_at,
    v_now,
    v_now
  );
  update brrrdle_private.amordle_ranked_practice_reservations
  set finalized_at = v_now where game_id = p_game_id;
  return brrrdle_private.amordle_participant_projection(p_game_id, v_user_id)
    || jsonb_build_object('idempotent', false);
end;
$$;

create or replace function public.create_amordle_unranked_daily_lobby_v2(
  p_mode text,
  p_hard_mode boolean,
  p_creation_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_mode text := lower(coalesce(p_mode, ''));
  v_date_key text := (now() at time zone 'UTC')::date::text;
  v_existing brrrdle_private.amordle_combat_authority%rowtype;
  v_revision text;
  v_answers text[];
  v_game_id text;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000', detail = 'AUTH_REQUIRED';
  end if;
  if v_mode not in ('og', 'go') or p_hard_mode is null
    or nullif(p_creation_key, '') is null or length(p_creation_key) > 200
  then
    raise exception 'INVALID_ARGUMENT' using errcode = '22023', detail = 'INVALID_ARGUMENT';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('amordle-daily:' || p_creation_key, 0));
  select * into v_existing
  from brrrdle_private.amordle_combat_authority authority
  where authority.creation_key = p_creation_key;
  if found then
    if v_existing.player_one_user_id <> v_user_id
      or v_existing.scope <> 'daily'
      or v_existing.mode <> v_mode
      or v_existing.hard_mode is distinct from p_hard_mode
      or v_existing.created_at::date <> v_date_key::date
    then
      raise exception 'IDEMPOTENCY_CONFLICT'
        using errcode = '23505', detail = 'IDEMPOTENCY_CONFLICT';
    end if;
    return brrrdle_private.amordle_participant_projection(v_existing.game_id, v_user_id);
  end if;

  select max(catalog.revision) into v_revision
  from brrrdle_private.amordle_word_catalogs catalog
  where catalog.word_length = 5;
  v_answers := brrrdle_private.amordle_select_answers(
    v_revision, 5, 'expert', case when v_mode = 'go' then 5 else 1 end
  );
  v_game_id := 'amordle-daily-v2-' || extensions.gen_random_uuid()::text;

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
    projection,
    created_at,
    updated_at,
    authority_version,
    source_kind,
    visibility_kind,
    state_version,
    move_count
  ) values (
    v_game_id,
    'daily',
    v_mode,
    v_date_key,
    'waiting',
    'player-one',
    5,
    'expert',
    case when v_mode = 'go' then 5 else null end,
    v_user_id,
    v_user_id,
    null,
    false,
    null,
    jsonb_build_object(
      'schemaVersion', 2,
      'authorityVersion', 2,
      'id', v_game_id,
      'scope', 'daily',
      'mode', v_mode,
      'dailyDateKey', v_date_key,
      'status', 'waiting',
      'ranked', false,
      'wordLength', 5,
      'difficulty', 'expert',
      'hardMode', p_hard_mode,
      'goPuzzleCount', case when v_mode = 'go' then 5 else null end,
      'stateVersion', 0,
      'moveCount', 0,
      'createdAt', v_now,
      'updatedAt', v_now
    ),
    v_now,
    v_now,
    2,
    'daily_lobby',
    'restricted',
    0,
    0
  );

  insert into brrrdle_private.amordle_combat_authority (
    game_id,
    creation_key,
    source_kind,
    visibility_kind,
    scope,
    mode,
    word_length,
    difficulty,
    hard_mode,
    go_puzzle_count,
    time_limit_ms,
    ranked,
    rating_bucket,
    catalog_revision,
    answers,
    player_one_user_id,
    player_two_user_id,
    status,
    current_turn,
    created_at,
    updated_at
  ) values (
    v_game_id,
    p_creation_key,
    'daily_lobby',
    'restricted',
    'daily',
    v_mode,
    5,
    'expert',
    p_hard_mode,
    case when v_mode = 'go' then 5 else null end,
    null,
    false,
    null,
    v_revision,
    v_answers,
    v_user_id,
    null,
    'waiting',
    'player-one',
    v_now,
    v_now
  );
  return brrrdle_private.amordle_participant_projection(v_game_id, v_user_id);
end;
$$;

create or replace function public.list_amordle_unranked_daily_lobbies_v2(
  p_mode text default null,
  p_limit integer default 25
)
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'schemaVersion', 2,
    'authorityVersion', 2,
    'id', authority.game_id,
    'scope', 'daily',
    'mode', authority.mode,
    'dailyDateKey', public_game.daily_date_key,
    'status', authority.status,
    'version', authority.version,
    'moveCount', authority.move_count,
    'wordLength', 5,
    'difficulty', 'expert',
    'hardMode', authority.hard_mode,
    'goPuzzleCount', authority.go_puzzle_count,
    'ranked', false,
    'viewerSeat', case when authority.player_one_user_id = auth.uid() then 'player-one' else null end,
    'owner', jsonb_strip_nulls(jsonb_build_object(
      'publicProfileId', profile.public_profile_id,
      'displayName', coalesce(nullif(profile.display_name, ''), 'Player One'),
      'avatarUrl', nullif(profile.avatar_url, ''),
      'accentColor', nullif(profile.accent_color, '')
    )),
    'createdAt', authority.created_at,
    'updatedAt', authority.updated_at,
    'capabilities', jsonb_build_object(
      'canJoin', authority.player_one_user_id <> auth.uid(),
      'canCancel', authority.player_one_user_id = auth.uid()
    )
  ))
  from brrrdle_private.amordle_combat_authority authority
  join public.async_multiplayer_games public_game on public_game.id = authority.game_id
  left join public.public_player_profiles profile
    on profile.user_id = authority.player_one_user_id
    and profile.visibility = 'public'
    and profile.moderation_status = 'active'
  where auth.uid() is not null
    and authority.source_kind = 'daily_lobby'
    and authority.scope = 'daily'
    and authority.ranked = false
    and authority.status = 'waiting'
    and authority.player_two_user_id is null
    and public_game.daily_date_key = (now() at time zone 'UTC')::date::text
    and (nullif(lower(coalesce(p_mode, '')), '') is null or authority.mode = lower(p_mode))
  order by authority.created_at, authority.game_id
  limit least(greatest(coalesce(p_limit, 25), 0), 50)
$$;

create or replace function public.join_amordle_unranked_daily_lobby_v2(
  p_game_id text,
  p_action_id text,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_authority brrrdle_private.amordle_combat_authority%rowtype;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000', detail = 'AUTH_REQUIRED';
  end if;
  select * into v_authority
  from brrrdle_private.amordle_combat_authority authority
  where authority.game_id = p_game_id
  for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002', detail = 'NOT_FOUND';
  end if;
  if v_authority.source_kind <> 'daily_lobby' or v_authority.scope <> 'daily'
    or v_authority.ranked or v_authority.status <> 'waiting'
    or v_authority.player_two_user_id is not null
  then
    raise exception 'TERMINAL' using errcode = '22023', detail = 'NOT_JOINABLE';
  end if;
  if v_authority.player_one_user_id = v_user_id then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'SAME_PARTICIPANT';
  end if;
  if v_authority.version <> p_expected_version then
    raise exception 'STATE_CONFLICT' using errcode = '40001', detail = 'STATE_CONFLICT';
  end if;

  update brrrdle_private.amordle_combat_authority
  set
    player_two_user_id = v_user_id,
    status = 'playing',
    started_at = v_now,
    version = version + 1,
    updated_at = v_now
  where game_id = p_game_id;
  update public.async_multiplayer_games
  set
    player_two_user_id = v_user_id,
    status = 'playing',
    state_version = state_version + 1,
    projection = projection || jsonb_build_object(
      'status', 'playing',
      'stateVersion', state_version + 1,
      'updatedAt', v_now
    ),
    updated_at = v_now
  where id = p_game_id and authority_version = 2;
  return brrrdle_private.amordle_participant_projection(p_game_id, v_user_id);
end;
$$;

create or replace function public.cancel_amordle_unranked_daily_lobby_v2(
  p_game_id text,
  p_action_id text,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_authority brrrdle_private.amordle_combat_authority%rowtype;
  v_public public.async_multiplayer_games%rowtype;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000', detail = 'AUTH_REQUIRED';
  end if;
  select * into v_authority
  from brrrdle_private.amordle_combat_authority authority
  where authority.game_id = p_game_id
  for update;
  select * into v_public
  from public.async_multiplayer_games public_game
  where public_game.id = p_game_id
  for update;
  if not found or v_authority.game_id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002', detail = 'NOT_FOUND';
  end if;
  if v_authority.player_one_user_id <> v_user_id
    or v_authority.source_kind <> 'daily_lobby'
  then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'FORBIDDEN';
  end if;
  if v_authority.status = 'cancelled' then
    return brrrdle_private.amordle_participant_projection(p_game_id, v_user_id)
      || jsonb_build_object('idempotent', true);
  end if;
  if v_authority.status <> 'waiting' or v_authority.player_two_user_id is not null
    or v_authority.version <> p_expected_version
  then
    raise exception 'STATE_CONFLICT' using errcode = '40001', detail = 'STATE_CONFLICT';
  end if;
  update brrrdle_private.amordle_combat_authority
  set
    status = 'cancelled',
    terminal_reason = 'cancelled',
    version = version + 1,
    ended_at = v_now,
    updated_at = v_now
  where game_id = p_game_id;
  update public.async_multiplayer_games
  set
    status = 'cancelled',
    state_version = state_version + 1,
    ended_at = v_now,
    projection = projection || jsonb_build_object(
      'status', 'cancelled',
      'stateVersion', state_version + 1,
      'updatedAt', v_now,
      'endedAt', v_now
    ),
    updated_at = v_now
  where id = p_game_id and authority_version = 2;
  return brrrdle_private.amordle_participant_projection(p_game_id, v_user_id);
end;
$$;

create or replace function public.get_amordle_combat_game_v2(p_game_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000', detail = 'AUTH_REQUIRED';
  end if;
  return brrrdle_private.amordle_participant_projection(p_game_id, auth.uid());
end;
$$;

create or replace function public.list_amordle_combat_active_v2(
  p_limit integer default 50
)
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select brrrdle_private.amordle_participant_projection(authority.game_id, auth.uid())
  from brrrdle_private.amordle_combat_authority authority
  where auth.uid() is not null
    and auth.uid() in (authority.player_one_user_id, authority.player_two_user_id)
    and authority.status in ('waiting', 'playing', 'holding', 'completed', 'cancelled')
  order by
    case when authority.status in ('waiting', 'playing', 'holding') then 0 else 1 end,
    authority.updated_at desc,
    authority.game_id
  limit least(greatest(coalesce(p_limit, 50), 0), 100)
$$;

create or replace function public.save_amordle_combat_command_v2(
  p_game_id text,
  p_action_id text,
  p_expected_version integer,
  p_expected_move_count integer,
  p_command text,
  p_guess text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_command text := lower(coalesce(p_command, ''));
  v_guess text := lower(nullif(btrim(p_guess), ''));
  v_authority brrrdle_private.amordle_combat_authority%rowtype;
  v_public public.async_multiplayer_games%rowtype;
  v_existing brrrdle_private.amordle_combat_action_ledger%rowtype;
  v_player_id text;
  v_other_player_id text;
  v_player_user_id uuid;
  v_other_user_id uuid;
  v_active_time integer;
  v_clock_debit integer := 0;
  v_now timestamptz := now();
  v_answer text;
  v_tiles jsonb;
  v_solved boolean := false;
  v_attempts integer;
  v_other_attempts integer;
  v_attempt_budget integer;
  v_points integer := 0;
  v_next_status text;
  v_next_turn text;
  v_next_puzzle integer;
  v_next_hold timestamptz;
  v_next_started timestamptz;
  v_next_ended timestamptz;
  v_terminal_reason text;
  v_winner text;
  v_forfeited text;
  v_timed_out text;
  v_left_points integer;
  v_right_points integer;
  v_sequence integer;
  v_next_move_count integer;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000', detail = 'AUTH_REQUIRED';
  end if;
  if nullif(p_game_id, '') is null or nullif(p_action_id, '') is null
    or length(p_action_id) > 200
    or p_expected_version is null or p_expected_move_count is null
    or v_command not in ('guess', 'cancel', 'forfeit', 'advance', 'timeout')
    or (v_command = 'guess' and v_guess is null)
    or (v_command <> 'guess' and v_guess is not null)
  then
    raise exception 'INVALID_ARGUMENT' using errcode = '22023', detail = 'INVALID_ARGUMENT';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('amordle-combat-command:' || p_game_id, 0));
  select * into v_authority
  from brrrdle_private.amordle_combat_authority authority
  where authority.game_id = p_game_id
  for update;
  select * into v_public
  from public.async_multiplayer_games public_game
  where public_game.id = p_game_id
  for update;
  if v_authority.game_id is null or v_public.id is null or v_public.authority_version <> 2 then
    raise exception 'NOT_FOUND' using errcode = 'P0002', detail = 'NOT_FOUND';
  end if;
  if v_user_id = v_authority.player_one_user_id then
    v_player_id := 'player-one';
    v_other_player_id := 'player-two';
    v_player_user_id := v_authority.player_one_user_id;
    v_other_user_id := v_authority.player_two_user_id;
  elsif v_user_id = v_authority.player_two_user_id then
    v_player_id := 'player-two';
    v_other_player_id := 'player-one';
    v_player_user_id := v_authority.player_two_user_id;
    v_other_user_id := v_authority.player_one_user_id;
  else
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'FORBIDDEN';
  end if;

  select * into v_existing
  from brrrdle_private.amordle_combat_action_ledger action
  where action.game_id = p_game_id and action.action_id = p_action_id;
  if found then
    if v_existing.requested_command is distinct from v_command
      or v_existing.requested_guess is distinct from v_guess
    then
      raise exception 'IDEMPOTENCY_CONFLICT'
        using errcode = '23505', detail = 'IDEMPOTENCY_CONFLICT';
    end if;
    return brrrdle_private.amordle_participant_projection(p_game_id, v_user_id)
      || jsonb_build_object('idempotent', true);
  end if;

  if v_authority.status in ('completed', 'cancelled') then
    raise exception 'TERMINAL' using errcode = '22023', detail = 'TERMINAL';
  end if;
  if v_authority.version <> p_expected_version
    or v_authority.move_count <> p_expected_move_count
    or v_public.state_version <> v_authority.version
    or v_public.move_count <> v_authority.move_count
  then
    raise exception 'STATE_CONFLICT' using errcode = '40001', detail = 'STATE_CONFLICT';
  end if;

  -- Materialize the running player-owned clock before considering the command.
  if v_authority.status = 'playing' and v_authority.time_limit_ms is not null
    and v_authority.turn_started_at is not null
  then
    v_clock_debit := greatest(
      0,
      floor(extract(epoch from (v_now - v_authority.turn_started_at)) * 1000)::integer
    );
    if v_authority.current_turn = 'player-one' then
      v_active_time := greatest(0, v_authority.player_one_time_remaining_ms - v_clock_debit);
      v_authority.player_one_time_remaining_ms := v_active_time;
    else
      v_active_time := greatest(0, v_authority.player_two_time_remaining_ms - v_clock_debit);
      v_authority.player_two_time_remaining_ms := v_active_time;
    end if;
    if v_active_time = 0 then
      v_timed_out := v_authority.current_turn;
      v_winner := case v_timed_out when 'player-one' then 'player-two' else 'player-one' end;
      v_sequence := v_authority.version + 1;
      insert into brrrdle_private.amordle_combat_action_ledger (
        game_id, sequence_no, action_id, action_type, requested_command, requested_guess, player_user_id, player_id,
        clock_debit_ms, resulting_version, resulting_move_count, created_at
      ) values (
        p_game_id,
        v_sequence,
        p_action_id,
        'timeout',
        v_command,
        v_guess,
        case v_timed_out when 'player-one' then v_authority.player_one_user_id else v_authority.player_two_user_id end,
        v_timed_out,
        v_clock_debit,
        v_sequence,
        v_authority.move_count,
        v_now
      );
      update brrrdle_private.amordle_combat_authority
      set
        status = 'completed',
        version = v_sequence,
        terminal_reason = 'timeout',
        winner_player_id = v_winner,
        timed_out_player_id = v_timed_out,
        player_one_time_remaining_ms = v_authority.player_one_time_remaining_ms,
        player_two_time_remaining_ms = v_authority.player_two_time_remaining_ms,
        turn_started_at = null,
        ended_at = v_now,
        updated_at = v_now
      where game_id = p_game_id;
      update public.async_multiplayer_games
      set
        status = 'won',
        winner_player_id = v_winner,
        state_version = v_sequence,
        ended_at = v_now,
        updated_at = v_now,
        projection = projection || jsonb_build_object(
          'status', 'completed',
          'stateVersion', v_sequence,
          'moveCount', move_count,
          'updatedAt', v_now,
          'endedAt', v_now
        )
      where id = p_game_id;
      return brrrdle_private.amordle_participant_projection(p_game_id, v_user_id)
        || jsonb_build_object('idempotent', false);
    end if;
  end if;

  v_sequence := v_authority.version + 1;
  v_next_move_count := v_authority.move_count;
  v_next_status := v_authority.status;
  v_next_turn := v_authority.current_turn;
  v_next_puzzle := v_authority.current_puzzle_index;
  v_next_hold := v_authority.hold_until;
  v_next_started := case when v_authority.time_limit_ms is not null then v_now else null end;
  v_attempt_budget := brrrdle_private.amordle_attempt_budget(v_authority.current_puzzle_index);

  if v_command = 'timeout' then
    raise exception 'TIMEOUT_PENDING'
      using errcode = '22023', detail = 'TIMEOUT_PENDING';
  elsif v_command = 'cancel' then
    if v_authority.move_count <> 0 or v_authority.status not in ('waiting', 'playing') then
      raise exception 'TERMINAL' using errcode = '22023', detail = 'CANCEL_NOT_ALLOWED';
    end if;
    v_next_status := 'cancelled';
    v_terminal_reason := 'cancelled';
    v_next_ended := v_now;
    v_next_started := null;
    insert into brrrdle_private.amordle_combat_action_ledger (
      game_id, sequence_no, action_id, action_type, requested_command, requested_guess, player_user_id, player_id,
      clock_debit_ms, resulting_version, resulting_move_count, created_at
    ) values (
      p_game_id, v_sequence, p_action_id, 'cancel', v_command, v_guess, v_user_id, v_player_id,
      v_clock_debit, v_sequence, v_next_move_count, v_now
    );
  elsif v_command = 'forfeit' then
    if v_authority.move_count = 0 or v_authority.status not in ('playing', 'holding') then
      raise exception 'TERMINAL' using errcode = '22023', detail = 'FORFEIT_NOT_ALLOWED';
    end if;
    v_next_status := 'completed';
    v_terminal_reason := 'forfeit';
    v_forfeited := v_player_id;
    v_winner := v_other_player_id;
    v_next_ended := v_now;
    v_next_started := null;
    v_next_hold := null;
    insert into brrrdle_private.amordle_combat_action_ledger (
      game_id, sequence_no, action_id, action_type, requested_command, requested_guess, player_user_id, player_id,
      clock_debit_ms, resulting_version, resulting_move_count, created_at
    ) values (
      p_game_id, v_sequence, p_action_id, 'forfeit', v_command, v_guess, v_user_id, v_player_id,
      v_clock_debit, v_sequence, v_next_move_count, v_now
    );
  elsif v_command = 'advance' then
    if v_authority.status <> 'holding' or v_authority.hold_until is null
      or v_now < v_authority.hold_until
    then
      raise exception 'HOLD_ACTIVE' using errcode = '22023', detail = 'HOLD_ACTIVE';
    end if;
    if v_authority.current_puzzle_index + 1 >= cardinality(v_authority.answers) then
      raise exception 'TERMINAL' using errcode = '22023', detail = 'TERMINAL';
    end if;
    v_next_status := 'playing';
    v_next_puzzle := v_authority.current_puzzle_index + 1;
    v_next_hold := null;
    insert into brrrdle_private.amordle_combat_action_ledger (
      game_id, sequence_no, action_id, action_type, requested_command, requested_guess, player_user_id, player_id,
      puzzle_index, resulting_version, resulting_move_count, created_at
    ) values (
      p_game_id, v_sequence, p_action_id, 'advance', v_command, v_guess, v_user_id, v_player_id,
      v_next_puzzle, v_sequence, v_next_move_count, v_now
    );
  else
    if v_authority.status <> 'playing' then
      raise exception 'HOLD_ACTIVE' using errcode = '22023', detail = 'HOLD_ACTIVE';
    end if;
    if v_authority.current_turn <> v_player_id then
      raise exception 'NOT_YOUR_TURN' using errcode = '22023', detail = 'NOT_YOUR_TURN';
    end if;
    if length(v_guess) <> v_authority.word_length or v_guess !~ '^[a-z]+$' then
      raise exception 'INVALID_GUESS' using errcode = '22023', detail = 'INVALID_GUESS_LENGTH';
    end if;
    if not exists (
      select 1
      from brrrdle_private.amordle_word_catalogs catalog
      where catalog.revision = v_authority.catalog_revision
        and catalog.word_length = v_authority.word_length
        and v_guess = any(catalog.valid_guesses)
    ) then
      raise exception 'INVALID_GUESS' using errcode = '22023', detail = 'INVALID_GUESS_WORD';
    end if;
    if v_authority.hard_mode
      and not brrrdle_private.amordle_hard_mode_guess_is_valid(
        p_game_id, v_authority.current_puzzle_index, v_guess
      )
    then
      raise exception 'HARD_MODE_VIOLATION'
        using errcode = '22023', detail = 'HARD_MODE_VIOLATION';
    end if;
    v_attempts := brrrdle_private.amordle_player_attempts(
      p_game_id, v_player_id, v_authority.current_puzzle_index
    );
    if v_attempts >= v_attempt_budget then
      raise exception 'TERMINAL' using errcode = '22023', detail = 'NO_ATTEMPTS';
    end if;
    v_answer := v_authority.answers[v_authority.current_puzzle_index + 1];
    v_tiles := brrrdle_private.amordle_tiles(v_guess, v_answer);
    v_solved := v_guess = v_answer;
    v_attempts := v_attempts + 1;
    v_points := brrrdle_private.amordle_action_points(
      v_tiles,
      v_solved,
      v_attempt_budget - v_attempts,
      v_authority.hard_mode
    );
    v_next_move_count := v_authority.move_count + 1;
    insert into brrrdle_private.amordle_combat_action_ledger (
      game_id, sequence_no, action_id, action_type, requested_command, requested_guess, player_user_id, player_id,
      puzzle_index, guess, tiles, points_awarded, clock_debit_ms,
      resulting_version, resulting_move_count, created_at
    ) values (
      p_game_id, v_sequence, p_action_id, 'guess', v_command, v_guess, v_user_id, v_player_id,
      v_authority.current_puzzle_index, v_guess, v_tiles, v_points, v_clock_debit,
      v_sequence, v_next_move_count, v_now
    );
    v_other_attempts := brrrdle_private.amordle_player_attempts(
      p_game_id, v_other_player_id, v_authority.current_puzzle_index
    );

    if v_authority.mode = 'og' and v_solved then
      v_next_status := 'completed';
      v_terminal_reason := 'solve';
      v_winner := v_player_id;
      v_next_ended := v_now;
      v_next_started := null;
    elsif v_authority.mode = 'go' and v_solved
      and v_authority.current_puzzle_index + 1 < cardinality(v_authority.answers)
    then
      v_next_status := 'holding';
      v_next_turn := v_other_player_id;
      v_next_hold := v_now + interval '2 seconds';
      v_next_started := null;
    elsif v_authority.mode = 'go' and v_solved then
      v_next_status := 'completed';
      v_terminal_reason := 'points';
      v_next_ended := v_now;
      v_next_started := null;
    elsif v_attempts >= v_attempt_budget and v_other_attempts >= v_attempt_budget then
      v_next_status := 'completed';
      v_terminal_reason := 'points';
      v_next_ended := v_now;
      v_next_started := null;
    elsif v_attempts >= v_attempt_budget then
      v_next_turn := v_other_player_id;
    elsif v_other_attempts >= v_attempt_budget then
      v_next_turn := v_player_id;
    else
      v_next_turn := v_other_player_id;
    end if;
  end if;

  if v_next_status = 'completed' and v_winner is null then
    v_left_points := brrrdle_private.amordle_player_points(p_game_id, 'player-one');
    v_right_points := brrrdle_private.amordle_player_points(p_game_id, 'player-two');
    if v_left_points > v_right_points then
      v_winner := 'player-one';
    elsif v_right_points > v_left_points then
      v_winner := 'player-two';
    else
      v_terminal_reason := 'draw';
    end if;
  end if;

  update brrrdle_private.amordle_combat_authority
  set
    status = v_next_status,
    current_turn = v_next_turn,
    current_puzzle_index = v_next_puzzle,
    hold_until = v_next_hold,
    player_one_time_remaining_ms = case
      when time_limit_ms is null then null
      when v_authority.current_turn = 'player-one' then v_authority.player_one_time_remaining_ms
      else player_one_time_remaining_ms
    end,
    player_two_time_remaining_ms = case
      when time_limit_ms is null then null
      when v_authority.current_turn = 'player-two' then v_authority.player_two_time_remaining_ms
      else player_two_time_remaining_ms
    end,
    turn_started_at = case when v_next_status = 'playing' then v_next_started else null end,
    version = v_sequence,
    move_count = v_next_move_count,
    terminal_reason = v_terminal_reason,
    winner_player_id = v_winner,
    forfeited_player_id = v_forfeited,
    timed_out_player_id = v_timed_out,
    ended_at = v_next_ended,
    updated_at = v_now
  where game_id = p_game_id;

  update public.async_multiplayer_games
  set
    status = case
      when v_next_status = 'waiting' then 'waiting'
      when v_next_status in ('playing', 'holding') then 'playing'
      when v_next_status = 'cancelled' then 'cancelled'
      when v_winner is null then 'lost'
      else 'won'
    end,
    current_turn = v_next_turn,
    winner_player_id = v_winner,
    ended_at = v_next_ended,
    state_version = v_sequence,
    move_count = v_next_move_count,
    updated_at = v_now,
    projection = projection || jsonb_strip_nulls(jsonb_build_object(
      'status', v_next_status,
      'currentTurn', case when v_next_status in ('playing', 'holding') then v_next_turn else null end,
      'currentPuzzleIndex', v_next_puzzle,
      'holdUntil', v_next_hold,
      'stateVersion', v_sequence,
      'moveCount', v_next_move_count,
      'updatedAt', v_now,
      'endedAt', v_next_ended
    ))
  where id = p_game_id and authority_version = 2;

  return brrrdle_private.amordle_participant_projection(p_game_id, v_user_id)
    || jsonb_build_object('idempotent', false);
end;
$$;

create or replace function public.settle_amordle_ranked_practice_v2(
  p_game_id text,
  p_action_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_authority brrrdle_private.amordle_combat_authority%rowtype;
  v_result public.multiplayer_match_results%rowtype;
  v_left_profile public.multiplayer_rating_profiles%rowtype;
  v_right_profile public.multiplayer_rating_profiles%rowtype;
  v_left_points integer;
  v_right_points integer;
  v_left_score numeric;
  v_right_score numeric;
  v_left_expected numeric;
  v_right_expected numeric;
  v_left_k integer;
  v_right_k integer;
  v_left_delta integer;
  v_right_delta integer;
  v_left_outcome text;
  v_right_outcome text;
  v_left_solved integer;
  v_right_solved integer;
  v_left_attempts integer;
  v_right_attempts integer;
  v_idempotency_key text;
  v_viewer_old integer;
  v_viewer_new integer;
  v_viewer_delta integer;
  v_viewer_outcome text;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000', detail = 'AUTH_REQUIRED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('amordle-combat-settle:' || p_game_id, 0));
  select * into v_authority
  from brrrdle_private.amordle_combat_authority authority
  where authority.game_id = p_game_id
  for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002', detail = 'NOT_FOUND';
  end if;
  if v_user_id not in (v_authority.player_one_user_id, v_authority.player_two_user_id)
    or not v_authority.ranked or v_authority.source_kind <> 'ranked_queue'
  then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'FORBIDDEN';
  end if;
  if v_authority.status <> 'completed' or v_authority.terminal_reason is null then
    raise exception 'SETTLEMENT_INELIGIBLE'
      using errcode = '22023', detail = 'SETTLEMENT_INELIGIBLE';
  end if;

  -- Independently reconstruct every awarded move from immutable tiles,
  -- per-player attempt order, and the server-owned Hard Mode flag.
  if exists (
    with ranked_actions as (
      select
        action.*,
        row_number() over (
          partition by action.game_id, action.player_id, action.puzzle_index
          order by action.sequence_no
        )::integer as attempt_number
      from brrrdle_private.amordle_combat_action_ledger action
      where action.game_id = p_game_id and action.action_type = 'guess'
    )
    select 1
    from ranked_actions action
    where action.points_awarded is distinct from brrrdle_private.amordle_action_points(
      action.tiles,
      not exists (
        select 1 from jsonb_array_elements(action.tiles) tile
        where tile ->> 'state' <> 'correct'
      ),
      brrrdle_private.amordle_attempt_budget(action.puzzle_index) - action.attempt_number,
      v_authority.hard_mode
    )
  ) then
    raise exception 'SETTLEMENT_INELIGIBLE'
      using errcode = '22023', detail = 'LEDGER_POINTS_MISMATCH';
  end if;

  v_left_points := brrrdle_private.amordle_player_points(p_game_id, 'player-one');
  v_right_points := brrrdle_private.amordle_player_points(p_game_id, 'player-two');
  if v_authority.terminal_reason = 'points' then
    if v_authority.winner_player_id is distinct from (case
      when v_left_points > v_right_points then 'player-one'
      when v_right_points > v_left_points then 'player-two'
      else null
    end) then
      raise exception 'SETTLEMENT_INELIGIBLE'
        using errcode = '22023', detail = 'OUTCOME_MISMATCH';
    end if;
  elsif v_authority.terminal_reason = 'draw' then
    if v_left_points <> v_right_points or v_authority.winner_player_id is not null then
      raise exception 'SETTLEMENT_INELIGIBLE'
        using errcode = '22023', detail = 'OUTCOME_MISMATCH';
    end if;
  elsif v_authority.terminal_reason = 'forfeit' then
    if v_authority.forfeited_player_id is null
      or v_authority.winner_player_id = v_authority.forfeited_player_id
    then
      raise exception 'SETTLEMENT_INELIGIBLE'
        using errcode = '22023', detail = 'OUTCOME_MISMATCH';
    end if;
  elsif v_authority.terminal_reason = 'timeout' then
    if v_authority.timed_out_player_id is null
      or v_authority.winner_player_id = v_authority.timed_out_player_id
    then
      raise exception 'SETTLEMENT_INELIGIBLE'
        using errcode = '22023', detail = 'OUTCOME_MISMATCH';
    end if;
  elsif v_authority.terminal_reason = 'solve' then
    if not exists (
      select 1
      from brrrdle_private.amordle_combat_action_ledger action
      where action.game_id = p_game_id
        and action.player_id = v_authority.winner_player_id
        and action.action_type = 'guess'
        and not exists (
          select 1 from jsonb_array_elements(action.tiles) tile
          where tile ->> 'state' <> 'correct'
        )
    ) then
      raise exception 'SETTLEMENT_INELIGIBLE'
        using errcode = '22023', detail = 'OUTCOME_MISMATCH';
    end if;
  else
    raise exception 'SETTLEMENT_INELIGIBLE'
      using errcode = '22023', detail = 'OUTCOME_MISMATCH';
  end if;

  v_idempotency_key := 'amordle-ranked-practice-v2:settle:' || p_game_id;
  select * into v_result
  from public.multiplayer_match_results result
  where result.idempotency_key = v_idempotency_key;
  if found then
    select transaction.old_rating, transaction.new_rating, transaction.rating_delta, transaction.outcome
    into v_viewer_old, v_viewer_new, v_viewer_delta, v_viewer_outcome
    from public.multiplayer_rating_transactions transaction
    where transaction.match_result_id = v_result.id and transaction.user_id = v_user_id;
    return jsonb_build_object(
      'schemaVersion', 2,
      'matchResultId', v_result.id,
      'bucket', brrrdle_private.amordle_app_bucket(v_authority.rating_bucket),
      'outcome', v_viewer_outcome,
      'oldRating', v_viewer_old,
      'newRating', v_viewer_new,
      'ratingDelta', v_viewer_delta,
      'idempotent', true
    );
  end if;

  insert into public.multiplayer_rating_profiles (user_id, bucket)
  values
    (v_authority.player_one_user_id, v_authority.rating_bucket),
    (v_authority.player_two_user_id, v_authority.rating_bucket)
  on conflict (user_id, bucket) do nothing;
  perform 1
  from public.multiplayer_rating_profiles profile
  where profile.bucket = v_authority.rating_bucket
    and profile.user_id in (v_authority.player_one_user_id, v_authority.player_two_user_id)
  order by profile.user_id
  for update;
  select * into v_left_profile
  from public.multiplayer_rating_profiles profile
  where profile.user_id = v_authority.player_one_user_id
    and profile.bucket = v_authority.rating_bucket;
  select * into v_right_profile
  from public.multiplayer_rating_profiles profile
  where profile.user_id = v_authority.player_two_user_id
    and profile.bucket = v_authority.rating_bucket;

  if v_authority.winner_player_id = 'player-one' then
    v_left_score := 1; v_right_score := 0;
    v_left_outcome := 'win'; v_right_outcome := 'loss';
  elsif v_authority.winner_player_id = 'player-two' then
    v_left_score := 0; v_right_score := 1;
    v_left_outcome := 'loss'; v_right_outcome := 'win';
  else
    v_left_score := 0.5; v_right_score := 0.5;
    v_left_outcome := 'draw'; v_right_outcome := 'draw';
  end if;
  v_left_expected := 1 / (1 + power(10::numeric, (v_right_profile.rating - v_left_profile.rating)::numeric / 400));
  v_right_expected := 1 - v_left_expected;
  v_left_k := case when v_left_profile.games_played < 10 then 40 else 24 end;
  v_right_k := case when v_right_profile.games_played < 10 then 40 else 24 end;
  v_left_delta := round(v_left_k * (v_left_score - v_left_expected))::integer;
  v_right_delta := round(v_right_k * (v_right_score - v_right_expected))::integer;

  select count(*)::integer, count(*) filter (
    where not exists (
      select 1 from jsonb_array_elements(action.tiles) tile
      where tile ->> 'state' <> 'correct'
    )
  )::integer
  into v_left_attempts, v_left_solved
  from brrrdle_private.amordle_combat_action_ledger action
  where action.game_id = p_game_id and action.action_type = 'guess'
    and action.player_id = 'player-one';
  select count(*)::integer, count(*) filter (
    where not exists (
      select 1 from jsonb_array_elements(action.tiles) tile
      where tile ->> 'state' <> 'correct'
    )
  )::integer
  into v_right_attempts, v_right_solved
  from brrrdle_private.amordle_combat_action_ledger action
  where action.game_id = p_game_id and action.action_type = 'guess'
    and action.player_id = 'player-two';

  insert into public.multiplayer_match_results (
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
    settled_at
  ) values (
    p_game_id,
    'async',
    v_authority.mode,
    'practice',
    null,
    true,
    v_authority.rating_bucket,
    'completed',
    case v_authority.winner_player_id
      when 'player-one' then v_authority.player_one_user_id
      when 'player-two' then v_authority.player_two_user_id
      else null
    end,
    'Authoritative Amordle Practice v2 settlement.',
    v_idempotency_key,
    now()
  )
  returning * into v_result;

  insert into public.multiplayer_player_results (
    match_result_id, user_id, player_id, outcome, attempts_used,
    puzzles_solved, completed_at, summary
  ) values
    (v_result.id, v_authority.player_one_user_id, 'player-one', v_left_outcome,
      coalesce(v_left_attempts, 0), coalesce(v_left_solved, 0), v_authority.ended_at, 'Authoritative ledger result.'),
    (v_result.id, v_authority.player_two_user_id, 'player-two', v_right_outcome,
      coalesce(v_right_attempts, 0), coalesce(v_right_solved, 0), v_authority.ended_at, 'Authoritative ledger result.');

  insert into public.multiplayer_rating_transactions (
    match_result_id, bucket, user_id, opponent_user_id, outcome,
    old_rating, new_rating, rating_delta, expected_score, idempotency_key
  ) values
    (v_result.id, v_authority.rating_bucket, v_authority.player_one_user_id,
      v_authority.player_two_user_id, v_left_outcome, v_left_profile.rating,
      v_left_profile.rating + v_left_delta, v_left_delta, v_left_expected,
      v_idempotency_key || ':player-one'),
    (v_result.id, v_authority.rating_bucket, v_authority.player_two_user_id,
      v_authority.player_one_user_id, v_right_outcome, v_right_profile.rating,
      v_right_profile.rating + v_right_delta, v_right_delta, v_right_expected,
      v_idempotency_key || ':player-two');

  update public.multiplayer_rating_profiles
  set
    rating = rating + case
      when user_id = v_authority.player_one_user_id then v_left_delta else v_right_delta end,
    games_played = games_played + 1,
    wins = wins + case
      when (user_id = v_authority.player_one_user_id and v_left_outcome = 'win')
        or (user_id = v_authority.player_two_user_id and v_right_outcome = 'win') then 1 else 0 end,
    losses = losses + case
      when (user_id = v_authority.player_one_user_id and v_left_outcome = 'loss')
        or (user_id = v_authority.player_two_user_id and v_right_outcome = 'loss') then 1 else 0 end,
    draws = draws + case
      when v_left_outcome = 'draw' then 1 else 0 end,
    provisional = games_played + 1 < 10,
    updated_at = now()
  where bucket = v_authority.rating_bucket
    and user_id in (v_authority.player_one_user_id, v_authority.player_two_user_id);

  if v_user_id = v_authority.player_one_user_id then
    v_viewer_old := v_left_profile.rating;
    v_viewer_new := v_left_profile.rating + v_left_delta;
    v_viewer_delta := v_left_delta;
    v_viewer_outcome := v_left_outcome;
  else
    v_viewer_old := v_right_profile.rating;
    v_viewer_new := v_right_profile.rating + v_right_delta;
    v_viewer_delta := v_right_delta;
    v_viewer_outcome := v_right_outcome;
  end if;
  return jsonb_build_object(
    'schemaVersion', 2,
    'matchResultId', v_result.id,
    'bucket', brrrdle_private.amordle_app_bucket(v_authority.rating_bucket),
    'outcome', v_viewer_outcome,
    'oldRating', v_viewer_old,
    'newRating', v_viewer_new,
    'ratingDelta', v_viewer_delta,
    'idempotent', false
  );
end;
$$;

create or replace function public.get_amordle_practice_leaderboard_v2(
  p_app_bucket text,
  p_limit integer default 50,
  p_offset integer default 0
)
returns setof jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with settings as (
    select case coalesce(p_app_bucket, '')
      when 'multiplayer:og' then 'async:og:amordle:v2'
      when 'multiplayer:go' then 'async:go:amordle:v2'
      when 'multiplayer:og:timed:v1' then 'async:og:timed:amordle:v2'
      when 'multiplayer:go:timed:v1' then 'async:go:timed:amordle:v2'
      else null
    end as storage_bucket
  )
  select jsonb_build_object(
    'rank', row_number() over (order by profile.rating desc, profile.games_played desc, public_profile.public_profile_id)::integer,
    'publicProfileId', public_profile.public_profile_id,
    'displayName', public_profile.display_name,
    'avatarUrl', public_profile.avatar_url,
    'accentColor', public_profile.accent_color,
    'rating', profile.rating,
    'gamesPlayed', profile.games_played,
    'wins', profile.wins,
    'losses', profile.losses,
    'draws', profile.draws,
    'provisional', profile.provisional,
    'updatedAt', profile.updated_at
  )
  from public.multiplayer_rating_profiles profile
  join settings on settings.storage_bucket = profile.bucket
  join public.public_player_profiles public_profile
    on public_profile.user_id = profile.user_id
    and public_profile.visibility = 'public'
    and public_profile.moderation_status = 'active'
  order by profile.rating desc, profile.games_played desc, public_profile.public_profile_id
  limit least(greatest(coalesce(p_limit, 50), 0), 100)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

create or replace function public.inspect_amordle_combat_e2e_v2(
  p_run_id text,
  p_game_id text,
  p_user_ids uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_authority brrrdle_private.amordle_combat_authority%rowtype;
begin
  if auth.role() <> 'service_role' or nullif(p_run_id, '') is null then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'FORBIDDEN';
  end if;
  select * into v_authority
  from brrrdle_private.amordle_combat_authority authority
  where authority.game_id = p_game_id;
  if not found
    or (
      v_authority.creation_key not like p_run_id || ':%'
      and not (
        v_authority.source_kind = 'ranked_queue'
        and exists (
          select 1
          from brrrdle_private.amordle_ranked_practice_reservations reservation
          join public.multiplayer_matchmaking_queue request_one
            on request_one.id = reservation.request_one_id
          join public.multiplayer_matchmaking_queue request_two
            on request_two.id = reservation.request_two_id
          where reservation.game_id = v_authority.game_id
            and request_one.authority_version = 2
            and request_two.authority_version = 2
            and request_one.idempotency_key like p_run_id || ':%'
            and request_two.idempotency_key like p_run_id || ':%'
        )
      )
    )
    or v_authority.player_one_user_id <> all(coalesce(p_user_ids, '{}'::uuid[]))
    or (
      v_authority.player_two_user_id is not null
      and v_authority.player_two_user_id <> all(coalesce(p_user_ids, '{}'::uuid[]))
    )
  then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'E2E_SCOPE_MISMATCH';
  end if;
  return jsonb_build_object(
    'gameId', v_authority.game_id,
    'answers', v_authority.answers,
    'status', v_authority.status,
    'version', v_authority.version,
    'moveCount', v_authority.move_count
  );
end;
$$;

create or replace function public.cleanup_amordle_combat_e2e_v2(
  p_run_id text,
  p_game_ids text[],
  p_request_ids text[],
  p_user_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transactions integer := 0;
  v_player_results integer := 0;
  v_results integer := 0;
  v_actions integer := 0;
  v_authorities integer := 0;
  v_reservations integer := 0;
  v_games integer := 0;
  v_requests integer := 0;
  v_profiles integer := 0;
begin
  if auth.role() <> 'service_role' or nullif(p_run_id, '') is null then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'FORBIDDEN';
  end if;
  if exists (
    select 1
    from public.multiplayer_matchmaking_queue queue_row
    where queue_row.id = any(coalesce(p_request_ids, '{}'::text[]))
      and (
        queue_row.authority_version <> 2
        or queue_row.user_id <> all(coalesce(p_user_ids, '{}'::uuid[]))
        or queue_row.idempotency_key not like p_run_id || ':%'
      )
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'E2E_REQUEST_SCOPE_MISMATCH';
  end if;
  if exists (
    select 1
    from brrrdle_private.amordle_combat_authority authority
    where authority.game_id = any(coalesce(p_game_ids, '{}'::text[]))
      and (
        authority.player_one_user_id <> all(coalesce(p_user_ids, '{}'::uuid[]))
        or (
          authority.player_two_user_id is not null
          and authority.player_two_user_id <> all(coalesce(p_user_ids, '{}'::uuid[]))
        )
        or (
          authority.creation_key not like p_run_id || ':%'
          and not (
            authority.source_kind = 'ranked_queue'
            and exists (
              select 1
              from brrrdle_private.amordle_ranked_practice_reservations reservation
              join public.multiplayer_matchmaking_queue request_one
                on request_one.id = reservation.request_one_id
              join public.multiplayer_matchmaking_queue request_two
                on request_two.id = reservation.request_two_id
              where reservation.game_id = authority.game_id
                and reservation.request_one_id = any(coalesce(p_request_ids, '{}'::text[]))
                and reservation.request_two_id = any(coalesce(p_request_ids, '{}'::text[]))
                and request_one.authority_version = 2
                and request_two.authority_version = 2
                and request_one.idempotency_key like p_run_id || ':%'
                and request_two.idempotency_key like p_run_id || ':%'
            )
          )
        )
      )
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'E2E_SCOPE_MISMATCH';
  end if;

  delete from public.multiplayer_rating_transactions transaction
  using public.multiplayer_match_results result
  where transaction.match_result_id = result.id
    and result.source_match_id = any(coalesce(p_game_ids, '{}'::text[]));
  get diagnostics v_transactions = row_count;
  delete from public.multiplayer_player_results player_result
  using public.multiplayer_match_results result
  where player_result.match_result_id = result.id
    and result.source_match_id = any(coalesce(p_game_ids, '{}'::text[]));
  get diagnostics v_player_results = row_count;
  delete from public.multiplayer_match_results result
  where result.source_match_id = any(coalesce(p_game_ids, '{}'::text[]));
  get diagnostics v_results = row_count;
  delete from brrrdle_private.amordle_combat_action_ledger action
  where action.game_id = any(coalesce(p_game_ids, '{}'::text[]));
  get diagnostics v_actions = row_count;
  delete from brrrdle_private.amordle_combat_authority authority
  where authority.game_id = any(coalesce(p_game_ids, '{}'::text[]));
  get diagnostics v_authorities = row_count;
  delete from public.async_multiplayer_games game
  where game.id = any(coalesce(p_game_ids, '{}'::text[]))
    and game.authority_version = 2;
  get diagnostics v_games = row_count;
  delete from brrrdle_private.amordle_ranked_practice_reservations reservation
  where reservation.game_id = any(coalesce(p_game_ids, '{}'::text[]))
    or reservation.request_one_id = any(coalesce(p_request_ids, '{}'::text[]))
    or reservation.request_two_id = any(coalesce(p_request_ids, '{}'::text[]));
  get diagnostics v_reservations = row_count;
  delete from public.multiplayer_matchmaking_queue queue_row
  where queue_row.id = any(coalesce(p_request_ids, '{}'::text[]))
    and queue_row.authority_version = 2
    and queue_row.user_id = any(coalesce(p_user_ids, '{}'::uuid[]));
  get diagnostics v_requests = row_count;
  delete from public.multiplayer_rating_profiles profile
  where profile.user_id = any(coalesce(p_user_ids, '{}'::uuid[]))
    and profile.bucket in (
      'async:og:amordle:v2',
      'async:go:amordle:v2',
      'async:og:timed:amordle:v2',
      'async:go:timed:amordle:v2'
    );
  get diagnostics v_profiles = row_count;
  return jsonb_build_object(
    'transactions', v_transactions,
    'playerResults', v_player_results,
    'results', v_results,
    'actions', v_actions,
    'authorities', v_authorities,
    'reservations', v_reservations,
    'games', v_games,
    'requests', v_requests,
    'ratingProfiles', v_profiles
  );
end;
$$;

create or replace function public.probe_amordle_combat_e2e_residue_v2(
  p_run_id text,
  p_game_ids text[],
  p_request_ids text[],
  p_user_ids uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' or nullif(p_run_id, '') is null then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'FORBIDDEN';
  end if;
  return jsonb_build_object(
    'games', (
      select count(*) from public.async_multiplayer_games
      where id = any(coalesce(p_game_ids, '{}'::text[]))
    ),
    'authorities', (
      select count(*) from brrrdle_private.amordle_combat_authority
      where game_id = any(coalesce(p_game_ids, '{}'::text[]))
    ),
    'actions', (
      select count(*) from brrrdle_private.amordle_combat_action_ledger
      where game_id = any(coalesce(p_game_ids, '{}'::text[]))
    ),
    'reservations', (
      select count(*) from brrrdle_private.amordle_ranked_practice_reservations
      where game_id = any(coalesce(p_game_ids, '{}'::text[]))
        or request_one_id = any(coalesce(p_request_ids, '{}'::text[]))
        or request_two_id = any(coalesce(p_request_ids, '{}'::text[]))
    ),
    'requests', (
      select count(*) from public.multiplayer_matchmaking_queue
      where id = any(coalesce(p_request_ids, '{}'::text[]))
    ),
    'results', (
      select count(*) from public.multiplayer_match_results
      where source_match_id = any(coalesce(p_game_ids, '{}'::text[]))
    ),
    'ratingProfiles', (
      select count(*) from public.multiplayer_rating_profiles
      where user_id = any(coalesce(p_user_ids, '{}'::uuid[]))
        and bucket like '%:amordle:v2'
    )
  );
end;
$$;

-- Version-zero policy behavior remains available to the accepted shell.
-- Version-two rows are never selected, inserted, or updated directly by a
-- browser role; the RPCs above are their sole authority boundary.
drop policy if exists "Authenticated users can read async games" on public.async_multiplayer_games;
create policy "Authenticated users can read async games"
  on public.async_multiplayer_games for select
  to authenticated
  using (
    authority_version = 0
    and auth.role() = 'authenticated'
    and (
      status = 'waiting'
      or host_user_id = auth.uid()
      or player_one_user_id = auth.uid()
      or player_two_user_id = auth.uid()
    )
  );

drop policy if exists "Users can create non-ranked-Daily async games" on public.async_multiplayer_games;
create policy "Users can create non-ranked-Daily async games"
  on public.async_multiplayer_games for insert
  to authenticated
  with check (
    authority_version = 0
    and auth.uid() = host_user_id
    and (player_one_user_id is null or player_one_user_id = auth.uid())
    and player_two_user_id is null
    and not (ranked = true and scope = 'daily')
  );

drop policy if exists "Async participants can update non-ranked-Daily games" on public.async_multiplayer_games;
create policy "Async participants can update non-ranked-Daily games"
  on public.async_multiplayer_games for update
  to authenticated
  using (
    authority_version = 0
    and not (ranked = true and scope = 'daily')
    and (
      host_user_id = auth.uid()
      or player_one_user_id = auth.uid()
      or player_two_user_id = auth.uid()
      or status = 'waiting'
    )
  )
  with check (
    authority_version = 0
    and not (ranked = true and scope = 'daily')
    and (
      host_user_id = auth.uid()
      or player_one_user_id = auth.uid()
      or player_two_user_id = auth.uid()
    )
  );

revoke all on function public.create_amordle_ranked_practice_request_v2(text, integer, text, boolean, integer, integer, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.claim_amordle_ranked_practice_v2(text, text)
  from public, anon, authenticated;
revoke all on function public.get_amordle_ranked_practice_status_v2(text)
  from public, anon, authenticated;
revoke all on function public.cancel_amordle_ranked_practice_v2(text, text)
  from public, anon, authenticated;
revoke all on function public.finalize_amordle_ranked_practice_v2(text, text, text)
  from public, anon, authenticated;
revoke all on function public.create_amordle_unranked_daily_lobby_v2(text, boolean, text)
  from public, anon, authenticated;
revoke all on function public.list_amordle_unranked_daily_lobbies_v2(text, integer)
  from public, anon, authenticated;
revoke all on function public.join_amordle_unranked_daily_lobby_v2(text, text, integer)
  from public, anon, authenticated;
revoke all on function public.cancel_amordle_unranked_daily_lobby_v2(text, text, integer)
  from public, anon, authenticated;
revoke all on function public.get_amordle_combat_game_v2(text)
  from public, anon, authenticated;
revoke all on function public.list_amordle_combat_active_v2(integer)
  from public, anon, authenticated;
revoke all on function public.save_amordle_combat_command_v2(text, text, integer, integer, text, text)
  from public, anon, authenticated;
revoke all on function public.settle_amordle_ranked_practice_v2(text, text)
  from public, anon, authenticated;
revoke all on function public.get_amordle_practice_leaderboard_v2(text, integer, integer)
  from public, anon, authenticated;

grant execute on function public.create_amordle_ranked_practice_request_v2(text, integer, text, boolean, integer, integer, text, timestamptz)
  to authenticated;
grant execute on function public.claim_amordle_ranked_practice_v2(text, text)
  to authenticated;
grant execute on function public.get_amordle_ranked_practice_status_v2(text)
  to authenticated;
grant execute on function public.cancel_amordle_ranked_practice_v2(text, text)
  to authenticated;
grant execute on function public.finalize_amordle_ranked_practice_v2(text, text, text)
  to authenticated;
grant execute on function public.create_amordle_unranked_daily_lobby_v2(text, boolean, text)
  to authenticated;
grant execute on function public.list_amordle_unranked_daily_lobbies_v2(text, integer)
  to authenticated;
grant execute on function public.join_amordle_unranked_daily_lobby_v2(text, text, integer)
  to authenticated;
grant execute on function public.cancel_amordle_unranked_daily_lobby_v2(text, text, integer)
  to authenticated;
grant execute on function public.get_amordle_combat_game_v2(text)
  to authenticated;
grant execute on function public.list_amordle_combat_active_v2(integer)
  to authenticated;
grant execute on function public.save_amordle_combat_command_v2(text, text, integer, integer, text, text)
  to authenticated;
grant execute on function public.settle_amordle_ranked_practice_v2(text, text)
  to authenticated;
grant execute on function public.get_amordle_practice_leaderboard_v2(text, integer, integer)
  to authenticated;

revoke all on function public.inspect_amordle_combat_e2e_v2(text, text, uuid[])
  from public, anon, authenticated;
revoke all on function public.cleanup_amordle_combat_e2e_v2(text, text[], text[], uuid[])
  from public, anon, authenticated;
revoke all on function public.probe_amordle_combat_e2e_residue_v2(text, text[], text[], uuid[])
  from public, anon, authenticated;
grant execute on function public.inspect_amordle_combat_e2e_v2(text, text, uuid[])
  to service_role;
grant execute on function public.cleanup_amordle_combat_e2e_v2(text, text[], text[], uuid[])
  to service_role;
grant execute on function public.probe_amordle_combat_e2e_residue_v2(text, text[], text[], uuid[])
  to service_role;

revoke all on all functions in schema brrrdle_private from public, anon, authenticated;

comment on table brrrdle_private.amordle_combat_authority
  is 'Server-owned Amordle Ranked Practice and unranked Daily authority. Browser projections never include active answers or raw participant UUIDs.';
comment on function public.settle_amordle_ranked_practice_v2(text, text)
  is 'Reconstructs and validates immutable Amordle v2 action evidence before isolated Ranked Practice Elo settlement.';
