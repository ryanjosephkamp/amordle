-- Phase 29 Stage 29.3: public-safe player profile projection.
-- Additive migration only. Existing private account/profile/progress/ranked
-- tables remain private and unchanged.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.public_player_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  public_profile_id uuid not null default extensions.gen_random_uuid() unique,
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  display_name text,
  accent_color text not null default 'ice' check (accent_color in ('ice', 'aurora', 'cyan', 'violet', 'rose', 'amber')),
  flair_key text not null default 'none' check (flair_key in ('none')),
  avatar_url text,
  bio text,
  moderation_status text not null default 'active' check (moderation_status in ('active', 'hidden', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint public_player_profiles_display_name_check check (
    display_name is null
    or (
      char_length(display_name) between 1 and 50
      and display_name !~ '[[:cntrl:]]'
    )
  ),
  constraint public_player_profiles_public_display_name_check check (
    visibility <> 'public'
    or display_name is not null
  ),
  constraint public_player_profiles_bio_check check (
    bio is null
    or (
      char_length(bio) <= 160
      and bio !~ '[[:cntrl:]]'
    )
  ),
  constraint public_player_profiles_avatar_url_check check (
    avatar_url is null
    or (
      char_length(avatar_url) <= 2048
      and avatar_url like 'https://%'
      and position(user_id::text in avatar_url) = 0
      and position(replace(user_id::text, '-', '') in avatar_url) = 0
    )
  )
);

create unique index if not exists public_player_profiles_public_profile_id_idx
  on public.public_player_profiles (public_profile_id);

create index if not exists public_player_profiles_public_active_idx
  on public.public_player_profiles (visibility, moderation_status, updated_at desc)
  where visibility = 'public'
    and moderation_status = 'active';

create or replace function public.phase29_normalize_public_profile_text(
  p_value text,
  p_max_length integer
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_trimmed text;
begin
  if p_value is null then
    return null;
  end if;

  v_trimmed := btrim(p_value);
  if v_trimmed = '' then
    return null;
  end if;

  if p_max_length is null or p_max_length < 1 then
    raise exception 'Invalid maximum length.' using errcode = '22023';
  end if;

  if char_length(v_trimmed) > p_max_length then
    raise exception 'Public profile text exceeds maximum length.' using errcode = '22023';
  end if;

  if v_trimmed ~ '[[:cntrl:]]' then
    raise exception 'Public profile text cannot contain control characters.' using errcode = '22023';
  end if;

  return v_trimmed;
end;
$$;

create or replace function public.phase29_validate_public_profile_visibility(
  p_visibility text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_visibility text := lower(coalesce(nullif(btrim(p_visibility), ''), 'private'));
begin
  if v_visibility not in ('private', 'public') then
    raise exception 'Unsupported public profile visibility.' using errcode = '22023';
  end if;

  return v_visibility;
end;
$$;

create or replace function public.phase29_validate_public_profile_accent_color(
  p_accent_color text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_accent text := lower(coalesce(nullif(btrim(p_accent_color), ''), 'ice'));
begin
  if v_accent not in ('ice', 'aurora', 'cyan', 'violet', 'rose', 'amber') then
    raise exception 'Unsupported public profile accent color.' using errcode = '22023';
  end if;

  return v_accent;
end;
$$;

create or replace function public.phase29_validate_public_profile_flair_key(
  p_flair_key text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_flair text := lower(coalesce(nullif(btrim(p_flair_key), ''), 'none'));
begin
  if v_flair not in ('none') then
    raise exception 'Unsupported public profile flair.' using errcode = '22023';
  end if;

  return v_flair;
end;
$$;

create or replace function public.phase29_validate_public_profile_avatar_url(
  p_avatar_url text,
  p_user_id uuid
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_avatar_url text;
  v_user_id text := coalesce(p_user_id::text, '');
  v_user_id_compact text := replace(v_user_id, '-', '');
begin
  v_avatar_url := public.phase29_normalize_public_profile_text(p_avatar_url, 2048);
  if v_avatar_url is null then
    return null;
  end if;

  if v_avatar_url not like 'https://%' then
    raise exception 'Public avatar URL must use https.' using errcode = '22023';
  end if;

  if v_user_id <> '' and position(v_user_id in v_avatar_url) > 0 then
    raise exception 'Public avatar URL cannot contain the raw account id.' using errcode = '22023';
  end if;

  if v_user_id_compact <> '' and position(v_user_id_compact in v_avatar_url) > 0 then
    raise exception 'Public avatar URL cannot contain the raw account id.' using errcode = '22023';
  end if;

  return v_avatar_url;
end;
$$;

create or replace function public.phase29_touch_public_player_profiles_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists public_player_profiles_touch_updated_at
  on public.public_player_profiles;

create trigger public_player_profiles_touch_updated_at
  before update on public.public_player_profiles
  for each row
  execute function public.phase29_touch_public_player_profiles_updated_at();

alter table public.public_player_profiles enable row level security;

revoke all on table public.public_player_profiles from PUBLIC, anon, authenticated;

drop policy if exists "Owners can read own public player profile"
  on public.public_player_profiles;
create policy "Owners can read own public player profile"
  on public.public_player_profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Owners can insert own public player profile"
  on public.public_player_profiles;
create policy "Owners can insert own public player profile"
  on public.public_player_profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Owners can update own public player profile"
  on public.public_player_profiles;
create policy "Owners can update own public player profile"
  on public.public_player_profiles
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.get_my_public_player_profile()
returns table (
  public_profile_id uuid,
  visibility text,
  display_name text,
  accent_color text,
  flair_key text,
  avatar_url text,
  bio text,
  moderation_status text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    profile.public_profile_id,
    profile.visibility,
    profile.display_name,
    profile.accent_color,
    profile.flair_key,
    profile.avatar_url,
    profile.bio,
    profile.moderation_status,
    profile.created_at,
    profile.updated_at
  from public.public_player_profiles as profile
  where auth.role() = 'authenticated'
    and auth.uid() is not null
    and profile.user_id = auth.uid()
  limit 1
$$;

create or replace function public.upsert_my_public_player_profile(
  p_display_name text default null,
  p_accent_color text default 'ice',
  p_avatar_url text default null,
  p_bio text default null,
  p_visibility text default 'private',
  p_flair_key text default 'none'
)
returns table (
  public_profile_id uuid,
  visibility text,
  display_name text,
  accent_color text,
  flair_key text,
  avatar_url text,
  bio text,
  moderation_status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_visibility text;
  v_display_name text;
  v_accent_color text;
  v_flair_key text;
  v_avatar_url text;
  v_bio text;
begin
  if auth.role() <> 'authenticated' or v_user_id is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  v_visibility := public.phase29_validate_public_profile_visibility(p_visibility);
  v_display_name := public.phase29_normalize_public_profile_text(p_display_name, 50);
  v_accent_color := public.phase29_validate_public_profile_accent_color(p_accent_color);
  v_flair_key := public.phase29_validate_public_profile_flair_key(p_flair_key);
  v_avatar_url := public.phase29_validate_public_profile_avatar_url(p_avatar_url, v_user_id);
  v_bio := public.phase29_normalize_public_profile_text(p_bio, 160);

  if v_visibility = 'public' and v_display_name is null then
    raise exception 'A display name is required before making a public profile visible.' using errcode = '22023';
  end if;

  insert into public.public_player_profiles (
    user_id,
    visibility,
    display_name,
    accent_color,
    flair_key,
    avatar_url,
    bio
  ) values (
    v_user_id,
    v_visibility,
    v_display_name,
    v_accent_color,
    v_flair_key,
    v_avatar_url,
    v_bio
  )
  on conflict (user_id) do update
  set
    visibility = excluded.visibility,
    display_name = excluded.display_name,
    accent_color = excluded.accent_color,
    flair_key = excluded.flair_key,
    avatar_url = excluded.avatar_url,
    bio = excluded.bio;

  return query
  select
    profile.public_profile_id,
    profile.visibility,
    profile.display_name,
    profile.accent_color,
    profile.flair_key,
    profile.avatar_url,
    profile.bio,
    profile.moderation_status,
    profile.created_at,
    profile.updated_at
  from public.public_player_profiles as profile
  where profile.user_id = v_user_id
  limit 1;
end;
$$;

create or replace function public.get_public_player_profile(
  p_public_profile_id uuid
)
returns table (
  public_profile_id uuid,
  display_name text,
  accent_color text,
  flair_key text,
  avatar_url text,
  bio text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    profile.public_profile_id,
    profile.display_name,
    profile.accent_color,
    profile.flair_key,
    profile.avatar_url,
    profile.bio,
    profile.created_at,
    profile.updated_at
  from public.public_player_profiles as profile
  where p_public_profile_id is not null
    and profile.public_profile_id = p_public_profile_id
    and profile.visibility = 'public'
    and profile.moderation_status = 'active'
  limit 1
$$;

create or replace function public.get_public_player_profiles(
  p_public_profile_ids uuid[]
)
returns table (
  public_profile_id uuid,
  display_name text,
  accent_color text,
  flair_key text,
  avatar_url text,
  bio text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_public_profile_ids is null then
    return;
  end if;

  if cardinality(p_public_profile_ids) > 100 then
    raise exception 'Too many public profile ids requested.' using errcode = '22023';
  end if;

  return query
  select
    profile.public_profile_id,
    profile.display_name,
    profile.accent_color,
    profile.flair_key,
    profile.avatar_url,
    profile.bio,
    profile.created_at,
    profile.updated_at
  from (
    select distinct requested.public_profile_id
    from unnest(p_public_profile_ids) as requested(public_profile_id)
    where requested.public_profile_id is not null
  ) as requested
  join public.public_player_profiles as profile
    on profile.public_profile_id = requested.public_profile_id
  where profile.visibility = 'public'
    and profile.moderation_status = 'active';
end;
$$;

revoke all on function public.phase29_normalize_public_profile_text(text, integer)
  from PUBLIC, anon, authenticated;
revoke all on function public.phase29_validate_public_profile_visibility(text)
  from PUBLIC, anon, authenticated;
revoke all on function public.phase29_validate_public_profile_accent_color(text)
  from PUBLIC, anon, authenticated;
revoke all on function public.phase29_validate_public_profile_flair_key(text)
  from PUBLIC, anon, authenticated;
revoke all on function public.phase29_validate_public_profile_avatar_url(text, uuid)
  from PUBLIC, anon, authenticated;
revoke all on function public.phase29_touch_public_player_profiles_updated_at()
  from PUBLIC, anon, authenticated;

revoke all on function public.get_my_public_player_profile()
  from PUBLIC, anon, authenticated;
revoke all on function public.upsert_my_public_player_profile(text, text, text, text, text, text)
  from PUBLIC, anon, authenticated;
revoke all on function public.get_public_player_profile(uuid)
  from PUBLIC, anon, authenticated;
revoke all on function public.get_public_player_profiles(uuid[])
  from PUBLIC, anon, authenticated;

grant execute on function public.get_my_public_player_profile()
  to authenticated;
grant execute on function public.upsert_my_public_player_profile(text, text, text, text, text, text)
  to authenticated;
grant execute on function public.get_public_player_profile(uuid)
  to anon, authenticated;
grant execute on function public.get_public_player_profiles(uuid[])
  to anon, authenticated;
