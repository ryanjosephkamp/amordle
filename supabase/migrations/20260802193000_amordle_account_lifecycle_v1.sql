-- Amordle v6.6 account lifecycle authority.
--
-- This additive, forward-only migration creates service-owned, short-lived
-- destructive confirmations; preserves settled multiplayer facts when an Auth
-- user is deleted; and exposes only service-role lifecycle procedures. Browser
-- clients receive no direct table or RPC authority from this migration.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists brrrdle_private;
revoke all on schema brrrdle_private from public, anon, authenticated;

create table if not exists brrrdle_private.amordle_account_lifecycle_challenges (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in (
    'delete-solo-history',
    'restart-competitive-profile',
    'delete-account'
  )),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  operation_id uuid not null default extensions.gen_random_uuid() unique,
  status text not null default 'prepared' check (status in (
    'prepared',
    'processing',
    'used',
    'revoked',
    'expired'
  )),
  service_result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  processing_at timestamptz,
  used_at timestamptz,
  check (expires_at > created_at),
  check ((status = 'processing') = (processing_at is not null)),
  check ((status = 'used') = (used_at is not null))
);

create unique index if not exists amordle_account_lifecycle_one_prepared_idx
  on brrrdle_private.amordle_account_lifecycle_challenges (user_id, action)
  where status = 'prepared';

create index if not exists amordle_account_lifecycle_recent_idx
  on brrrdle_private.amordle_account_lifecycle_challenges (user_id, created_at desc);

create table if not exists brrrdle_private.amordle_competitive_generations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  generation integer not null default 1 check (generation > 0),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Shared settlement facts must survive deletion of either participant. The
-- seat remains the durable identity; the private Auth reference may be null.
alter table public.multiplayer_player_results
  add column if not exists player_label text not null default 'Player';
alter table public.multiplayer_player_results
  drop constraint if exists multiplayer_player_results_pkey,
  drop constraint if exists multiplayer_player_results_user_id_fkey;
alter table public.multiplayer_player_results
  alter column user_id drop not null;
alter table public.multiplayer_player_results
  add constraint multiplayer_player_results_pkey primary key (match_result_id, player_id),
  add constraint multiplayer_player_results_match_user_key_v2 unique (match_result_id, user_id),
  add constraint multiplayer_player_results_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null;

alter table public.multiplayer_rating_transactions
  add column if not exists player_label text not null default 'Player',
  add column if not exists opponent_label text not null default 'Player';
alter table public.multiplayer_rating_transactions
  drop constraint if exists multiplayer_rating_transactions_user_id_fkey,
  drop constraint if exists multiplayer_rating_transactions_opponent_user_id_fkey;
alter table public.multiplayer_rating_transactions
  alter column user_id drop not null,
  alter column opponent_user_id drop not null;
alter table public.multiplayer_rating_transactions
  add constraint multiplayer_rating_transactions_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null,
  add constraint multiplayer_rating_transactions_opponent_user_id_fkey
    foreign key (opponent_user_id) references auth.users(id) on delete set null;

alter table public.live_lobbies
  drop constraint if exists live_lobbies_host_user_id_fkey;
alter table public.live_lobbies alter column host_user_id drop not null;
alter table public.live_lobbies
  add constraint live_lobbies_host_user_id_fkey
    foreign key (host_user_id) references auth.users(id) on delete set null;

alter table public.live_match_participants
  drop constraint if exists live_match_participants_pkey,
  drop constraint if exists live_match_participants_user_id_fkey;
alter table public.live_match_participants alter column user_id drop not null;
alter table public.live_match_participants
  add constraint live_match_participants_pkey primary key (match_id, player_id),
  add constraint live_match_participants_match_user_key_v2 unique (match_id, user_id),
  add constraint live_match_participants_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null;

alter table public.async_multiplayer_games
  drop constraint if exists async_multiplayer_games_host_user_id_fkey,
  drop constraint if exists async_multiplayer_games_player_one_user_id_fkey,
  drop constraint if exists async_multiplayer_games_player_two_user_id_fkey;
alter table public.async_multiplayer_games alter column host_user_id drop not null;
alter table public.async_multiplayer_games
  add constraint async_multiplayer_games_host_user_id_fkey
    foreign key (host_user_id) references auth.users(id) on delete set null,
  add constraint async_multiplayer_games_player_one_user_id_fkey
    foreign key (player_one_user_id) references auth.users(id) on delete set null,
  add constraint async_multiplayer_games_player_two_user_id_fkey
    foreign key (player_two_user_id) references auth.users(id) on delete set null;

alter table brrrdle_private.amordle_combat_authority
  drop constraint if exists amordle_combat_authority_player_one_user_id_fkey,
  drop constraint if exists amordle_combat_authority_player_two_user_id_fkey;
alter table brrrdle_private.amordle_combat_authority
  alter column player_one_user_id drop not null;
alter table brrrdle_private.amordle_combat_authority
  add constraint amordle_combat_authority_player_one_user_id_fkey
    foreign key (player_one_user_id) references auth.users(id) on delete set null,
  add constraint amordle_combat_authority_player_two_user_id_fkey
    foreign key (player_two_user_id) references auth.users(id) on delete set null;

create or replace function public.service_prepare_account_lifecycle_v1(
  p_user_id uuid,
  p_action text,
  p_token_hash text
)
returns table (operation_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operation_id uuid := extensions.gen_random_uuid();
  v_expires_at timestamptz := now() + interval '5 minutes';
  v_recent_count integer;
  v_resume_service_result jsonb;
begin
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Account is unavailable.' using errcode = 'P0002';
  end if;
  if p_action not in ('delete-solo-history', 'restart-competitive-profile', 'delete-account') then
    raise exception 'Unsupported account action.' using errcode = '22023';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid confirmation token.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('amordle-account:' || p_user_id::text, 0)
  );

  if p_action = 'delete-account' then
    select challenge.service_result into v_resume_service_result
    from brrrdle_private.amordle_account_lifecycle_challenges challenge
    where challenge.user_id = p_user_id
      and challenge.action = p_action
      and challenge.service_result <> '{}'::jsonb
      and challenge.status in ('processing', 'expired', 'revoked')
    order by challenge.created_at desc
    limit 1
    for update;
  end if;

  update brrrdle_private.amordle_account_lifecycle_challenges challenge
  set
    status = case when challenge.expires_at <= now() then 'expired' else 'revoked' end,
    processing_at = null
  where challenge.user_id = p_user_id and challenge.status in ('prepared', 'processing');

  select count(*)::integer into v_recent_count
  from brrrdle_private.amordle_account_lifecycle_challenges challenge
  where challenge.user_id = p_user_id
    and challenge.created_at >= now() - interval '15 minutes';
  if v_recent_count >= 5 then
    raise exception 'Too many account action attempts. Try again later.' using errcode = 'P0001';
  end if;

  insert into brrrdle_private.amordle_account_lifecycle_challenges (
    user_id,
    action,
    token_hash,
    operation_id,
    status,
    service_result,
    expires_at,
    processing_at
  ) values (
    p_user_id,
    p_action,
    p_token_hash,
    v_operation_id,
    case when v_resume_service_result is null then 'prepared' else 'processing' end,
    coalesce(v_resume_service_result, '{}'::jsonb),
    v_expires_at,
    case when v_resume_service_result is null then null else now() end
  );

  return query select v_operation_id, v_expires_at;
end;
$$;

create or replace function public.service_account_has_active_combat_v1(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from brrrdle_private.amordle_combat_authority authority
      where authority.status in ('waiting', 'playing', 'holding')
        and p_user_id in (authority.player_one_user_id, authority.player_two_user_id)
    )
    or exists (
      select 1
      from public.async_multiplayer_games game_row
      where game_row.status in ('waiting', 'playing')
        and p_user_id in (
          game_row.host_user_id,
          game_row.player_one_user_id,
          game_row.player_two_user_id
        )
    )
    or exists (
      select 1
      from public.live_match_participants participant
      join public.live_matches match_row on match_row.id = participant.match_id
      where participant.user_id = p_user_id
        and match_row.phase in ('word-length-selection', 'countdown', 'playing')
    );
$$;

create or replace function public.service_cancel_account_waiting_combat_v1(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.multiplayer_matchmaking_queue queue_row
  set status = 'cancelled'
  where queue_row.user_id = p_user_id and queue_row.status = 'queued';

  update public.multiplayer_private_match_requests request_row
  set status = 'cancelled', responded_at = coalesce(responded_at, now()), updated_at = now()
  where p_user_id in (request_row.requester_user_id, request_row.opponent_user_id)
    and request_row.status = 'requested';

  update public.multiplayer_practice_rematch_requests request_row
  set status = 'cancelled', responded_at = coalesce(responded_at, now()), updated_at = now()
  where p_user_id in (request_row.requester_user_id, request_row.opponent_user_id)
    and request_row.status = 'requested';

  update public.live_lobbies lobby
  set status = 'cancelled', updated_at = now()
  where lobby.host_user_id = p_user_id and lobby.status = 'waiting';

  update public.custom_game_lobbies lobby
  set status = 'cancelled'
  where lobby.creator_user_id = p_user_id and lobby.status = 'waiting';
end;
$$;

create or replace function public.service_delete_solo_account_data_v1(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.game_history history
  where history.user_id = p_user_id
    and history.entry ->> 'kind' in ('solo-practice', 'solo-daily');

  update public.game_history history
  set
    entry = jsonb_set(
      jsonb_set(
        jsonb_set(history.entry, '{progress,solo}', '{}'::jsonb, true),
        '{progress,dailyStreak}', '0'::jsonb, true
      ),
      '{progress,revision}',
      to_jsonb(coalesce((history.entry #>> '{progress,revision}')::integer, 0) + 1),
      true
    ),
    completed_at = now()
  where history.user_id = p_user_id
    and history.entry ->> 'kind' = 'amordle-account-state-v1';

  update public.progress_snapshots snapshot
  set
    progress = jsonb_set(
      jsonb_set(
        jsonb_set(snapshot.progress, '{solo}', '{}'::jsonb, true),
        '{dailyStreak}', '0'::jsonb, true
      ),
      '{history}', '[]'::jsonb, true
    ),
    updated_at = now()
  where snapshot.user_id = p_user_id and jsonb_typeof(snapshot.progress) = 'object';
end;
$$;

create or replace function public.service_restart_competitive_profile_v1(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_generation integer;
begin
  if public.service_account_has_active_combat_v1(p_user_id) then
    raise exception 'Finish or forfeit active COMBAT games before restarting.' using errcode = 'P0001';
  end if;

  perform public.service_cancel_account_waiting_combat_v1(p_user_id);

  insert into brrrdle_private.amordle_competitive_generations (
    user_id, generation, started_at, updated_at
  ) values (p_user_id, 2, now(), now())
  on conflict (user_id) do update set
    generation = brrrdle_private.amordle_competitive_generations.generation + 1,
    started_at = now(),
    updated_at = now()
  returning generation into v_generation;

  delete from public.game_history history
  where history.user_id = p_user_id
    and history.entry ->> 'kind' in ('combat-practice', 'combat-daily');

  insert into public.multiplayer_rating_profiles (
    user_id, bucket, rating, games_played, wins, losses, draws, provisional, updated_at
  )
  select p_user_id, bucket, 1200, 0, 0, 0, 0, true, now()
  from unnest(array[
    'async:og:amordle:v2',
    'async:go:amordle:v2',
    'async:og:timed:amordle:v2',
    'async:go:timed:amordle:v2',
    'async:og:daily:v1',
    'async:go:daily:v1'
  ]) bucket
  on conflict (user_id, bucket) do update set
    rating = 1200,
    games_played = 0,
    wins = 0,
    losses = 0,
    draws = 0,
    provisional = true,
    updated_at = now();

  return v_generation;
end;
$$;

create or replace function public.service_detach_deleted_combat_player_v1(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted_one uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_deleted_two uuid := '00000000-0000-4000-8000-000000000002'::uuid;
begin
  update public.multiplayer_player_results result_row
  set user_id = null, player_label = 'Deleted player'
  where result_row.user_id = p_user_id;

  update public.multiplayer_rating_transactions transaction_row
  set
    user_id = case when transaction_row.user_id = p_user_id then null else transaction_row.user_id end,
    opponent_user_id = case
      when transaction_row.opponent_user_id = p_user_id then null
      else transaction_row.opponent_user_id
    end,
    player_label = case
      when transaction_row.user_id = p_user_id then 'Deleted player'
      else transaction_row.player_label
    end,
    opponent_label = case
      when transaction_row.opponent_user_id = p_user_id then 'Deleted player'
      else transaction_row.opponent_label
    end
  where p_user_id in (transaction_row.user_id, transaction_row.opponent_user_id);

  update brrrdle_private.amordle_combat_action_ledger action_row
  set player_user_id = case
    when action_row.player_id = 'player-two' then v_deleted_two else v_deleted_one end
  where action_row.player_user_id = p_user_id;

  update brrrdle_private.amordle_combat_authority authority
  set
    player_one_user_id = case
      when authority.player_one_user_id = p_user_id then null else authority.player_one_user_id end,
    player_two_user_id = case
      when authority.player_two_user_id = p_user_id then null else authority.player_two_user_id end
  where authority.status in ('completed', 'cancelled')
    and p_user_id in (authority.player_one_user_id, authority.player_two_user_id);

  update public.async_multiplayer_games game_row
  set
    host_user_id = case when game_row.host_user_id = p_user_id then null else game_row.host_user_id end,
    player_one_user_id = case
      when game_row.player_one_user_id = p_user_id then null else game_row.player_one_user_id end,
    player_two_user_id = case
      when game_row.player_two_user_id = p_user_id then null else game_row.player_two_user_id end,
    projection = replace(game_row.projection::text, p_user_id::text, 'deleted-player')::jsonb
  where game_row.status in ('won', 'lost', 'expired', 'cancelled')
    and p_user_id in (
      game_row.host_user_id, game_row.player_one_user_id, game_row.player_two_user_id
    );

  update public.live_match_participants participant
  set user_id = null, display_label = 'Deleted player'
  from public.live_matches match_row
  where participant.match_id = match_row.id
    and participant.user_id = p_user_id
    and match_row.phase in ('finished', 'aborted', 'expired');

  update public.live_match_events event_row
  set payload = replace(event_row.payload::text, p_user_id::text, 'deleted-player')::jsonb
  where event_row.payload::text like '%' || p_user_id::text || '%';

  update public.live_matches match_row
  set projection = replace(match_row.projection::text, p_user_id::text, 'deleted-player')::jsonb
  where match_row.phase in ('finished', 'aborted', 'expired')
    and match_row.projection::text like '%' || p_user_id::text || '%';

  -- Pre-v3 ranked Daily tables intentionally lack Auth foreign keys. Replace
  -- only the deleted identity with stable non-Auth seat sentinels.
  update brrrdle_private.ranked_daily_action_ledger action_row
  set player_user_id = case
    when action_row.player_id = 'player-two' then v_deleted_two else v_deleted_one end
  where action_row.player_user_id = p_user_id;

  update brrrdle_private.ranked_daily_game_authority authority
  set
    player_one_user_id = case
      when authority.player_one_user_id = p_user_id then v_deleted_one
      else authority.player_one_user_id end,
    player_two_user_id = case
      when authority.player_two_user_id = p_user_id then v_deleted_two
      else authority.player_two_user_id end
  where authority.terminal_status in ('completed', 'cancelled')
    and p_user_id in (authority.player_one_user_id, authority.player_two_user_id);

  update brrrdle_private.ranked_daily_pair_reservations reservation
  set
    player_one_user_id = case
      when reservation.player_one_user_id = p_user_id then v_deleted_one
      else reservation.player_one_user_id end,
    player_two_user_id = case
      when reservation.player_two_user_id = p_user_id then v_deleted_two
      else reservation.player_two_user_id end
  where reservation.finalized_at is not null
    and p_user_id in (reservation.player_one_user_id, reservation.player_two_user_id);
end;
$$;

create or replace function public.service_delete_account_data_v1(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_avatar_url text;
begin
  if public.service_account_has_active_combat_v1(p_user_id) then
    raise exception 'Finish or forfeit active COMBAT games before deleting the account.'
      using errcode = 'P0001';
  end if;

  perform public.service_cancel_account_waiting_combat_v1(p_user_id);
  perform public.service_detach_deleted_combat_player_v1(p_user_id);

  select profile.avatar_url into v_avatar_url
  from public.public_player_profiles profile
  where profile.user_id = p_user_id;

  delete from public.multiplayer_private_match_requests request_row
  where p_user_id in (request_row.requester_user_id, request_row.opponent_user_id);
  delete from public.multiplayer_practice_rematch_requests request_row
  where p_user_id in (request_row.requester_user_id, request_row.opponent_user_id);
  -- Ranked Practice reservations are ephemeral queue claims, not settled
  -- shared match facts. Remove them before their referenced queue request so
  -- request-side foreign keys cannot block account deletion.
  delete from brrrdle_private.amordle_ranked_practice_reservations reservation
  where p_user_id in (reservation.player_one_user_id, reservation.player_two_user_id);
  delete from public.multiplayer_matchmaking_queue queue_row where queue_row.user_id = p_user_id;
  delete from public.game_history history where history.user_id = p_user_id;
  delete from public.progress_snapshots snapshot where snapshot.user_id = p_user_id;
  delete from public.settings setting_row where setting_row.user_id = p_user_id;
  delete from public.player_economy_operations operation_row where operation_row.user_id = p_user_id;
  delete from public.player_economy_state economy where economy.user_id = p_user_id;
  delete from public.multiplayer_rating_profiles profile where profile.user_id = p_user_id;
  delete from public.multiplayer_private_request_blocks block_row
  where p_user_id in (block_row.blocker_user_id, block_row.blocked_user_id);
  delete from public.multiplayer_private_request_preferences preference
  where preference.user_id = p_user_id;
  delete from public.public_profile_accent_presets preset where preset.user_id = p_user_id;
  delete from public.public_player_profiles profile where profile.user_id = p_user_id;
  delete from public.profiles profile where profile.id = p_user_id;

  return jsonb_build_object('avatarUrl', v_avatar_url);
end;
$$;

create or replace function public.service_confirm_account_lifecycle_v1(
  p_user_id uuid,
  p_action text,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge brrrdle_private.amordle_account_lifecycle_challenges%rowtype;
  v_service_result jsonb := '{}'::jsonb;
  v_generation integer;
  v_completed_at timestamptz;
begin
  if p_user_id is null or p_action is null or p_token_hash is null then
    raise exception 'Invalid confirmation.' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('amordle-account:' || p_user_id::text, 0)
  );

  select * into v_challenge
  from brrrdle_private.amordle_account_lifecycle_challenges challenge
  where challenge.user_id = p_user_id
    and challenge.action = p_action
    and challenge.token_hash = p_token_hash
  for update;

  if not found then
    raise exception 'This confirmation is not valid.' using errcode = 'P0001';
  end if;

  -- A permanent deletion may need to resume exact Storage/Auth cleanup after
  -- the database-owned mutation has committed. Replaying the same
  -- account/action/token in this private processing state returns only the
  -- previously captured cleanup receipt; it never repeats database deletion.
  if v_challenge.status = 'processing' and p_action = 'delete-account' then
    if v_challenge.expires_at <= now() then
      update brrrdle_private.amordle_account_lifecycle_challenges
      set status = 'expired', processing_at = null
      where id = v_challenge.id;
      raise exception 'This confirmation has expired.' using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'action', p_action,
      'operationId', v_challenge.operation_id,
      'completedAt', v_challenge.processing_at,
      'service', v_challenge.service_result
    );
  end if;
  if v_challenge.status <> 'prepared' then
    raise exception 'This confirmation is not valid.' using errcode = 'P0001';
  end if;
  if v_challenge.expires_at <= now() then
    update brrrdle_private.amordle_account_lifecycle_challenges
    set status = 'expired'
    where id = v_challenge.id;
    raise exception 'This confirmation has expired.' using errcode = 'P0001';
  end if;

  if p_action = 'delete-solo-history' then
    perform public.service_delete_solo_account_data_v1(p_user_id);
  elsif p_action = 'restart-competitive-profile' then
    v_generation := public.service_restart_competitive_profile_v1(p_user_id);
    v_service_result := jsonb_build_object('competitiveGeneration', v_generation);
  elsif p_action = 'delete-account' then
    v_service_result := public.service_delete_account_data_v1(p_user_id);
  else
    raise exception 'Unsupported account action.' using errcode = '22023';
  end if;

  v_completed_at := now();
  if p_action = 'delete-account' then
    update brrrdle_private.amordle_account_lifecycle_challenges
    set
      status = 'processing',
      processing_at = v_completed_at,
      service_result = v_service_result
    where id = v_challenge.id;
  else
    update brrrdle_private.amordle_account_lifecycle_challenges
    set status = 'used', used_at = v_completed_at
    where id = v_challenge.id;
  end if;

  return jsonb_build_object(
    'action', p_action,
    'operationId', v_challenge.operation_id,
    'completedAt', v_completed_at,
    'service', v_service_result
  );
end;
$$;

revoke all on table brrrdle_private.amordle_account_lifecycle_challenges
  from public, anon, authenticated;
revoke all on table brrrdle_private.amordle_competitive_generations
  from public, anon, authenticated;

revoke all on function public.service_prepare_account_lifecycle_v1(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.service_account_has_active_combat_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.service_cancel_account_waiting_combat_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.service_delete_solo_account_data_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.service_restart_competitive_profile_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.service_detach_deleted_combat_player_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.service_delete_account_data_v1(uuid)
  from public, anon, authenticated;
revoke all on function public.service_confirm_account_lifecycle_v1(uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.service_prepare_account_lifecycle_v1(uuid, text, text)
  to service_role;
grant execute on function public.service_account_has_active_combat_v1(uuid)
  to service_role;
grant execute on function public.service_cancel_account_waiting_combat_v1(uuid)
  to service_role;
grant execute on function public.service_delete_solo_account_data_v1(uuid)
  to service_role;
grant execute on function public.service_restart_competitive_profile_v1(uuid)
  to service_role;
grant execute on function public.service_detach_deleted_combat_player_v1(uuid)
  to service_role;
grant execute on function public.service_delete_account_data_v1(uuid)
  to service_role;
grant execute on function public.service_confirm_account_lifecycle_v1(uuid, text, text)
  to service_role;

revoke all on all tables in schema brrrdle_private from public, anon, authenticated;
