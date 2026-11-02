-- Phase 56: participant-private request preferences, blocks, and directional anti-spam.

create table if not exists public.multiplayer_private_request_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  accept_private_practice_requests boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.multiplayer_private_request_blocks (
  blocker_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_public_profile_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id),
  constraint multiplayer_private_request_blocks_no_self check (blocker_user_id <> blocked_user_id)
);

create index if not exists multiplayer_private_request_blocks_blocked_idx
  on public.multiplayer_private_request_blocks (blocked_user_id, blocker_user_id);

alter table public.multiplayer_private_request_preferences enable row level security;
alter table public.multiplayer_private_request_blocks enable row level security;

drop policy if exists "Private request preference owner read" on public.multiplayer_private_request_preferences;
create policy "Private request preference owner read"
  on public.multiplayer_private_request_preferences for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Private request block owner read" on public.multiplayer_private_request_blocks;
create policy "Private request block owner read"
  on public.multiplayer_private_request_blocks for select to authenticated
  using ((select auth.uid()) is not null and (select auth.uid()) = blocker_user_id);

revoke all on table public.multiplayer_private_request_preferences from public, anon, authenticated;
revoke all on table public.multiplayer_private_request_blocks from public, anon, authenticated;

drop index if exists public.multiplayer_private_match_requests_active_pair_idx;
create unique index multiplayer_private_match_requests_active_direction_mode_idx
  on public.multiplayer_private_match_requests (requester_user_id, opponent_user_id, mode)
  where status = 'requested';

create or replace function public.get_private_multiplayer_request_preference()
returns table (accept_private_practice_requests boolean, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '28000'; end if;
  insert into public.multiplayer_private_request_preferences (user_id)
  values (v_user_id) on conflict (user_id) do nothing;
  return query select p.accept_private_practice_requests, p.updated_at
  from public.multiplayer_private_request_preferences p where p.user_id = v_user_id;
end;
$$;

create or replace function public.update_private_multiplayer_request_preference(p_accept boolean)
returns table (accept_private_practice_requests boolean, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '28000'; end if;
  insert into public.multiplayer_private_request_preferences (user_id, accept_private_practice_requests, updated_at)
  values (v_user_id, coalesce(p_accept, true), now())
  on conflict (user_id) do update set accept_private_practice_requests = excluded.accept_private_practice_requests, updated_at = now();
  return query select p.accept_private_practice_requests, p.updated_at
  from public.multiplayer_private_request_preferences p where p.user_id = v_user_id;
end;
$$;

create or replace function public.get_private_multiplayer_request_blocks()
returns table (
  public_profile_id uuid, display_name text, accent_color text,
  flair_key text, avatar_url text, blocked_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '28000'; end if;
  return query
  select p.public_profile_id, p.display_name, p.accent_color, p.flair_key, p.avatar_url, b.created_at
  from public.multiplayer_private_request_blocks b
  join public.public_player_profiles p on p.user_id = b.blocked_user_id
    and p.public_profile_id = b.blocked_public_profile_id
    and p.visibility = 'public' and p.moderation_status = 'active'
  where b.blocker_user_id = v_user_id
  order by b.created_at desc;
end;
$$;

create or replace function public.set_private_multiplayer_request_block(
  p_target_public_profile_id uuid,
  p_blocked boolean
)
returns table (blocked boolean, public_profile_id uuid, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_target public.public_player_profiles%rowtype;
  v_now timestamptz := now();
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '28000'; end if;
  select * into v_target from public.public_player_profiles p
  where p.public_profile_id = p_target_public_profile_id
    and p.visibility = 'public' and p.moderation_status = 'active'
  limit 1;
  if not found or v_target.user_id = v_user_id then
    raise exception 'Target player is not available for private match requests.' using errcode = '42501';
  end if;
  if coalesce(p_blocked, true) then
    insert into public.multiplayer_private_request_blocks (blocker_user_id, blocked_user_id, blocked_public_profile_id)
    values (v_user_id, v_target.user_id, v_target.public_profile_id)
    on conflict (blocker_user_id, blocked_user_id) do update
      set blocked_public_profile_id = excluded.blocked_public_profile_id;
    update public.multiplayer_private_match_requests r set status = 'cancelled', responded_at = v_now, updated_at = v_now
    where r.status = 'requested'
      and ((r.requester_user_id = v_user_id and r.opponent_user_id = v_target.user_id)
        or (r.requester_user_id = v_target.user_id and r.opponent_user_id = v_user_id));
    return query select true, v_target.public_profile_id, v_now;
  else
    delete from public.multiplayer_private_request_blocks b
    where b.blocker_user_id = v_user_id and b.blocked_user_id = v_target.user_id;
    return query select false, v_target.public_profile_id, v_now;
  end if;
end;
$$;

create or replace function public.phase56_private_request_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_accept boolean;
begin
  if new.status <> 'requested' and not (tg_op = 'UPDATE' and old.status = 'requested' and new.status = 'created') then return new; end if;
  select coalesce(p.accept_private_practice_requests, true) into v_accept
  from public.multiplayer_private_request_preferences p where p.user_id = new.opponent_user_id;
  if coalesce(v_accept, true) = false or exists (
    select 1 from public.multiplayer_private_request_blocks b
    where (b.blocker_user_id = new.requester_user_id and b.blocked_user_id = new.opponent_user_id)
       or (b.blocker_user_id = new.opponent_user_id and b.blocked_user_id = new.requester_user_id)
  ) then
    raise exception 'Target player is not available for private match requests.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists phase56_private_request_guard_trigger on public.multiplayer_private_match_requests;
create trigger phase56_private_request_guard_trigger
before insert or update of status on public.multiplayer_private_match_requests
for each row execute function public.phase56_private_request_guard();

-- Replace only the active-pair lookup semantics while preserving the existing RPC signature.
create or replace function public.phase56_find_active_private_request(
  p_requester_user_id uuid, p_opponent_user_id uuid, p_mode text
)
returns text language sql stable security definer set search_path = '' as $$
  select r.id from public.multiplayer_private_match_requests r
  where r.status = 'requested' and r.expires_at > now()
    and r.requester_user_id = p_requester_user_id
    and r.opponent_user_id = p_opponent_user_id
    and r.mode = p_mode
  order by r.created_at desc limit 1;
$$;

-- The browser uses this v2 wrapper. It preserves the existing implementation's
-- validation/rate-limit text while enforcing directional mode lanes before delegation.
create or replace function public.create_private_multiplayer_match_request_v2(
  p_target_public_profile_id uuid, p_mode text, p_word_length integer,
  p_hard_mode boolean default false, p_time_limit_ms integer default null,
  p_go_puzzle_count integer default null, p_idempotency_key text default null,
  p_expires_at timestamptz default null
)
returns table (
  request_id text, request_status text, viewer_role text,
  viewer_can_accept boolean, viewer_can_cancel boolean, viewer_can_decline boolean,
  mode text, word_length integer, hard_mode boolean, time_limit_ms integer,
  go_puzzle_count integer, created_game_id text, created_at timestamptz,
  expires_at timestamptz, responded_at timestamptz, updated_at timestamptz,
  created boolean, idempotent boolean,
  requester_identity_available boolean, requester_public_profile_id uuid,
  requester_display_name text, requester_accent_color text, requester_flair_key text,
  requester_avatar_url text, requester_profile_updated_at timestamptz,
  opponent_identity_available boolean, opponent_public_profile_id uuid,
  opponent_display_name text, opponent_accent_color text, opponent_flair_key text,
  opponent_avatar_url text, opponent_profile_updated_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_requester public.public_player_profiles%rowtype;
  v_target public.public_player_profiles%rowtype;
  v_mode text := lower(nullif(btrim(p_mode), ''));
  v_existing_id text; v_request_id text;
  v_active_count integer; v_recent_count integer;
  v_expiry timestamptz := coalesce(p_expires_at, now() + interval '10 minutes');
  v_key text;
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '28000'; end if;
  if v_mode not in ('og', 'go') then raise exception 'Private match requests support only OG or GO Practice games.' using errcode = '22023'; end if;
  if p_word_length is null or p_word_length < 2 or p_word_length > 35 then raise exception 'Private match request word length must be between 2 and 35.' using errcode = '22023'; end if;
  if p_time_limit_ms is not null and p_time_limit_ms <= 0 then raise exception 'Private match request time limit must be positive when provided.' using errcode = '22023'; end if;
  if v_mode = 'go' and (p_go_puzzle_count is null or p_go_puzzle_count <= 0) then raise exception 'Private GO match requests require a positive GO puzzle count.' using errcode = '22023'; end if;
  if v_mode = 'og' and p_go_puzzle_count is not null then raise exception 'Private OG match requests must not include a GO puzzle count.' using errcode = '22023'; end if;
  if v_expiry <= now() or v_expiry > now() + interval '10 minutes' then raise exception 'Private match request expiry must be within the next 10 minutes.' using errcode = '22023'; end if;

  select * into v_requester from public.public_player_profiles p
  where p.user_id = v_user_id and p.visibility = 'public' and p.moderation_status = 'active'
  limit 1 for update;
  if not found then raise exception 'Requester must have an active public profile.' using errcode = '42501'; end if;
  select * into v_target from public.public_player_profiles p
  where p.public_profile_id = p_target_public_profile_id and p.visibility = 'public' and p.moderation_status = 'active';
  if not found or v_target.user_id = v_user_id then
    raise exception 'Target player is not available for private match requests.' using errcode = '42501';
  end if;
  perform public.phase40_expire_private_match_requests();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'phase56-private-request:' || v_user_id::text || ':' || v_target.user_id::text || ':' || v_mode,
    0
  ));

  v_key := coalesce(nullif(btrim(p_idempotency_key), ''),
    'phase56-private-request:create:' || v_user_id::text || ':' || v_target.user_id::text || ':' || v_mode || ':' || p_word_length::text || ':' || coalesce(p_hard_mode, false)::text || ':' || coalesce(p_time_limit_ms::text, 'none') || ':' || coalesce(p_go_puzzle_count::text, 'none'));
  select r.id into v_existing_id from public.multiplayer_private_match_requests r
  where r.request_idempotency_key = v_key and r.requester_user_id = v_user_id for update;
  if found then return query select * from public.phase40_private_match_request_response(v_existing_id, v_user_id, false, true); return; end if;

  v_existing_id := public.phase56_find_active_private_request(v_user_id, v_target.user_id, v_mode);
  if v_existing_id is not null then
    return query select * from public.phase40_private_match_request_response(v_existing_id, v_user_id, false, false); return;
  end if;
  select count(*) into v_active_count from public.multiplayer_private_match_requests r
  where r.requester_user_id = v_user_id and r.status = 'requested' and r.expires_at > now();
  if v_active_count >= 5 then raise exception 'Too many active outgoing private match requests.' using errcode = '54000'; end if;
  select count(*) into v_recent_count from public.multiplayer_private_match_requests r
  where r.requester_user_id = v_user_id and r.created_at >= now() - interval '1 hour';
  if v_recent_count >= 20 then raise exception 'Too many recent private match requests.' using errcode = '54000'; end if;
  insert into public.multiplayer_private_match_requests (
    requester_user_id, opponent_user_id, requester_public_profile_id, opponent_public_profile_id,
    mode, word_length, hard_mode, time_limit_ms, go_puzzle_count, request_idempotency_key, expires_at
  ) values (
    v_user_id, v_target.user_id, v_requester.public_profile_id, v_target.public_profile_id,
    v_mode, p_word_length, coalesce(p_hard_mode, false), p_time_limit_ms,
    case when v_mode = 'go' then p_go_puzzle_count else null end, v_key, v_expiry
  ) returning id into v_request_id;
  return query select * from public.phase40_private_match_request_response(v_request_id, v_user_id, true, false);
end;
$$;

revoke all on function public.get_private_multiplayer_request_preference() from public, anon, authenticated;
revoke all on function public.update_private_multiplayer_request_preference(boolean) from public, anon, authenticated;
revoke all on function public.get_private_multiplayer_request_blocks() from public, anon, authenticated;
revoke all on function public.set_private_multiplayer_request_block(uuid, boolean) from public, anon, authenticated;
revoke all on function public.phase56_private_request_guard() from public, anon, authenticated;
revoke all on function public.phase56_find_active_private_request(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.create_private_multiplayer_match_request_v2(uuid, text, integer, boolean, integer, integer, text, timestamptz) from public, anon, authenticated;
revoke all on function public.create_private_multiplayer_match_request(uuid, text, integer, boolean, integer, integer, text, timestamptz) from authenticated;

grant execute on function public.get_private_multiplayer_request_preference() to authenticated;
grant execute on function public.update_private_multiplayer_request_preference(boolean) to authenticated;
grant execute on function public.get_private_multiplayer_request_blocks() to authenticated;
grant execute on function public.set_private_multiplayer_request_block(uuid, boolean) to authenticated;
grant execute on function public.create_private_multiplayer_match_request_v2(uuid, text, integer, boolean, integer, integer, text, timestamptz) to authenticated;
