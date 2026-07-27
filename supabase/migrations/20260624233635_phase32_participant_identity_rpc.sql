-- Phase 32 Stage 32.3: participant-scoped public-safe identity summaries.
--
-- Additive migration only. This function lets authenticated game participants
-- resolve allow-listed active public profile summaries for participants in their
-- own async multiplayer game or matched ranked Practice queue context. It does
-- not grant direct table access or expose raw auth ids, emails, queue internals,
-- game projections, answers, seeds, sessions, rating transactions, or spectator
-- data.

create or replace function public.get_multiplayer_participant_identity_summaries(
  p_game_id text default null,
  p_ranked_request_id text default null
)
returns table (
  seat text,
  is_viewer boolean,
  identity_available boolean,
  public_profile_id uuid,
  display_name text,
  accent_color text,
  flair_key text,
  avatar_url text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_game_id text := nullif(btrim(coalesce(p_game_id, '')), '');
  v_ranked_request_id text := nullif(btrim(coalesce(p_ranked_request_id, '')), '');
  v_game public.async_multiplayer_games%rowtype;
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

  if (v_game_id is null and v_ranked_request_id is null)
    or (v_game_id is not null and v_ranked_request_id is not null)
  then
    raise exception 'Exactly one participant identity context is required.' using errcode = '22023';
  end if;

  if v_game_id is not null then
    select *
    into v_game
    from public.async_multiplayer_games as game_row
    where game_row.id = v_game_id;

    if not found
      or (
        v_user_id is distinct from v_game.player_one_user_id
        and v_user_id is distinct from v_game.player_two_user_id
      )
    then
      raise exception 'Participant identity context is not available for current user.' using errcode = '42501';
    end if;

    return query
    with participants(participant_seat, participant_user_id) as (
      values
        ('player-one'::text, v_game.player_one_user_id),
        ('player-two'::text, v_game.player_two_user_id)
    )
    select
      participant.participant_seat,
      participant.participant_user_id = v_user_id,
      profile.public_profile_id is not null,
      profile.public_profile_id,
      profile.display_name,
      profile.accent_color,
      profile.flair_key,
      profile.avatar_url,
      profile.updated_at
    from participants as participant
    left join public.public_player_profiles as profile
      on profile.user_id = participant.participant_user_id
      and profile.visibility = 'public'
      and profile.moderation_status = 'active'
    where participant.participant_user_id is not null
    order by case participant.participant_seat
      when 'player-one' then 1
      when 'player-two' then 2
      else 3
    end;

    return;
  end if;

  select *
  into v_request
  from public.multiplayer_matchmaking_queue as queue_row
  where queue_row.id = v_ranked_request_id;

  if not found or v_request.user_id is distinct from v_user_id then
    raise exception 'Participant identity context is not available for current user.' using errcode = '42501';
  end if;

  if v_request.status <> 'matched' then
    return;
  end if;

  v_matched_game_id := coalesce(nullif(v_request.matched_game_id, ''), nullif(v_request.matched_match_id, ''));

  if v_matched_game_id is null then
    raise exception 'Matched ranked queue request is missing a game id.' using errcode = '22023';
  end if;

  select count(*)::integer, count(distinct queue_row.user_id)::integer
  into v_pair_rows, v_pair_users
  from public.multiplayer_matchmaking_queue as queue_row
  where coalesce(nullif(queue_row.matched_game_id, ''), nullif(queue_row.matched_match_id, '')) = v_matched_game_id
    and queue_row.status = 'matched';

  if v_pair_rows <> 2 or v_pair_users <> 2 then
    raise exception 'Matched ranked queue reservation must contain exactly two distinct users.' using errcode = '22023';
  end if;

  select *
  into v_first
  from public.multiplayer_matchmaking_queue as queue_row
  where coalesce(nullif(queue_row.matched_game_id, ''), nullif(queue_row.matched_match_id, '')) = v_matched_game_id
    and queue_row.status = 'matched'
  order by queue_row.queued_at, queue_row.id
  limit 1;

  select *
  into v_second
  from public.multiplayer_matchmaking_queue as queue_row
  where coalesce(nullif(queue_row.matched_game_id, ''), nullif(queue_row.matched_match_id, '')) = v_matched_game_id
    and queue_row.status = 'matched'
    and queue_row.id <> v_first.id
  order by queue_row.queued_at, queue_row.id
  limit 1;

  if v_first.transport <> 'async'
    or v_second.transport <> 'async'
    or v_first.scope <> 'practice'
    or v_second.scope <> 'practice'
    or v_first.ranked is distinct from true
    or v_second.ranked is distinct from true
    or v_first.mode <> v_second.mode
    or v_first.rating_bucket <> v_second.rating_bucket
    or v_first.rating_bucket <> public.phase27_rating_bucket_for_mode(v_first.mode)
    or v_first.word_length is null
    or v_first.word_length is distinct from v_second.word_length
    or v_first.hard_mode is distinct from v_second.hard_mode
    or v_first.time_limit_ms is not null
    or v_second.time_limit_ms is not null
    or v_first.user_id = v_second.user_id
  then
    raise exception 'Ranked participant identity context is not eligible.' using errcode = '22023';
  end if;

  return query
  with participants(participant_seat, participant_user_id) as (
    values
      ('player-one'::text, v_first.user_id),
      ('player-two'::text, v_second.user_id)
  )
  select
    participant.participant_seat,
    participant.participant_user_id = v_user_id,
    profile.public_profile_id is not null,
    profile.public_profile_id,
    profile.display_name,
    profile.accent_color,
    profile.flair_key,
    profile.avatar_url,
    profile.updated_at
  from participants as participant
  left join public.public_player_profiles as profile
    on profile.user_id = participant.participant_user_id
    and profile.visibility = 'public'
    and profile.moderation_status = 'active'
  where participant.participant_user_id is not null
  order by case participant.participant_seat
    when 'player-one' then 1
    when 'player-two' then 2
    else 3
  end;
end;
$$;

revoke all on function public.get_multiplayer_participant_identity_summaries(text, text)
  from public, anon, authenticated;

grant execute on function public.get_multiplayer_participant_identity_summaries(text, text)
  to authenticated;

comment on function public.get_multiplayer_participant_identity_summaries(text, text)
  is 'Phase 32 authenticated-only participant-scoped public-safe identity summaries for async multiplayer games and matched ranked Practice queue contexts.';
