-- Phase 40 Stage 40.5B: repair private match acceptance so the browser does
-- not need raw auth user ids. Additive migration only.

create or replace function public.accept_private_multiplayer_match_request_v2(
  p_request_id text,
  p_game_projection jsonb,
  p_idempotency_key text default null
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
  v_existing_game public.async_multiplayer_games%rowtype;
  v_game_id text;
  v_current_turn text;
  v_difficulty text;
  v_word_length_text text;
  v_hard_mode_text text;
  v_hard_mode boolean;
  v_time_limit_text text;
  v_time_limit_ms integer;
  v_go_puzzle_count_text text;
  v_go_puzzle_count integer;
  v_accept_key text;
  v_stored_projection jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  if p_game_projection is null or jsonb_typeof(p_game_projection) <> 'object' then
    raise exception 'Private match accept requires a fresh game projection object.' using errcode = '22023';
  end if;

  if p_game_projection ? 'playerUserIds' then
    raise exception 'Private match accept projection must not include browser-supplied player user ids.' using errcode = '22023';
  end if;

  perform public.phase40_expire_private_match_requests();

  select *
  into v_request
  from public.multiplayer_private_match_requests as request_row
  where request_row.id = p_request_id
  for update;

  if not found or v_user_id not in (v_request.requester_user_id, v_request.opponent_user_id) then
    raise exception 'Private match request not found for current user.' using errcode = '42501';
  end if;

  if v_user_id <> v_request.opponent_user_id then
    raise exception 'Only the requested opponent can accept this private match request.' using errcode = '42501';
  end if;

  v_game_id := nullif(btrim(p_game_projection ->> 'id'), '');
  if v_game_id is null then
    raise exception 'Private match accept requires a new game id.' using errcode = '22023';
  end if;

  v_accept_key := coalesce(
    nullif(btrim(p_idempotency_key), ''),
    'phase40-private-request:accept:v2:' || v_request.id || ':' || v_game_id
  );

  if v_request.status = 'created' and v_request.created_game_id is not null then
    if v_request.accept_idempotency_key = v_accept_key or v_request.created_game_id = v_game_id then
      return query
      select *
      from public.phase40_private_match_request_response(v_request.id, v_user_id, false, true);
      return;
    end if;
    raise exception 'Private match request already created a different game.' using errcode = '23505';
  end if;

  if v_request.status <> 'requested' or v_request.expires_at <= now() then
    raise exception 'Private match request is no longer acceptable.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.public_player_profiles as profile
    where profile.user_id = v_request.requester_user_id
      and profile.public_profile_id = v_request.requester_public_profile_id
      and profile.visibility = 'public'
      and profile.moderation_status = 'active'
  ) or not exists (
    select 1
    from public.public_player_profiles as profile
    where profile.user_id = v_request.opponent_user_id
      and profile.public_profile_id = v_request.opponent_public_profile_id
      and profile.visibility = 'public'
      and profile.moderation_status = 'active'
  ) then
    raise exception 'Both players must still have active public profiles.' using errcode = '42501';
  end if;

  if v_game_id = v_request.id then
    raise exception 'Private match accept must create a fresh game id.' using errcode = '22023';
  end if;

  if lower(coalesce(p_game_projection ->> 'scope', '')) <> 'practice'
    or lower(coalesce(p_game_projection ->> 'mode', '')) <> v_request.mode
    or coalesce(p_game_projection ->> 'ranked', 'false') <> 'false'
    or nullif(p_game_projection ->> 'ratingBucket', '') is not null
    or nullif(p_game_projection ->> 'matchmakingRequestId', '') is not null
    or nullif(p_game_projection ->> 'customGameCode', '') is not null
    or nullif(p_game_projection ->> 'dailyDateKey', '') is not null
    or p_game_projection ->> 'status' is distinct from 'playing'
  then
    raise exception 'Private match game projection does not match the approved unranked Practice contract.' using errcode = '22023';
  end if;

  v_word_length_text := p_game_projection ->> 'wordLength';
  if coalesce(v_word_length_text, '') !~ '^[0-9]+$'
    or v_word_length_text::integer <> v_request.word_length
  then
    raise exception 'Private match game word length does not match the request.' using errcode = '22023';
  end if;

  v_hard_mode_text := lower(coalesce(p_game_projection ->> 'hardMode', 'false'));
  if v_hard_mode_text not in ('true', 'false') then
    raise exception 'Private match game Hard Mode setting is invalid.' using errcode = '22023';
  end if;
  v_hard_mode := v_hard_mode_text::boolean;
  if v_hard_mode is distinct from v_request.hard_mode then
    raise exception 'Private match game Hard Mode does not match the request.' using errcode = '22023';
  end if;

  v_time_limit_text := nullif(p_game_projection ->> 'timeLimitMs', '');
  if v_time_limit_text is not null and v_time_limit_text <> '0' then
    if v_time_limit_text !~ '^[0-9]+$' then
      raise exception 'Private match game time limit is invalid.' using errcode = '22023';
    end if;
    v_time_limit_ms := v_time_limit_text::integer;
    if v_time_limit_ms <= 0 then
      v_time_limit_ms := null;
    end if;
  end if;
  if v_time_limit_ms is distinct from v_request.time_limit_ms then
    raise exception 'Private match game time limit does not match the request.' using errcode = '22023';
  end if;

  v_go_puzzle_count_text := nullif(p_game_projection ->> 'goPuzzleCount', '');
  if v_go_puzzle_count_text is not null then
    if v_go_puzzle_count_text !~ '^[0-9]+$' then
      raise exception 'Private match game GO puzzle count is invalid.' using errcode = '22023';
    end if;
    v_go_puzzle_count := v_go_puzzle_count_text::integer;
  else
    v_go_puzzle_count := null;
  end if;

  if v_request.mode = 'go' and (v_go_puzzle_count is null or v_go_puzzle_count <> v_request.go_puzzle_count) then
    raise exception 'Private match GO puzzle count does not match the request.' using errcode = '22023';
  end if;

  if v_request.mode = 'og' and v_go_puzzle_count is not null then
    raise exception 'Private match OG games must not include a GO puzzle count.' using errcode = '22023';
  end if;

  v_current_turn := p_game_projection ->> 'currentTurn';
  if v_current_turn not in ('player-one', 'player-two') then
    raise exception 'Private match game current turn is invalid.' using errcode = '22023';
  end if;

  v_difficulty := coalesce(nullif(p_game_projection ->> 'difficulty', ''), 'medium');

  select *
  into v_existing_game
  from public.async_multiplayer_games as game_row
  where game_row.id = v_game_id
  for update;

  if found then
    raise exception 'Private match game id already exists.' using errcode = '23505';
  end if;

  v_stored_projection := jsonb_set(
    p_game_projection,
    '{playerUserIds}',
    jsonb_build_object(
      'player-one', v_request.requester_user_id::text,
      'player-two', v_request.opponent_user_id::text
    ),
    true
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
  )
  values (
    v_game_id,
    'practice',
    v_request.mode,
    null,
    'playing',
    v_current_turn,
    v_request.word_length,
    v_difficulty,
    v_go_puzzle_count,
    v_request.requester_user_id,
    v_request.requester_user_id,
    v_request.opponent_user_id,
    false,
    null,
    null,
    null,
    null,
    null,
    null,
    v_stored_projection,
    now(),
    now()
  );

  update public.multiplayer_private_match_requests as request_row
  set
    status = 'created',
    created_game_id = v_game_id,
    accept_idempotency_key = v_accept_key,
    responded_at = now(),
    updated_at = now()
  where request_row.id = v_request.id
  returning request_row.id into v_request.id;

  return query
  select *
  from public.phase40_private_match_request_response(v_request.id, v_user_id, true, false);
end;
$$;

comment on function public.accept_private_multiplayer_match_request_v2(text, jsonb, text)
  is 'Phase 40 authenticated opponent RPC to accept a pending private match request without exposing raw participant user ids to browser source.';

revoke all on function public.accept_private_multiplayer_match_request(text, jsonb, text) from public;
revoke all on function public.accept_private_multiplayer_match_request(text, jsonb, text) from anon;
revoke all on function public.accept_private_multiplayer_match_request(text, jsonb, text) from authenticated;

revoke all on function public.accept_private_multiplayer_match_request_v2(text, jsonb, text) from public;
revoke all on function public.accept_private_multiplayer_match_request_v2(text, jsonb, text) from anon;
revoke all on function public.accept_private_multiplayer_match_request_v2(text, jsonb, text) from authenticated;

grant execute on function public.accept_private_multiplayer_match_request_v2(text, jsonb, text) to authenticated;
