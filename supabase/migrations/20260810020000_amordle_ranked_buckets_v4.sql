-- Amordle v8 Cycle C: ranked standardisation, the rating-bucket authority, and
-- settlement that cannot be declined.
--
-- Authorised by the owner against reports/v8-cycle-c-migration-decision-2026-08-10.md.
-- Forward-only, single transaction, no table dropped and no column removed.
--
-- Five things happen here:
--
--   1. A rating-bucket table becomes the single authority for which buckets exist and
--      which clocks are playable. Five hand-written twelve-literal CHECK constraints
--      become foreign keys to it.
--   2. Ranked Practice is standardised to one comparable format.
--   3. The clock ladder widens from two options to seven.
--   4. Rating settlement moves into the terminal path, so a result cannot be declined
--      by closing a browser.
--   5. The existing ranked rating rows are deleted and any ranked game still in flight
--      is cancelled.
--
-- The destructive step in (5) is safe because every one of those rows is automated-test
-- residue: twelve rating profiles, all with games_played = 1, all at exactly 1180 or
-- 1220, all still provisional, two of them still naming buckets renamed in July.

-- ---------------------------------------------------------------------------
-- 1. The rating-bucket authority
-- ---------------------------------------------------------------------------

create table if not exists brrrdle_private.amordle_rating_bucket (
  bucket text primary key,
  scope text not null check (scope in ('practice', 'daily', 'legacy')),
  mode text not null check (mode in ('og', 'go')),
  -- Null is untimed. `is not distinct from` is used everywhere this is compared, so a
  -- null clock is a value rather than an absence.
  time_limit_ms integer check (time_limit_ms is null or time_limit_ms > 0),
  hard_mode boolean not null,
  -- Retired buckets stay as inactive rows so historical games keep referential
  -- integrity. Nothing new may be created in them.
  active boolean not null default true,
  sort_order integer not null default 0
);

revoke all on table brrrdle_private.amordle_rating_bucket from public, anon, authenticated;

-- Retired names. Present so the eight historical ranked games and the rows that
-- reference them satisfy the foreign keys added below; inactive so nothing new lands
-- in them.
insert into brrrdle_private.amordle_rating_bucket
  (bucket, scope, mode, time_limit_ms, hard_mode, active, sort_order)
values
  ('async:og', 'legacy', 'og', null, false, false, 0),
  ('async:go', 'legacy', 'go', null, false, false, 0),
  ('live:og', 'legacy', 'og', null, false, false, 0),
  ('live:go', 'legacy', 'go', null, false, false, 0),
  ('async:og:timed:v1', 'legacy', 'og', 300000, false, false, 0),
  ('async:go:timed:v1', 'legacy', 'go', 300000, false, false, 0),
  ('async:og:amordle:v2', 'legacy', 'og', null, false, false, 0),
  ('async:go:amordle:v2', 'legacy', 'go', null, false, false, 0),
  ('async:og:timed:amordle:v2', 'legacy', 'og', 300000, false, false, 0),
  ('async:go:timed:amordle:v2', 'legacy', 'go', 300000, false, false, 0),
  ('async:og:daily:v1', 'daily', 'og', null, false, true, 10),
  ('async:go:daily:v1', 'daily', 'go', null, false, true, 11)
on conflict (bucket) do nothing;

-- The 28 ranked Practice buckets: seven whole-match clocks x two modes x hard mode.
-- Generated rather than enumerated, so the ladder is stated once.
insert into brrrdle_private.amordle_rating_bucket
  (bucket, scope, mode, time_limit_ms, hard_mode, active, sort_order)
select
  format(
    'async:%s:%s:%s:v4',
    clock.mode,
    clock.label,
    case when hard.hard_mode then 'hard' else 'std' end
  ),
  'practice',
  clock.mode,
  clock.time_limit_ms,
  hard.hard_mode,
  true,
  clock.sort_order * 10 + case when clock.mode = 'go' then 1 else 0 end
from (
  select
    ladder.label,
    ladder.time_limit_ms,
    ladder.sort_order,
    mode.mode
  from (
    values
      ('untimed', null::integer, 100),
      ('1m', 60000, 110),
      ('3m', 180000, 120),
      ('5m', 300000, 130),
      ('10m', 600000, 140),
      ('20m', 1200000, 150),
      ('45m', 2700000, 160)
  ) as ladder(label, time_limit_ms, sort_order)
  cross join (values ('og'), ('go')) as mode(mode)
) as clock
cross join (values (false), (true)) as hard(hard_mode)
on conflict (bucket) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Foreign keys in place of the five hand-written allowlists
-- ---------------------------------------------------------------------------
--
-- Each of these tables carried its own copy of the same twelve-literal CHECK. Going to
-- 28 buckets would have made them 40-entry arrays five times over, and Cycle D would
-- have meant editing all five again. A foreign key is enforced continuously, fails
-- loudly, and grows by inserting a row.

do $$
begin
  alter table public.async_multiplayer_games
    drop constraint if exists async_multiplayer_games_rating_bucket_check;
  alter table public.async_multiplayer_games
    drop constraint if exists async_multiplayer_games_rating_bucket_fkey;
  alter table public.async_multiplayer_games
    add constraint async_multiplayer_games_rating_bucket_fkey
    foreign key (rating_bucket) references brrrdle_private.amordle_rating_bucket (bucket);

  alter table public.multiplayer_matchmaking_queue
    drop constraint if exists multiplayer_matchmaking_queue_rating_bucket_check;
  alter table public.multiplayer_matchmaking_queue
    drop constraint if exists multiplayer_matchmaking_queue_rating_bucket_fkey;
  alter table public.multiplayer_matchmaking_queue
    add constraint multiplayer_matchmaking_queue_rating_bucket_fkey
    foreign key (rating_bucket) references brrrdle_private.amordle_rating_bucket (bucket);

  alter table public.multiplayer_rating_profiles
    drop constraint if exists multiplayer_rating_profiles_bucket_check;
  alter table public.multiplayer_rating_profiles
    drop constraint if exists multiplayer_rating_profiles_bucket_fkey;
  alter table public.multiplayer_rating_profiles
    add constraint multiplayer_rating_profiles_bucket_fkey
    foreign key (bucket) references brrrdle_private.amordle_rating_bucket (bucket);

  alter table public.multiplayer_match_results
    drop constraint if exists multiplayer_match_results_rating_bucket_check;
  alter table public.multiplayer_match_results
    drop constraint if exists multiplayer_match_results_rating_bucket_fkey;
  alter table public.multiplayer_match_results
    add constraint multiplayer_match_results_rating_bucket_fkey
    foreign key (rating_bucket) references brrrdle_private.amordle_rating_bucket (bucket);

  alter table public.multiplayer_rating_transactions
    drop constraint if exists multiplayer_rating_transactions_bucket_check;
  alter table public.multiplayer_rating_transactions
    drop constraint if exists multiplayer_rating_transactions_bucket_fkey;
  alter table public.multiplayer_rating_transactions
    add constraint multiplayer_rating_transactions_bucket_fkey
    foreign key (bucket) references brrrdle_private.amordle_rating_bucket (bucket);
end
$$;

-- ---------------------------------------------------------------------------
-- 3. The bucket functions read the authority
-- ---------------------------------------------------------------------------
--
-- `stable`, not `immutable`, because they read a table now. That is safe here: both are
-- called only from inside plpgsql bodies, never in an index expression or a generated
-- column, which was verified before this was written.

create or replace function brrrdle_private.amordle_storage_bucket(
  p_mode text,
  p_time_limit_ms integer,
  p_hard_mode boolean
)
returns text
language sql
stable
set search_path = ''
as $$
  select bucket
  from brrrdle_private.amordle_rating_bucket
  where scope = 'practice'
    and active
    and mode = lower(coalesce(p_mode, ''))
    and time_limit_ms is not distinct from p_time_limit_ms
    and hard_mode = coalesce(p_hard_mode, false)
$$;

-- The two-argument form is kept so nothing that still calls it breaks mid-migration.
-- It resolves to the standard-mode bucket, which is what its callers meant when hard
-- mode was not part of a bucket's identity.
create or replace function brrrdle_private.amordle_storage_bucket(
  p_mode text,
  p_time_limit_ms integer
)
returns text
language sql
stable
set search_path = ''
as $$
  select brrrdle_private.amordle_storage_bucket(p_mode, p_time_limit_ms, false)
$$;

-- The client-facing name. Retired buckets keep their historical app names so old
-- results still render; v4 buckets derive theirs from the row.
create or replace function brrrdle_private.amordle_app_bucket(p_storage_bucket text)
returns text
language sql
stable
set search_path = ''
as $$
  select case coalesce(p_storage_bucket, '')
    when 'async:og:amordle:v2' then 'multiplayer:og'
    when 'async:go:amordle:v2' then 'multiplayer:go'
    when 'async:og:timed:amordle:v2' then 'multiplayer:og:timed:v1'
    when 'async:go:timed:amordle:v2' then 'multiplayer:go:timed:v1'
    when 'async:og:daily:v1' then 'multiplayer:og:daily:v1'
    when 'async:go:daily:v1' then 'multiplayer:go:daily:v1'
    else (
      select 'multiplayer:' || b.mode || ':'
        || split_part(b.bucket, ':', 3) || ':'
        || case when b.hard_mode then 'hard' else 'std' end
      from brrrdle_private.amordle_rating_bucket b
      where b.bucket = p_storage_bucket and b.scope = 'practice'
    )
  end
$$;

-- Is this clock offered at all? One authority for every validator that used to compare
-- against a hardcoded 300000.
create or replace function brrrdle_private.amordle_clock_is_playable(p_time_limit_ms integer)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from brrrdle_private.amordle_rating_bucket
    where active
      and scope = 'practice'
      and time_limit_ms is not distinct from p_time_limit_ms
  )
$$;

-- ---------------------------------------------------------------------------
-- 4. The functions that read the authority
-- ---------------------------------------------------------------------------
--
-- Each of these is reproduced from its current definition with a targeted change, so
-- what is not mentioned here is byte-identical to what is deployed today:
--
--   * the ranked request validator gains the standardisation and the hard-mode bucket;
--   * four validators that compared against a literal 300000 now ask the authority
--     whether a clock is playable, which widens unranked and private play to the same
--     seven clocks rather than leaving them on the old two;
--   * the command function settles a ranked practice game the moment it goes terminal.

-- >>> ranked request validator
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
  v_bucket := brrrdle_private.amordle_storage_bucket(v_mode, p_time_limit_ms, p_hard_mode);
  if nullif(p_creation_key, '') is null or length(p_creation_key) > 200
    or v_mode not in ('og', 'go')
    -- v8-C. Ranked is one comparable format. A rating only means something if
    -- everyone competing for it is playing the same game; leaving length and
    -- difficulty open would shard it into thousands of permanently empty pools.
    -- Unranked and private matches are untouched and keep every option.
    or p_word_length <> 5
    or v_difficulty <> 'expert'
    or p_hard_mode is null
    or v_bucket is null
    or (v_mode = 'og' and p_go_puzzle_count is not null)
    or (v_mode = 'go' and p_go_puzzle_count <> 5)
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

-- >>> clock ladder :: create combat
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
    or not brrrdle_private.amordle_clock_is_playable(p_time_limit_ms)
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

-- >>> clock ladder :: public practice
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
    or not brrrdle_private.amordle_clock_is_playable(p_time_limit_ms)
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

-- >>> clock ladder :: private accept
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
  if not brrrdle_private.amordle_clock_is_playable(v_request.time_limit_ms)
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

-- >>> clock ladder :: rematch accept
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
  if not brrrdle_private.amordle_clock_is_playable(v_request.time_limit_ms)
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

-- >>> command settlement
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

      /*
       * v8-C. Settlement happens here, not on a button.
       *
       * Every writer of a rating used to be reachable only from UPDATE RATING, so a
       * losing player could decline the result by closing the tab. The terminal
       * transition is caused by a command, and a command comes through this function,
       * so settling here means the result lands whatever either client does next.
       *
       * Safe to call more than once: the settlement takes an advisory lock on the game
       * and derives its idempotency key internally, so the client-side auto-settle
       * kept from Cycle A is a harmless replay rather than a second application.
       * Failures are swallowed deliberately — a rating that cannot be written must
       * never roll back the move that was legitimately played.
       */
      if v_authority.ranked and v_authority.scope = 'practice' then
        begin
          perform public.settle_amordle_ranked_practice_v2(
            p_game_id,
            p_action_id || ':auto-settle'
          );
        exception
          when others then null;
        end;
      end if;
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

  if v_next_status = 'completed' then

    /*
     * v8-C. Settlement happens here, not on a button.
     *
     * Every writer of a rating used to be reachable only from UPDATE RATING, so a
     * losing player could decline the result by closing the tab. The terminal
     * transition is caused by a command, and a command comes through this function,
     * so settling here means the result lands whatever either client does next.
     *
     * Safe to call more than once: the settlement takes an advisory lock on the game
     * and derives its idempotency key internally, so the client-side auto-settle
     * kept from Cycle A is a harmless replay rather than a second application.
     * Failures are swallowed deliberately — a rating that cannot be written must
     * never roll back the move that was legitimately played.
     */
    if v_authority.ranked and v_authority.scope = 'practice' then
      begin
        perform public.settle_amordle_ranked_practice_v2(
          p_game_id,
          p_action_id || ':auto-settle'
        );
      exception
        when others then null;
      end;
    end if;
  end if;

  return brrrdle_private.amordle_participant_projection(p_game_id, v_user_id)
    || jsonb_build_object('idempotent', false);
end;
$$;

-- >>> site stats bucket filter
create or replace function public.get_public_site_stats_v1()
returns table (
  stats_key text,
  generated_at timestamptz,
  public_profiles_active bigint,
  ranked_practice_public_players bigint,
  ranked_practice_public_player_results bigint,
  ranked_practice_public_og_players bigint,
  ranked_practice_public_go_players bigint,
  leaderboard_updated_at timestamptz,
  public_profiles_updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with active_public_profiles as (
    select
      profile.user_id,
      profile.updated_at
    from public.public_player_profiles as profile
    where profile.visibility = 'public'
      and profile.moderation_status = 'active'
      and profile.display_name is not null
  ),
  eligible_ranked_profiles as (
    select
      rating_profile.user_id,
      rating_profile.bucket,
      rating_profile.games_played,
      rating_profile.updated_at
    from public.multiplayer_rating_profiles as rating_profile
    join active_public_profiles as profile
      on profile.user_id = rating_profile.user_id
    -- v8-C. This filtered the bucket names retired in July, so ranked
    -- participation reported as zero. It reads the authority now.
    where rating_profile.bucket in (
      select bucket from brrrdle_private.amordle_rating_bucket where scope <> 'legacy'
    )
      and rating_profile.games_played > 0
  )
  select
    'site-stats-v1'::text as stats_key,
    now() as generated_at,
    (select count(*) from active_public_profiles)::bigint as public_profiles_active,
    (select count(distinct user_id) from eligible_ranked_profiles)::bigint as ranked_practice_public_players,
    coalesce((select sum(games_played)::bigint from eligible_ranked_profiles), 0::bigint) as ranked_practice_public_player_results,
    (
      select count(distinct user_id)
      from eligible_ranked_profiles
      where bucket = 'async:og'
    )::bigint as ranked_practice_public_og_players,
    (
      select count(distinct user_id)
      from eligible_ranked_profiles
      where bucket = 'async:go'
    )::bigint as ranked_practice_public_go_players,
    (select max(updated_at) from eligible_ranked_profiles) as leaderboard_updated_at,
    (select max(updated_at) from active_public_profiles) as public_profiles_updated_at;
$$;

-- ---------------------------------------------------------------------------
-- 5. Cancel anything in flight, then clear the ranked ratings
-- ---------------------------------------------------------------------------
--
-- A game carries its rating bucket stamped on the row, so a ranked game that was
-- already running would settle into a bucket that is now retired. Cancelling is the
-- honest outcome: a cancelled ranked game never settles a rating, so nobody loses one
-- they earned. At the time this was written exactly one ranked game was live, and it
-- was test residue.

update brrrdle_private.amordle_combat_authority
set
  status = 'cancelled',
  terminal_reason = 'cancelled',
  turn_started_at = null,
  ended_at = now(),
  updated_at = now()
where ranked
  and status in ('waiting', 'playing', 'holding');

update public.async_multiplayer_games
set
  status = 'cancelled',
  ended_at = now(),
  updated_at = now(),
  projection = projection || jsonb_build_object(
    'status', 'cancelled',
    'endedAt', now(),
    'updatedAt', now()
  )
where ranked
  and status in ('waiting', 'playing', 'holding');

-- Outstanding ranked queue requests reference the retired buckets too, and a request
-- that survives would claim into a configuration that no longer validates.
-- The queue table has no `updated_at`; `expires_at` is how a stale request is
-- retired everywhere else, so it is set to now rather than inventing a column.
update public.multiplayer_matchmaking_queue
set status = 'cancelled', expires_at = now()
where status in ('queued', 'matched')
  and rating_bucket not in (
    select bucket from brrrdle_private.amordle_rating_bucket where active
  );

-- The reset. Ranked only: Solo history, Daily history, the game transcripts in
-- `async_multiplayer_games`, profiles, settings, inventory and coins are untouched.
-- Ordered so no foreign key is violated on the way through.
delete from public.multiplayer_rating_transactions;
delete from public.multiplayer_match_results;
delete from public.multiplayer_rating_profiles;
