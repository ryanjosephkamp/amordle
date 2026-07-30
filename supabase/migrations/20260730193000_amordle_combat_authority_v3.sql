-- Amordle COMBAT authority v3.
--
-- Forward-only, additive completion of the authoritative COMBAT model for:
--   * public unranked Practice lobbies;
--   * accepted private Practice requests;
--   * accepted unranked Practice rematches;
--   * privacy-safe Ranked Daily finalization and settlement;
--   * public, read-only spectation of eligible public Practice games.
--
-- Existing legacy rows and the phase-55 Ranked Daily authority remain intact
-- for continuity. New accepted flows use the private Amordle authority,
-- accepted-action ledger, server-owned word catalog, clocks, validation, and
-- participant-relative projections introduced in migration 45.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists brrrdle_private;
revoke all on schema brrrdle_private from public, anon, authenticated;

alter table brrrdle_private.amordle_combat_authority
  drop constraint if exists amordle_combat_authority_source_kind_check;
alter table brrrdle_private.amordle_combat_authority
  add constraint amordle_combat_authority_source_kind_check
  check (source_kind in (
    'public_lobby',
    'ranked_queue',
    'daily_lobby',
    'private_request',
    'rematch'
  ));

create index if not exists amordle_authority_public_lobby_v3_idx
  on brrrdle_private.amordle_combat_authority (
    source_kind,
    visibility_kind,
    scope,
    ranked,
    status,
    created_at,
    game_id
  )
  where source_kind = 'public_lobby'
    and visibility_kind = 'public'
    and scope = 'practice'
    and ranked = false;

-- Extend the existing participant-facing bucket mapper to the already
-- established Ranked Daily storage buckets. No rating bucket is merged.
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
    when 'async:og:daily:v1' then 'multiplayer:og:daily:v1'
    when 'async:go:daily:v1' then 'multiplayer:go:daily:v1'
    else null
  end
$$;

-- Private constructor shared by the narrow public RPCs below. It never
-- returns answers and is never executable by a browser role.
create or replace function brrrdle_private.amordle_create_combat_v3(
  p_game_id text,
  p_creation_key text,
  p_source_kind text,
  p_visibility_kind text,
  p_scope text,
  p_mode text,
  p_word_length integer,
  p_difficulty text,
  p_hard_mode boolean,
  p_go_puzzle_count integer,
  p_time_limit_ms integer,
  p_ranked boolean,
  p_rating_bucket text,
  p_player_one_user_id uuid,
  p_player_two_user_id uuid,
  p_status text,
  p_daily_date_key text default null,
  p_matchmaking_request_id text default null,
  p_created_at timestamptz default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope text := lower(coalesce(p_scope, ''));
  v_mode text := lower(coalesce(p_mode, ''));
  v_difficulty text := lower(coalesce(p_difficulty, ''));
  v_source text := lower(coalesce(p_source_kind, ''));
  v_visibility text := lower(coalesce(p_visibility_kind, ''));
  v_status text := lower(coalesce(p_status, ''));
  v_revision text;
  v_answers text[];
  v_answer_count integer;
  v_now timestamptz := coalesce(p_created_at, now());
  v_deadline timestamptz;
begin
  if nullif(btrim(coalesce(p_game_id, '')), '') is null
    or length(p_game_id) > 200
    or nullif(btrim(coalesce(p_creation_key, '')), '') is null
    or length(p_creation_key) > 200
    or v_source not in (
      'public_lobby',
      'ranked_queue',
      'daily_lobby',
      'private_request',
      'rematch'
    )
    or v_visibility not in ('public', 'restricted')
    or v_scope not in ('practice', 'daily')
    or v_mode not in ('og', 'go')
    or p_word_length not between 2 and 35
    or v_difficulty not in ('casual', 'standard', 'expert')
    or p_hard_mode is null
    or p_time_limit_ms is not null and p_time_limit_ms <> 300000
    or p_ranked is null
    or v_status not in ('waiting', 'playing')
    or p_player_one_user_id is null
    or p_player_two_user_id = p_player_one_user_id
    or (v_status = 'waiting' and p_player_two_user_id is not null)
    or (v_status = 'playing' and p_player_two_user_id is null)
    or (v_mode = 'og' and p_go_puzzle_count is not null)
    or (v_mode = 'go' and p_go_puzzle_count not in (5, 7, 10))
    or (p_ranked and nullif(coalesce(p_rating_bucket, ''), '') is null)
    or (not p_ranked and p_rating_bucket is not null)
    or (v_scope = 'daily' and (
      p_word_length <> 5
      or v_difficulty <> 'expert'
      or p_time_limit_ms is not null
      or p_daily_date_key is null
      or p_daily_date_key !~ '^\d{4}-\d{2}-\d{2}$'
    ))
    or (v_scope = 'practice' and p_daily_date_key is not null)
  then
    raise exception 'INVALID_ARGUMENT'
      using errcode = '22023', detail = 'INVALID_ARGUMENT';
  end if;

  if exists (
    select 1
    from brrrdle_private.amordle_combat_authority authority
    where authority.game_id = p_game_id
       or authority.creation_key = p_creation_key
  ) then
    raise exception 'IDEMPOTENCY_CONFLICT'
      using errcode = '23505', detail = 'IDEMPOTENCY_CONFLICT';
  end if;

  select max(catalog.revision)
  into v_revision
  from brrrdle_private.amordle_word_catalogs catalog
  where catalog.word_length = p_word_length;
  if v_revision is null then
    raise exception 'WORD_CATALOG_UNAVAILABLE'
      using errcode = '55000', detail = 'WORD_CATALOG_UNAVAILABLE';
  end if;

  v_answer_count := case when v_mode = 'go' then p_go_puzzle_count else 1 end;
  v_answers := brrrdle_private.amordle_select_answers(
    v_revision,
    p_word_length,
    v_difficulty,
    v_answer_count
  );
  if cardinality(v_answers) <> v_answer_count then
    raise exception 'WORD_CATALOG_UNAVAILABLE'
      using errcode = '55000', detail = 'WORD_CATALOG_UNAVAILABLE';
  end if;

  v_deadline := case
    when v_scope = 'daily'
      then ((p_daily_date_key::date + 1)::timestamp at time zone 'UTC')
    else null
  end;

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
    updated_at,
    authority_version,
    source_kind,
    visibility_kind,
    state_version,
    move_count
  ) values (
    p_game_id,
    v_scope,
    v_mode,
    p_daily_date_key,
    v_status,
    'player-one',
    p_word_length,
    v_difficulty,
    p_go_puzzle_count,
    p_player_one_user_id,
    p_player_one_user_id,
    p_player_two_user_id,
    p_ranked,
    p_rating_bucket,
    p_matchmaking_request_id,
    null,
    null,
    v_deadline,
    null,
    jsonb_strip_nulls(jsonb_build_object(
      'schemaVersion', 2,
      'authorityVersion', 2,
      'id', p_game_id,
      'scope', v_scope,
      'mode', v_mode,
      'dailyDateKey', p_daily_date_key,
      'sourceKind', replace(v_source, '_', '-'),
      'visibilityKind', v_visibility,
      'status', v_status,
      'ranked', p_ranked,
      'ratingBucket', brrrdle_private.amordle_app_bucket(p_rating_bucket),
      'wordLength', p_word_length,
      'difficulty', v_difficulty,
      'hardMode', p_hard_mode,
      'goPuzzleCount', p_go_puzzle_count,
      'timeLimitMs', p_time_limit_ms,
      'stateVersion', 0,
      'moveCount', 0,
      'createdAt', v_now,
      'updatedAt', v_now
    )),
    v_now,
    v_now,
    2,
    v_source,
    v_visibility,
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
    p_creation_key,
    v_source,
    v_visibility,
    v_scope,
    v_mode,
    p_word_length,
    v_difficulty,
    p_hard_mode,
    p_go_puzzle_count,
    p_time_limit_ms,
    p_ranked,
    p_rating_bucket,
    v_revision,
    v_answers,
    p_player_one_user_id,
    p_player_two_user_id,
    v_status,
    'player-one',
    p_time_limit_ms,
    p_time_limit_ms,
    case when v_status = 'playing' and p_time_limit_ms is not null then v_now else null end,
    v_now,
    case when v_status = 'playing' then v_now else null end,
    v_now
  );

  return p_game_id;
end;
$$;

create or replace function public.create_amordle_public_practice_v3(
  p_mode text,
  p_word_length integer,
  p_difficulty text,
  p_hard_mode boolean,
  p_go_puzzle_count integer,
  p_time_limit_ms integer,
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
  v_difficulty text := lower(coalesce(p_difficulty, ''));
  v_existing brrrdle_private.amordle_combat_authority%rowtype;
  v_game_id text;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000', detail = 'AUTH_REQUIRED';
  end if;
  if nullif(btrim(coalesce(p_creation_key, '')), '') is null
    or length(p_creation_key) > 200
    or v_mode not in ('og', 'go')
    or p_word_length not between 2 and 35
    or v_difficulty not in ('casual', 'standard', 'expert')
    or p_hard_mode is null
    or p_time_limit_ms is not null and p_time_limit_ms <> 300000
    or (v_mode = 'og' and p_go_puzzle_count is not null)
    or (v_mode = 'go' and p_go_puzzle_count not in (5, 7, 10))
  then
    raise exception 'INVALID_ARGUMENT'
      using errcode = '22023', detail = 'INVALID_ARGUMENT';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('amordle-public-practice-v3:' || p_creation_key, 0)
  );
  select *
  into v_existing
  from brrrdle_private.amordle_combat_authority authority
  where authority.creation_key = p_creation_key;
  if found then
    if v_existing.player_one_user_id <> v_user_id
      or v_existing.source_kind <> 'public_lobby'
      or v_existing.visibility_kind <> 'public'
      or v_existing.scope <> 'practice'
      or v_existing.mode <> v_mode
      or v_existing.word_length <> p_word_length
      or v_existing.difficulty <> v_difficulty
      or v_existing.hard_mode is distinct from p_hard_mode
      or v_existing.go_puzzle_count is distinct from p_go_puzzle_count
      or v_existing.time_limit_ms is distinct from p_time_limit_ms
      or v_existing.ranked
    then
      raise exception 'IDEMPOTENCY_CONFLICT'
        using errcode = '23505', detail = 'IDEMPOTENCY_CONFLICT';
    end if;
    return brrrdle_private.amordle_participant_projection(
      v_existing.game_id,
      v_user_id
    ) || jsonb_build_object('idempotent', true);
  end if;

  if (
    select count(*)
    from brrrdle_private.amordle_combat_authority authority
    where authority.player_one_user_id = v_user_id
      and authority.source_kind = 'public_lobby'
      and authority.status = 'waiting'
  ) >= 5 then
    raise exception 'ACTIVE_LIMIT'
      using errcode = '54000', detail = 'ACTIVE_LIMIT';
  end if;

  v_game_id := 'amordle-public-practice-v3-' || extensions.gen_random_uuid()::text;
  perform brrrdle_private.amordle_create_combat_v3(
    v_game_id,
    p_creation_key,
    'public_lobby',
    'public',
    'practice',
    v_mode,
    p_word_length,
    v_difficulty,
    p_hard_mode,
    p_go_puzzle_count,
    p_time_limit_ms,
    false,
    null,
    v_user_id,
    null,
    'waiting'
  );
  return brrrdle_private.amordle_participant_projection(v_game_id, v_user_id)
    || jsonb_build_object('idempotent', false);
end;
$$;

create or replace function public.list_amordle_public_practice_v3(
  p_limit integer default 50
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
    'scope', 'practice',
    'mode', authority.mode,
    'status', 'waiting',
    'version', authority.version,
    'moveCount', authority.move_count,
    'wordLength', authority.word_length,
    'difficulty', authority.difficulty,
    'hardMode', authority.hard_mode,
    'goPuzzleCount', authority.go_puzzle_count,
    'timeLimitMs', authority.time_limit_ms,
    'ranked', false,
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
  left join public.public_player_profiles profile
    on profile.user_id = authority.player_one_user_id
    and profile.visibility = 'public'
    and profile.moderation_status = 'active'
  where auth.uid() is not null
    and authority.source_kind = 'public_lobby'
    and authority.visibility_kind = 'public'
    and authority.scope = 'practice'
    and authority.ranked = false
    and authority.status = 'waiting'
    and authority.player_two_user_id is null
    and not exists (
      select 1
      from public.multiplayer_private_request_blocks block_row
      where (
        block_row.blocker_user_id = auth.uid()
        and block_row.blocked_user_id = authority.player_one_user_id
      ) or (
        block_row.blocker_user_id = authority.player_one_user_id
        and block_row.blocked_user_id = auth.uid()
      )
    )
  order by authority.created_at, authority.game_id
  limit least(greatest(coalesce(p_limit, 50), 0), 100)
$$;

create or replace function public.join_amordle_public_practice_v3(
  p_game_id text,
  p_expected_version integer,
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
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000', detail = 'AUTH_REQUIRED';
  end if;
  if nullif(btrim(coalesce(p_game_id, '')), '') is null
    or nullif(btrim(coalesce(p_action_id, '')), '') is null
    or length(p_action_id) > 200
    or p_expected_version is null
  then
    raise exception 'INVALID_ARGUMENT'
      using errcode = '22023', detail = 'INVALID_ARGUMENT';
  end if;

  select *
  into v_authority
  from brrrdle_private.amordle_combat_authority authority
  where authority.game_id = p_game_id
  for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002', detail = 'NOT_FOUND';
  end if;
  if v_authority.player_two_user_id = v_user_id then
    return brrrdle_private.amordle_participant_projection(p_game_id, v_user_id)
      || jsonb_build_object('idempotent', true);
  end if;
  if v_authority.source_kind <> 'public_lobby'
    or v_authority.visibility_kind <> 'public'
    or v_authority.scope <> 'practice'
    or v_authority.ranked
    or v_authority.status <> 'waiting'
    or v_authority.player_two_user_id is not null
  then
    raise exception 'NOT_JOINABLE'
      using errcode = '22023', detail = 'NOT_JOINABLE';
  end if;
  if v_authority.player_one_user_id = v_user_id then
    raise exception 'SAME_PARTICIPANT'
      using errcode = '42501', detail = 'SAME_PARTICIPANT';
  end if;
  if exists (
    select 1
    from public.multiplayer_private_request_blocks block_row
    where (
      block_row.blocker_user_id = v_user_id
      and block_row.blocked_user_id = v_authority.player_one_user_id
    ) or (
      block_row.blocker_user_id = v_authority.player_one_user_id
      and block_row.blocked_user_id = v_user_id
    )
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'BLOCKED';
  end if;
  if v_authority.version <> p_expected_version then
    raise exception 'STATE_CONFLICT'
      using errcode = '40001', detail = 'STATE_CONFLICT';
  end if;

  update brrrdle_private.amordle_combat_authority
  set
    player_two_user_id = v_user_id,
    status = 'playing',
    player_one_time_remaining_ms = time_limit_ms,
    player_two_time_remaining_ms = time_limit_ms,
    turn_started_at = case when time_limit_ms is not null then v_now else null end,
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

  return brrrdle_private.amordle_participant_projection(p_game_id, v_user_id)
    || jsonb_build_object('idempotent', false);
end;
$$;

create or replace function public.accept_private_multiplayer_match_request_v3(
  p_request_id text,
  p_action_id text
)
returns table (
  request_id text,
  request_status text,
  viewer_role text,
  viewer_can_accept boolean,
  viewer_can_cancel boolean,
  viewer_can_decline boolean,
  mode text,
  word_length integer,
  hard_mode boolean,
  time_limit_ms integer,
  go_puzzle_count integer,
  created_game_id text,
  created_at timestamptz,
  expires_at timestamptz,
  responded_at timestamptz,
  updated_at timestamptz,
  created boolean,
  idempotent boolean,
  requester_identity_available boolean,
  requester_public_profile_id uuid,
  requester_display_name text,
  requester_accent_color text,
  requester_flair_key text,
  requester_avatar_url text,
  requester_profile_updated_at timestamptz,
  opponent_identity_available boolean,
  opponent_public_profile_id uuid,
  opponent_display_name text,
  opponent_accent_color text,
  opponent_flair_key text,
  opponent_avatar_url text,
  opponent_profile_updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.multiplayer_private_match_requests%rowtype;
  v_game_id text;
  v_creation_key text;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000', detail = 'AUTH_REQUIRED';
  end if;
  if nullif(btrim(coalesce(p_request_id, '')), '') is null
    or nullif(btrim(coalesce(p_action_id, '')), '') is null
    or length(p_action_id) > 200
  then
    raise exception 'INVALID_ARGUMENT'
      using errcode = '22023', detail = 'INVALID_ARGUMENT';
  end if;
  perform public.phase40_expire_private_match_requests();
  select *
  into v_request
  from public.multiplayer_private_match_requests request_row
  where request_row.id = p_request_id
  for update;
  if not found or v_user_id <> v_request.opponent_user_id then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'FORBIDDEN';
  end if;
  if v_request.status = 'created' and v_request.created_game_id is not null then
    return query
    select *
    from public.phase40_private_match_request_response(
      v_request.id,
      v_user_id,
      false,
      true
    );
    return;
  end if;
  if v_request.status <> 'requested' or v_request.expires_at <= now() then
    raise exception 'NOT_ACCEPTABLE'
      using errcode = '22023', detail = 'NOT_ACCEPTABLE';
  end if;
  if v_request.time_limit_ms is not null and v_request.time_limit_ms <> 300000
    or (v_request.mode = 'go' and v_request.go_puzzle_count not in (5, 7, 10))
  then
    raise exception 'UNSUPPORTED_CONFIGURATION'
      using errcode = '22023', detail = 'UNSUPPORTED_CONFIGURATION';
  end if;
  if not exists (
    select 1
    from public.public_player_profiles profile
    where profile.user_id = v_request.requester_user_id
      and profile.public_profile_id = v_request.requester_public_profile_id
      and profile.visibility = 'public'
      and profile.moderation_status = 'active'
  ) or not exists (
    select 1
    from public.public_player_profiles profile
    where profile.user_id = v_request.opponent_user_id
      and profile.public_profile_id = v_request.opponent_public_profile_id
      and profile.visibility = 'public'
      and profile.moderation_status = 'active'
  ) or exists (
    select 1
    from public.multiplayer_private_request_blocks block_row
    where (
      block_row.blocker_user_id = v_request.requester_user_id
      and block_row.blocked_user_id = v_request.opponent_user_id
    ) or (
      block_row.blocker_user_id = v_request.opponent_user_id
      and block_row.blocked_user_id = v_request.requester_user_id
    )
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'FORBIDDEN';
  end if;

  v_game_id := 'amordle-private-v3-' || extensions.gen_random_uuid()::text;
  v_creation_key := 'private-request-v3:' || v_request.id;
  perform brrrdle_private.amordle_create_combat_v3(
    v_game_id,
    v_creation_key,
    'private_request',
    'restricted',
    'practice',
    v_request.mode,
    v_request.word_length,
    'standard',
    v_request.hard_mode,
    v_request.go_puzzle_count,
    v_request.time_limit_ms,
    false,
    null,
    v_request.requester_user_id,
    v_request.opponent_user_id,
    'playing'
  );

  update public.multiplayer_private_match_requests request_row
  set
    status = 'created',
    created_game_id = v_game_id,
    accept_idempotency_key = p_action_id,
    responded_at = now(),
    updated_at = now()
  where request_row.id = v_request.id;

  return query
  select *
  from public.phase40_private_match_request_response(
    v_request.id,
    v_user_id,
    true,
    false
  );
end;
$$;

create or replace function public.accept_practice_multiplayer_rematch_v3(
  p_request_id text,
  p_action_id text
)
returns table (
  request_id text,
  source_game_id text,
  request_status text,
  requester_seat text,
  opponent_seat text,
  viewer_role text,
  viewer_can_accept boolean,
  viewer_can_cancel boolean,
  mode text,
  word_length integer,
  hard_mode boolean,
  time_limit_ms integer,
  go_puzzle_count integer,
  created_game_id text,
  created_at timestamptz,
  expires_at timestamptz,
  responded_at timestamptz,
  updated_at timestamptz,
  created boolean,
  idempotent boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.multiplayer_practice_rematch_requests%rowtype;
  v_game_id text;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000', detail = 'AUTH_REQUIRED';
  end if;
  if nullif(btrim(coalesce(p_request_id, '')), '') is null
    or nullif(btrim(coalesce(p_action_id, '')), '') is null
    or length(p_action_id) > 200
  then
    raise exception 'INVALID_ARGUMENT'
      using errcode = '22023', detail = 'INVALID_ARGUMENT';
  end if;
  perform public.phase31_expire_practice_rematch_requests();
  select *
  into v_request
  from public.multiplayer_practice_rematch_requests request_row
  where request_row.id = p_request_id
  for update;
  if not found or v_user_id <> v_request.opponent_user_id then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'FORBIDDEN';
  end if;
  if v_request.status = 'created' and v_request.created_game_id is not null then
    return query
    select *
    from public.phase31_practice_rematch_response(
      v_request.id,
      v_user_id,
      false,
      true
    );
    return;
  end if;
  if v_request.status <> 'requested' or v_request.expires_at <= now() then
    raise exception 'NOT_ACCEPTABLE'
      using errcode = '22023', detail = 'NOT_ACCEPTABLE';
  end if;
  if v_request.time_limit_ms is not null and v_request.time_limit_ms <> 300000
    or (v_request.mode = 'go' and v_request.go_puzzle_count not in (5, 7, 10))
  then
    raise exception 'UNSUPPORTED_CONFIGURATION'
      using errcode = '22023', detail = 'UNSUPPORTED_CONFIGURATION';
  end if;
  if exists (
    select 1
    from public.multiplayer_private_request_blocks block_row
    where (
      block_row.blocker_user_id = v_request.requester_user_id
      and block_row.blocked_user_id = v_request.opponent_user_id
    ) or (
      block_row.blocker_user_id = v_request.opponent_user_id
      and block_row.blocked_user_id = v_request.requester_user_id
    )
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'BLOCKED';
  end if;

  v_game_id := 'amordle-rematch-v3-' || extensions.gen_random_uuid()::text;
  perform brrrdle_private.amordle_create_combat_v3(
    v_game_id,
    'rematch-v3:' || v_request.id,
    'rematch',
    'restricted',
    'practice',
    v_request.mode,
    v_request.word_length,
    'standard',
    v_request.hard_mode,
    v_request.go_puzzle_count,
    v_request.time_limit_ms,
    false,
    null,
    v_request.player_one_user_id,
    v_request.player_two_user_id,
    'playing'
  );

  update public.multiplayer_practice_rematch_requests request_row
  set
    status = 'created',
    created_game_id = v_game_id,
    accept_idempotency_key = p_action_id,
    responded_at = now(),
    updated_at = now()
  where request_row.id = v_request.id;

  return query
  select *
  from public.phase31_practice_rematch_response(
    v_request.id,
    v_user_id,
    true,
    false
  );
end;
$$;

-- Ranked Daily status is participant-relative and never returns raw Auth IDs,
-- rating snapshots, or reservation-private fields.
create or replace function public.get_amordle_ranked_daily_status_v3(
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.multiplayer_matchmaking_queue%rowtype;
  v_reservation brrrdle_private.ranked_daily_pair_reservations%rowtype;
  v_viewer_seat text;
  v_opponent_id uuid;
  v_profile public.public_player_profiles%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000', detail = 'AUTH_REQUIRED';
  end if;
  select *
  into v_request
  from public.multiplayer_matchmaking_queue request_row
  where request_row.id = p_request_id;
  if not found or v_request.user_id <> v_user_id
    or v_request.transport <> 'async'
    or v_request.scope <> 'daily'
    or not v_request.ranked
  then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'FORBIDDEN';
  end if;

  if v_request.status = 'matched' then
    select *
    into v_reservation
    from brrrdle_private.ranked_daily_pair_reservations reservation
    where reservation.game_id = coalesce(
      nullif(v_request.matched_game_id, ''),
      nullif(v_request.matched_match_id, '')
    );
    if not found
      or p_request_id not in (v_reservation.request_one_id, v_reservation.request_two_id)
      or v_user_id not in (
        v_reservation.player_one_user_id,
        v_reservation.player_two_user_id
      )
    then
      raise exception 'STATE_CONFLICT'
        using errcode = '40001', detail = 'STATE_CONFLICT';
    end if;
    if v_user_id = v_reservation.player_one_user_id then
      v_viewer_seat := 'player-one';
      v_opponent_id := v_reservation.player_two_user_id;
    else
      v_viewer_seat := 'player-two';
      v_opponent_id := v_reservation.player_one_user_id;
    end if;
    select *
    into v_profile
    from public.public_player_profiles profile
    where profile.user_id = v_opponent_id
      and profile.visibility = 'public'
      and profile.moderation_status = 'active';
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'schemaVersion', 3,
    'requestId', v_request.id,
    'status', v_request.status,
    'matchedGameId', coalesce(v_request.matched_game_id, v_request.matched_match_id),
    'viewerSeat', v_viewer_seat,
    'mode', v_request.mode,
    'scope', v_request.scope,
    'dailyDateKey', v_request.daily_date_key,
    'ratingBucket', brrrdle_private.amordle_app_bucket(v_request.rating_bucket),
    'wordLength', v_request.word_length,
    'hardMode', v_request.hard_mode,
    'timeLimitMs', v_request.time_limit_ms,
    'queuedAt', v_request.queued_at,
    'matchedAt', v_request.matched_at,
    'expiresAt', v_request.expires_at,
    'opponent', case when v_opponent_id is null then null else
      jsonb_strip_nulls(jsonb_build_object(
        'publicProfileId', v_profile.public_profile_id,
        'displayName', coalesce(nullif(v_profile.display_name, ''), 'Opponent'),
        'avatarUrl', nullif(v_profile.avatar_url, ''),
        'accentColor', nullif(v_profile.accent_color, '')
      ))
    end
  ));
end;
$$;

create or replace function public.finalize_amordle_ranked_daily_v3(
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
  v_request public.multiplayer_matchmaking_queue%rowtype;
  v_reservation brrrdle_private.ranked_daily_pair_reservations%rowtype;
  v_daily_authority brrrdle_private.ranked_daily_game_authority%rowtype;
  v_existing brrrdle_private.amordle_combat_authority%rowtype;
  v_revision text;
  v_projection jsonb;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000', detail = 'AUTH_REQUIRED';
  end if;
  if nullif(btrim(coalesce(p_request_id, '')), '') is null
    or nullif(btrim(coalesce(p_game_id, '')), '') is null
    or nullif(btrim(coalesce(p_action_id, '')), '') is null
    or length(p_action_id) > 200
  then
    raise exception 'INVALID_ARGUMENT'
      using errcode = '22023', detail = 'INVALID_ARGUMENT';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('amordle-ranked-daily-v3:' || p_game_id, 0)
  );
  select *
  into v_request
  from public.multiplayer_matchmaking_queue request_row
  where request_row.id = p_request_id
  for update;
  if not found or v_request.user_id <> v_user_id
    or v_request.transport <> 'async'
    or v_request.scope <> 'daily'
    or not v_request.ranked
    or v_request.status <> 'matched'
    or coalesce(
      nullif(v_request.matched_game_id, ''),
      nullif(v_request.matched_match_id, '')
    ) <> p_game_id
  then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'FORBIDDEN';
  end if;
  select *
  into v_reservation
  from brrrdle_private.ranked_daily_pair_reservations reservation
  where reservation.game_id = p_game_id
  for update;
  if not found
    or p_request_id not in (v_reservation.request_one_id, v_reservation.request_two_id)
    or v_user_id not in (
      v_reservation.player_one_user_id,
      v_reservation.player_two_user_id
    )
  then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'FORBIDDEN';
  end if;

  select *
  into v_existing
  from brrrdle_private.amordle_combat_authority authority
  where authority.game_id = p_game_id;
  if found then
    return brrrdle_private.amordle_participant_projection(p_game_id, v_user_id)
      || jsonb_build_object('idempotent', true);
  end if;

  -- The retained phase-55 finalizer is invoked only inside this transaction
  -- with a server-built compatibility projection. Raw identities never cross
  -- the browser boundary, and the public row is scrubbed before commit.
  v_projection := jsonb_build_object(
    'id', v_reservation.game_id,
    'mode', v_reservation.mode,
    'scope', 'daily',
    'dailyDateKey', v_reservation.daily_date_key,
    'ranked', true,
    'ratingBucket', brrrdle_private.amordle_app_bucket(v_reservation.rating_bucket),
    'wordLength', 5,
    'difficulty', 'expert',
    'hardMode', v_reservation.hard_mode,
    'timeLimitMs', null,
    'customGameCode', null,
    'goPuzzleCount', case when v_reservation.mode = 'go' then 5 else null end,
    'playerUserIds', jsonb_build_object(
      'player-one', v_reservation.player_one_user_id,
      'player-two', v_reservation.player_two_user_id
    ),
    'moves', '[]'::jsonb
  );
  perform public.finalize_ranked_async_matchmaking_game_v2(
    p_request_id,
    p_game_id,
    v_projection,
    'phase55-ranked-daily-v1:finalize:' || p_game_id
  );

  select *
  into v_daily_authority
  from brrrdle_private.ranked_daily_game_authority authority
  where authority.game_id = p_game_id
  for update;
  if not found then
    raise exception 'STATE_CONFLICT'
      using errcode = '40001', detail = 'MISSING_DAILY_AUTHORITY';
  end if;
  if exists (
    select 1
    from brrrdle_private.ranked_daily_action_ledger action
    where action.game_id = p_game_id
  ) then
    raise exception 'LEGACY_GAME_IN_PROGRESS'
      using errcode = '22023', detail = 'LEGACY_GAME_IN_PROGRESS';
  end if;
  select max(catalog.revision)
  into v_revision
  from brrrdle_private.amordle_word_catalogs catalog
  where catalog.word_length = 5;
  if v_revision is null then
    raise exception 'WORD_CATALOG_UNAVAILABLE'
      using errcode = '55000', detail = 'WORD_CATALOG_UNAVAILABLE';
  end if;

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
    started_at,
    updated_at
  ) values (
    p_game_id,
    'ranked-daily-v3:' || p_game_id,
    'ranked_queue',
    'restricted',
    'daily',
    v_reservation.mode,
    5,
    'expert',
    v_reservation.hard_mode,
    case when v_reservation.mode = 'go' then 5 else null end,
    null,
    true,
    v_reservation.rating_bucket,
    v_revision,
    v_daily_authority.answers,
    v_reservation.player_one_user_id,
    v_reservation.player_two_user_id,
    'playing',
    'player-one',
    v_reservation.matched_at,
    v_reservation.matched_at,
    v_now
  );

  update public.async_multiplayer_games public_game
  set
    authority_version = 2,
    source_kind = 'ranked_queue',
    visibility_kind = 'restricted',
    state_version = 0,
    move_count = 0,
    status = 'playing',
    current_turn = 'player-one',
    projection = jsonb_build_object(
      'schemaVersion', 2,
      'authorityVersion', 2,
      'id', p_game_id,
      'scope', 'daily',
      'mode', v_reservation.mode,
      'dailyDateKey', v_reservation.daily_date_key,
      'sourceKind', 'ranked-queue',
      'visibilityKind', 'restricted',
      'status', 'playing',
      'ranked', true,
      'ratingBucket', brrrdle_private.amordle_app_bucket(v_reservation.rating_bucket),
      'wordLength', 5,
      'difficulty', 'expert',
      'hardMode', v_reservation.hard_mode,
      'goPuzzleCount', case when v_reservation.mode = 'go' then 5 else null end,
      'stateVersion', 0,
      'moveCount', 0,
      'createdAt', v_reservation.matched_at,
      'updatedAt', v_now
    ),
    updated_at = v_now
  where public_game.id = p_game_id;

  return brrrdle_private.amordle_participant_projection(p_game_id, v_user_id)
    || jsonb_build_object('idempotent', false);
end;
$$;

-- Ranked Daily uses the same authoritative settlement verifier and Elo
-- transaction model as Ranked Practice, but retains its independent storage
-- buckets and Daily result scope.
create or replace function public.settle_amordle_ranked_daily_v3(
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
  v_daily_date_key text;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000', detail = 'AUTH_REQUIRED';
  end if;
  if nullif(btrim(coalesce(p_action_id, '')), '') is null
    or length(p_action_id) > 200
  then
    raise exception 'INVALID_ARGUMENT'
      using errcode = '22023', detail = 'INVALID_ARGUMENT';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('amordle-ranked-daily-settle-v3:' || p_game_id, 0)
  );
  select *
  into v_authority
  from brrrdle_private.amordle_combat_authority authority
  where authority.game_id = p_game_id
  for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002', detail = 'NOT_FOUND';
  end if;
  if v_user_id not in (
      v_authority.player_one_user_id,
      v_authority.player_two_user_id
    )
    or not v_authority.ranked
    or v_authority.source_kind <> 'ranked_queue'
    or v_authority.scope <> 'daily'
    or v_authority.rating_bucket not in (
      'async:og:daily:v1',
      'async:go:daily:v1'
    )
  then
    raise exception 'FORBIDDEN' using errcode = '42501', detail = 'FORBIDDEN';
  end if;
  if v_authority.status <> 'completed' or v_authority.terminal_reason is null then
    raise exception 'SETTLEMENT_INELIGIBLE'
      using errcode = '22023', detail = 'SETTLEMENT_INELIGIBLE';
  end if;
  select public_game.daily_date_key
  into v_daily_date_key
  from public.async_multiplayer_games public_game
  where public_game.id = p_game_id;

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
        select 1
        from jsonb_array_elements(action.tiles) tile
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
    if v_authority.winner_player_id is distinct from (
      case
        when v_left_points > v_right_points then 'player-one'
        when v_right_points > v_left_points then 'player-two'
        else null
      end
    ) then
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
          select 1
          from jsonb_array_elements(action.tiles) tile
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

  v_idempotency_key := 'amordle-ranked-daily-v3:settle:' || p_game_id;
  select *
  into v_result
  from public.multiplayer_match_results result
  where result.idempotency_key = v_idempotency_key;
  if found then
    select
      transaction.old_rating,
      transaction.new_rating,
      transaction.rating_delta,
      transaction.outcome
    into
      v_viewer_old,
      v_viewer_new,
      v_viewer_delta,
      v_viewer_outcome
    from public.multiplayer_rating_transactions transaction
    where transaction.match_result_id = v_result.id
      and transaction.user_id = v_user_id;
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
    and profile.user_id in (
      v_authority.player_one_user_id,
      v_authority.player_two_user_id
    )
  order by profile.user_id
  for update;
  select *
  into v_left_profile
  from public.multiplayer_rating_profiles profile
  where profile.user_id = v_authority.player_one_user_id
    and profile.bucket = v_authority.rating_bucket;
  select *
  into v_right_profile
  from public.multiplayer_rating_profiles profile
  where profile.user_id = v_authority.player_two_user_id
    and profile.bucket = v_authority.rating_bucket;

  if v_authority.winner_player_id = 'player-one' then
    v_left_score := 1;
    v_right_score := 0;
    v_left_outcome := 'win';
    v_right_outcome := 'loss';
  elsif v_authority.winner_player_id = 'player-two' then
    v_left_score := 0;
    v_right_score := 1;
    v_left_outcome := 'loss';
    v_right_outcome := 'win';
  else
    v_left_score := 0.5;
    v_right_score := 0.5;
    v_left_outcome := 'draw';
    v_right_outcome := 'draw';
  end if;
  v_left_expected := 1 / (
    1 + power(
      10::numeric,
      (v_right_profile.rating - v_left_profile.rating)::numeric / 400
    )
  );
  v_right_expected := 1 - v_left_expected;
  v_left_k := case when v_left_profile.games_played < 10 then 40 else 24 end;
  v_right_k := case when v_right_profile.games_played < 10 then 40 else 24 end;
  v_left_delta := round(v_left_k * (v_left_score - v_left_expected))::integer;
  v_right_delta := round(v_right_k * (v_right_score - v_right_expected))::integer;

  select
    count(*)::integer,
    count(*) filter (
      where not exists (
        select 1
        from jsonb_array_elements(action.tiles) tile
        where tile ->> 'state' <> 'correct'
      )
    )::integer
  into v_left_attempts, v_left_solved
  from brrrdle_private.amordle_combat_action_ledger action
  where action.game_id = p_game_id
    and action.action_type = 'guess'
    and action.player_id = 'player-one';
  select
    count(*)::integer,
    count(*) filter (
      where not exists (
        select 1
        from jsonb_array_elements(action.tiles) tile
        where tile ->> 'state' <> 'correct'
      )
    )::integer
  into v_right_attempts, v_right_solved
  from brrrdle_private.amordle_combat_action_ledger action
  where action.game_id = p_game_id
    and action.action_type = 'guess'
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
    'daily',
    v_daily_date_key,
    true,
    v_authority.rating_bucket,
    'completed',
    case v_authority.winner_player_id
      when 'player-one' then v_authority.player_one_user_id
      when 'player-two' then v_authority.player_two_user_id
      else null
    end,
    'Authoritative Amordle Ranked Daily v3 settlement.',
    v_idempotency_key,
    now()
  )
  returning * into v_result;

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
    (
      v_result.id,
      v_authority.player_one_user_id,
      'player-one',
      v_left_outcome,
      coalesce(v_left_attempts, 0),
      coalesce(v_left_solved, 0),
      v_authority.ended_at,
      'Authoritative Ranked Daily ledger result.'
    ),
    (
      v_result.id,
      v_authority.player_two_user_id,
      'player-two',
      v_right_outcome,
      coalesce(v_right_attempts, 0),
      coalesce(v_right_solved, 0),
      v_authority.ended_at,
      'Authoritative Ranked Daily ledger result.'
    );

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
    idempotency_key
  ) values
    (
      v_result.id,
      v_authority.rating_bucket,
      v_authority.player_one_user_id,
      v_authority.player_two_user_id,
      v_left_outcome,
      v_left_profile.rating,
      v_left_profile.rating + v_left_delta,
      v_left_delta,
      v_left_expected,
      v_idempotency_key || ':player-one'
    ),
    (
      v_result.id,
      v_authority.rating_bucket,
      v_authority.player_two_user_id,
      v_authority.player_one_user_id,
      v_right_outcome,
      v_right_profile.rating,
      v_right_profile.rating + v_right_delta,
      v_right_delta,
      v_right_expected,
      v_idempotency_key || ':player-two'
    );

  update public.multiplayer_rating_profiles
  set
    rating = rating + case
      when user_id = v_authority.player_one_user_id
        then v_left_delta
      else v_right_delta
    end,
    games_played = games_played + 1,
    wins = wins + case
      when (
        user_id = v_authority.player_one_user_id
        and v_left_outcome = 'win'
      ) or (
        user_id = v_authority.player_two_user_id
        and v_right_outcome = 'win'
      ) then 1 else 0
    end,
    losses = losses + case
      when (
        user_id = v_authority.player_one_user_id
        and v_left_outcome = 'loss'
      ) or (
        user_id = v_authority.player_two_user_id
        and v_right_outcome = 'loss'
      ) then 1 else 0
    end,
    draws = draws + case when v_left_outcome = 'draw' then 1 else 0 end,
    provisional = games_played + 1 < 10,
    updated_at = now()
  where bucket = v_authority.rating_bucket
    and user_id in (
      v_authority.player_one_user_id,
      v_authority.player_two_user_id
    );

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

create or replace function public.get_amordle_public_practice_spectator_v3(
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
      least(
        greatest(coalesce(p_terminal_window_seconds, 15), 0),
        30
      )::integer as terminal_window_seconds
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

comment on function public.create_amordle_public_practice_v3(
  text, integer, text, boolean, integer, integer, text
) is
  'Creates an answerless public unranked Practice lobby backed by private Amordle authority v3.';
comment on function public.list_amordle_public_practice_v3(integer) is
  'Lists safe, block-compatible, joinable public Practice authority v3 lobbies.';
comment on function public.join_amordle_public_practice_v3(
  text, integer, text
) is
  'Atomically joins a waiting public Practice authority v3 lobby.';
comment on function public.accept_private_multiplayer_match_request_v3(
  text, text
) is
  'Accepts one private request and server-creates an answerless restricted authority game.';
comment on function public.accept_practice_multiplayer_rematch_v3(
  text, text
) is
  'Accepts one Practice rematch and server-creates exactly one answerless restricted authority game.';
comment on function public.get_amordle_ranked_daily_status_v3(text) is
  'Returns participant-relative Ranked Daily queue status without raw Auth identifiers.';
comment on function public.finalize_amordle_ranked_daily_v3(
  text, text, text
) is
  'Finalizes a Ranked Daily reservation into Amordle authority without browser-authored projections.';
comment on function public.settle_amordle_ranked_daily_v3(text, text) is
  'Idempotently settles authoritative Ranked Daily rating and result records.';
comment on function public.get_amordle_public_practice_spectator_v3(
  text, integer, integer
) is
  'Returns read-only projections for active or recently terminal public unranked Practice authority games only.';

revoke all on function brrrdle_private.amordle_create_combat_v3(
  text, text, text, text, text, text, integer, text, boolean, integer,
  integer, boolean, text, uuid, uuid, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.create_amordle_public_practice_v3(
  text, integer, text, boolean, integer, integer, text
) from public, anon, authenticated;
revoke all on function public.list_amordle_public_practice_v3(integer)
  from public, anon, authenticated;
revoke all on function public.join_amordle_public_practice_v3(
  text, integer, text
) from public, anon, authenticated;
revoke all on function public.accept_private_multiplayer_match_request_v3(
  text, text
) from public, anon, authenticated;
revoke all on function public.accept_practice_multiplayer_rematch_v3(
  text, text
) from public, anon, authenticated;
revoke all on function public.get_amordle_ranked_daily_status_v3(text)
  from public, anon, authenticated;
revoke all on function public.finalize_amordle_ranked_daily_v3(
  text, text, text
) from public, anon, authenticated;
revoke all on function public.settle_amordle_ranked_daily_v3(text, text)
  from public, anon, authenticated;
revoke all on function public.get_amordle_public_practice_spectator_v3(
  text, integer, integer
) from public, anon, authenticated;

grant execute on function public.create_amordle_public_practice_v3(
  text, integer, text, boolean, integer, integer, text
) to authenticated;
grant execute on function public.list_amordle_public_practice_v3(integer)
  to authenticated;
grant execute on function public.join_amordle_public_practice_v3(
  text, integer, text
) to authenticated;
grant execute on function public.accept_private_multiplayer_match_request_v3(
  text, text
) to authenticated;
grant execute on function public.accept_practice_multiplayer_rematch_v3(
  text, text
) to authenticated;
grant execute on function public.get_amordle_ranked_daily_status_v3(text)
  to authenticated;
grant execute on function public.finalize_amordle_ranked_daily_v3(
  text, text, text
) to authenticated;
grant execute on function public.settle_amordle_ranked_daily_v3(text, text)
  to authenticated;
grant execute on function public.get_amordle_public_practice_spectator_v3(
  text, integer, integer
) to anon, authenticated;

revoke all on all tables in schema brrrdle_private
  from public, anon, authenticated;
