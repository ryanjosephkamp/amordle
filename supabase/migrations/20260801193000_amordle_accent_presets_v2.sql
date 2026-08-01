-- Amordle v6.3 private custom-accent preset authority.
--
-- Additive and forward-only. Existing six-name profile RPCs and projections
-- remain callable with their original signatures. Custom preset names and
-- ownership stay private; v2 public projections add only the validated active
-- accent hex value.

create table if not exists public.public_profile_accent_presets (
  preset_id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  accent_hex text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint public_profile_accent_presets_name_check check (
    char_length(name) between 1 and 32
    and name !~ '[[:cntrl:]]'
  ),
  constraint public_profile_accent_presets_hex_check check (
    accent_hex ~ '^#[0-9A-F]{6}$'
  )
);

create unique index if not exists public_profile_accent_presets_user_name_idx
  on public.public_profile_accent_presets (user_id, lower(name));

create index if not exists public_profile_accent_presets_user_updated_idx
  on public.public_profile_accent_presets (user_id, updated_at desc, preset_id);

alter table public.public_player_profiles
  add column if not exists active_accent_preset_id uuid;

alter table public.public_player_profiles
  add column if not exists accent_hex text;

alter table public.public_player_profiles
  drop constraint if exists public_player_profiles_accent_hex_check;

alter table public.public_player_profiles
  add constraint public_player_profiles_accent_hex_check check (
    (active_accent_preset_id is null and accent_hex is null)
    or (
      active_accent_preset_id is not null
      and accent_hex ~ '^#[0-9A-F]{6}$'
    )
  );

alter table public.public_player_profiles
  drop constraint if exists public_player_profiles_active_accent_preset_fkey;

alter table public.public_player_profiles
  add constraint public_player_profiles_active_accent_preset_fkey
  foreign key (active_accent_preset_id)
  references public.public_profile_accent_presets(preset_id);

alter table public.public_player_profiles
  alter column accent_color set default 'aurora';

create or replace function public.phase29_validate_public_profile_accent_color(
  p_accent_color text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_accent text := lower(coalesce(nullif(btrim(p_accent_color), ''), 'aurora'));
begin
  if v_accent not in ('ice', 'aurora', 'cyan', 'violet', 'rose', 'amber') then
    raise exception 'Unsupported public profile accent color.' using errcode = '22023';
  end if;

  return v_accent;
end;
$$;

create or replace function public.phase63_validate_accent_hex(
  p_accent_hex text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_hex text := upper(btrim(coalesce(p_accent_hex, '')));
begin
  if v_hex !~ '^#[0-9A-F]{6}$' then
    raise exception 'Accent color must use canonical #RRGGBB format.' using errcode = '22023';
  end if;
  return v_hex;
end;
$$;

create or replace function public.phase63_validate_accent_preset_name(
  p_name text,
  p_accent_hex text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
begin
  if v_name = '' then
    v_name := p_accent_hex;
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 32 or v_name ~ '[[:cntrl:]]' then
    raise exception 'Accent preset names must contain 1 to 32 visible characters.'
      using errcode = '22023';
  end if;
  return v_name;
end;
$$;

create or replace function public.phase63_touch_accent_preset_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists public_profile_accent_presets_touch_updated_at
  on public.public_profile_accent_presets;

create trigger public_profile_accent_presets_touch_updated_at
  before update on public.public_profile_accent_presets
  for each row execute function public.phase63_touch_accent_preset_updated_at();

create or replace function public.phase63_validate_profile_active_accent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hex text;
begin
  if new.active_accent_preset_id is null then
    new.accent_hex := null;
    return new;
  end if;

  select preset.accent_hex
  into v_hex
  from public.public_profile_accent_presets preset
  where preset.preset_id = new.active_accent_preset_id
    and preset.user_id = new.user_id;

  if v_hex is null then
    raise exception 'The selected accent preset does not belong to this account.'
      using errcode = '42501';
  end if;

  new.accent_color := 'aurora';
  new.accent_hex := v_hex;
  return new;
end;
$$;

drop trigger if exists public_player_profiles_validate_active_accent
  on public.public_player_profiles;

create trigger public_player_profiles_validate_active_accent
  before insert or update of user_id, active_accent_preset_id, accent_hex
  on public.public_player_profiles
  for each row execute function public.phase63_validate_profile_active_accent();

create or replace function public.phase63_clear_deleted_active_accent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.public_player_profiles profile
  set
    active_accent_preset_id = null,
    accent_hex = null,
    accent_color = 'aurora'
  where profile.user_id = old.user_id
    and profile.active_accent_preset_id = old.preset_id;
  return old;
end;
$$;

drop trigger if exists public_profile_accent_presets_clear_active
  on public.public_profile_accent_presets;

create trigger public_profile_accent_presets_clear_active
  before delete on public.public_profile_accent_presets
  for each row execute function public.phase63_clear_deleted_active_accent();

alter table public.public_profile_accent_presets enable row level security;
alter table public.public_profile_accent_presets force row level security;

drop policy if exists public_profile_accent_presets_owner_select
  on public.public_profile_accent_presets;
create policy public_profile_accent_presets_owner_select
  on public.public_profile_accent_presets
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists public_profile_accent_presets_owner_insert
  on public.public_profile_accent_presets;
create policy public_profile_accent_presets_owner_insert
  on public.public_profile_accent_presets
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists public_profile_accent_presets_owner_update
  on public.public_profile_accent_presets;
create policy public_profile_accent_presets_owner_update
  on public.public_profile_accent_presets
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists public_profile_accent_presets_owner_delete
  on public.public_profile_accent_presets;
create policy public_profile_accent_presets_owner_delete
  on public.public_profile_accent_presets
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.public_profile_accent_presets
  from public, anon, authenticated;

create or replace function public.list_my_accent_presets_v2()
returns table (
  preset_id uuid,
  name text,
  accent_hex text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    preset.preset_id,
    preset.name,
    preset.accent_hex,
    profile.active_accent_preset_id = preset.preset_id as is_active,
    preset.created_at,
    preset.updated_at
  from public.public_profile_accent_presets preset
  left join public.public_player_profiles profile
    on profile.user_id = preset.user_id
  where auth.role() = 'authenticated'
    and auth.uid() is not null
    and preset.user_id = auth.uid()
  order by preset.updated_at desc, preset.preset_id
  limit 24
$$;

create or replace function public.upsert_my_accent_preset_v2(
  p_preset_id uuid,
  p_name text,
  p_accent_hex text,
  p_select boolean
)
returns table (
  preset_id uuid,
  name text,
  accent_hex text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_hex text;
  v_name text;
  v_preset public.public_profile_accent_presets%rowtype;
begin
  if auth.role() <> 'authenticated' or v_user_id is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':accent-presets', 0)
  );

  v_hex := public.phase63_validate_accent_hex(p_accent_hex);
  v_name := public.phase63_validate_accent_preset_name(p_name, v_hex);

  if p_preset_id is null then
    if (
      select count(*)
      from public.public_profile_accent_presets preset
      where preset.user_id = v_user_id
    ) >= 24 then
      raise exception 'An account can save at most 24 accent presets.' using errcode = '22023';
    end if;

    insert into public.public_profile_accent_presets (user_id, name, accent_hex)
    values (v_user_id, v_name, v_hex)
    returning * into v_preset;
  else
    update public.public_profile_accent_presets preset
    set name = v_name, accent_hex = v_hex
    where preset.preset_id = p_preset_id
      and preset.user_id = v_user_id
    returning * into v_preset;

    if v_preset.preset_id is null then
      raise exception 'Accent preset not found.' using errcode = 'P0002';
    end if;
  end if;

  if coalesce(p_select, false) then
    insert into public.public_player_profiles (
      user_id,
      accent_color,
      active_accent_preset_id,
      accent_hex
    ) values (
      v_user_id,
      'aurora',
      v_preset.preset_id,
      v_preset.accent_hex
    )
    on conflict (user_id) do update
    set
      accent_color = 'aurora',
      active_accent_preset_id = excluded.active_accent_preset_id,
      accent_hex = excluded.accent_hex;
  elsif exists (
    select 1
    from public.public_player_profiles profile
    where profile.user_id = v_user_id
      and profile.active_accent_preset_id = v_preset.preset_id
  ) then
    update public.public_player_profiles profile
    set accent_hex = v_preset.accent_hex
    where profile.user_id = v_user_id;
  end if;

  return query
  select
    v_preset.preset_id,
    v_preset.name,
    v_preset.accent_hex,
    coalesce(profile.active_accent_preset_id = v_preset.preset_id, false),
    v_preset.created_at,
    v_preset.updated_at
  from (select 1) marker
  left join public.public_player_profiles profile
    on profile.user_id = v_user_id;
end;
$$;

create or replace function public.delete_my_accent_preset_v2(
  p_preset_id uuid
)
returns table (
  deleted boolean,
  active_accent_color text,
  active_accent_hex text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_deleted boolean := false;
begin
  if auth.role() <> 'authenticated' or v_user_id is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':accent-presets', 0)
  );

  delete from public.public_profile_accent_presets preset
  where preset.preset_id = p_preset_id
    and preset.user_id = v_user_id;
  v_deleted := found;

  return query
  select
    v_deleted,
    coalesce(profile.accent_color, 'aurora'),
    profile.accent_hex
  from (select 1) marker
  left join public.public_player_profiles profile
    on profile.user_id = v_user_id;
end;
$$;

-- Preserve the v1 signature and six-name response. The frozen Production
-- client cannot represent custom accents, so v1 saves leave any active custom
-- preset untouched rather than silently destroying a newer-client selection.
create or replace function public.upsert_my_public_player_profile(
  p_display_name text default null,
  p_accent_color text default 'aurora',
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':accent-presets', 0)
  );

  v_visibility := public.phase29_validate_public_profile_visibility(p_visibility);
  v_display_name := public.phase29_normalize_public_profile_text(p_display_name, 50);
  v_accent_color := public.phase29_validate_public_profile_accent_color(p_accent_color);
  v_flair_key := public.phase29_validate_public_profile_flair_key(p_flair_key);
  v_avatar_url := public.phase29_validate_public_profile_avatar_url(p_avatar_url, v_user_id);
  v_bio := public.phase29_normalize_public_profile_text(p_bio, 160);

  if v_visibility = 'public' and v_display_name is null then
    raise exception 'A display name is required before making a public profile visible.'
      using errcode = '22023';
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
    accent_color = case
      when public.public_player_profiles.active_accent_preset_id is null
        then excluded.accent_color
      else public.public_player_profiles.accent_color
    end,
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
  from public.public_player_profiles profile
  where profile.user_id = v_user_id
  limit 1;
end;
$$;

create or replace function public.get_my_public_player_profile_v2()
returns table (
  public_profile_id uuid,
  visibility text,
  display_name text,
  accent_color text,
  accent_hex text,
  active_accent_preset_id uuid,
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
    profile.accent_hex,
    profile.active_accent_preset_id,
    profile.flair_key,
    profile.avatar_url,
    profile.bio,
    profile.moderation_status,
    profile.created_at,
    profile.updated_at
  from public.public_player_profiles profile
  where auth.role() = 'authenticated'
    and auth.uid() is not null
    and profile.user_id = auth.uid()
  limit 1
$$;

create or replace function public.upsert_my_public_player_profile_v2(
  p_display_name text default null,
  p_accent_color text default 'aurora',
  p_active_accent_preset_id uuid default null,
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
  accent_hex text,
  active_accent_preset_id uuid,
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
  v_accent_hex text;
  v_flair_key text;
  v_avatar_url text;
  v_bio text;
begin
  if auth.role() <> 'authenticated' or v_user_id is null then
    raise exception 'Authentication required.' using errcode = '28000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':accent-presets', 0)
  );

  v_visibility := public.phase29_validate_public_profile_visibility(p_visibility);
  v_display_name := public.phase29_normalize_public_profile_text(p_display_name, 50);
  v_flair_key := public.phase29_validate_public_profile_flair_key(p_flair_key);
  v_avatar_url := public.phase29_validate_public_profile_avatar_url(p_avatar_url, v_user_id);
  v_bio := public.phase29_normalize_public_profile_text(p_bio, 160);

  if p_active_accent_preset_id is null then
    v_accent_color := public.phase29_validate_public_profile_accent_color(p_accent_color);
  else
    select preset.accent_hex
    into v_accent_hex
    from public.public_profile_accent_presets preset
    where preset.preset_id = p_active_accent_preset_id
      and preset.user_id = v_user_id;
    if v_accent_hex is null then
      raise exception 'Accent preset not found.' using errcode = 'P0002';
    end if;
    v_accent_color := 'aurora';
  end if;

  if v_visibility = 'public' and v_display_name is null then
    raise exception 'A display name is required before making a public profile visible.'
      using errcode = '22023';
  end if;

  insert into public.public_player_profiles (
    user_id,
    visibility,
    display_name,
    accent_color,
    active_accent_preset_id,
    accent_hex,
    flair_key,
    avatar_url,
    bio
  ) values (
    v_user_id,
    v_visibility,
    v_display_name,
    v_accent_color,
    p_active_accent_preset_id,
    v_accent_hex,
    v_flair_key,
    v_avatar_url,
    v_bio
  )
  on conflict (user_id) do update
  set
    visibility = excluded.visibility,
    display_name = excluded.display_name,
    accent_color = excluded.accent_color,
    active_accent_preset_id = excluded.active_accent_preset_id,
    accent_hex = excluded.accent_hex,
    flair_key = excluded.flair_key,
    avatar_url = excluded.avatar_url,
    bio = excluded.bio;

  return query
  select
    profile.public_profile_id,
    profile.visibility,
    profile.display_name,
    profile.accent_color,
    profile.accent_hex,
    profile.active_accent_preset_id,
    profile.flair_key,
    profile.avatar_url,
    profile.bio,
    profile.moderation_status,
    profile.created_at,
    profile.updated_at
  from public.public_player_profiles profile
  where profile.user_id = v_user_id
  limit 1;
end;
$$;

create or replace function public.get_public_player_profile_v2(
  p_public_profile_id uuid
)
returns table (
  public_profile_id uuid,
  display_name text,
  accent_color text,
  accent_hex text,
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
    profile.accent_hex,
    profile.flair_key,
    profile.avatar_url,
    profile.bio,
    profile.created_at,
    profile.updated_at
  from public.public_player_profiles profile
  where p_public_profile_id is not null
    and profile.public_profile_id = p_public_profile_id
    and profile.visibility = 'public'
    and profile.moderation_status = 'active'
  limit 1
$$;

create or replace function public.get_public_player_profiles_v2(
  p_public_profile_ids uuid[]
)
returns table (
  public_profile_id uuid,
  display_name text,
  accent_color text,
  accent_hex text,
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
    profile.accent_hex,
    profile.flair_key,
    profile.avatar_url,
    profile.bio,
    profile.created_at,
    profile.updated_at
  from (
    select distinct requested.public_profile_id
    from unnest(p_public_profile_ids) requested(public_profile_id)
    where requested.public_profile_id is not null
  ) requested
  join public.public_player_profiles profile
    on profile.public_profile_id = requested.public_profile_id
  where profile.visibility = 'public'
    and profile.moderation_status = 'active';
end;
$$;

create or replace function public.list_public_player_directory_v2(
  p_search text default null,
  p_bucket text default 'multiplayer:og',
  p_min_rating integer default null,
  p_max_rating integer default null,
  p_sort text default 'rating',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  public_profile_id uuid,
  display_name text,
  accent_color text,
  accent_hex text,
  flair_key text,
  profile_updated_at timestamptz,
  bucket text,
  rating integer,
  games_played integer,
  wins integer,
  losses integer,
  draws integer,
  provisional boolean,
  rating_updated_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    directory.public_profile_id,
    directory.display_name,
    directory.accent_color,
    profile.accent_hex,
    directory.flair_key,
    directory.profile_updated_at,
    directory.bucket,
    directory.rating,
    directory.games_played,
    directory.wins,
    directory.losses,
    directory.draws,
    directory.provisional,
    directory.rating_updated_at,
    directory.total_count
  from public.list_public_player_directory_v1(
    p_search,
    p_bucket,
    p_min_rating,
    p_max_rating,
    p_sort,
    p_limit,
    p_offset
  ) directory
  join public.public_player_profiles profile
    on profile.public_profile_id = directory.public_profile_id
$$;

create or replace function public.get_public_ranked_leaderboard_v2(
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
  accent_hex text,
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
language sql
stable
security definer
set search_path = ''
as $$
  select
    leaderboard.leaderboard_key,
    leaderboard.rank,
    leaderboard.bucket,
    leaderboard.public_profile_id,
    leaderboard.display_name,
    leaderboard.accent_color,
    profile.accent_hex,
    leaderboard.flair_key,
    leaderboard.avatar_url,
    leaderboard.rating,
    leaderboard.games_played,
    leaderboard.wins,
    leaderboard.losses,
    leaderboard.draws,
    leaderboard.provisional,
    leaderboard.latest_rating_delta,
    leaderboard.latest_rating_movement_at,
    leaderboard.peak_rating,
    leaderboard.profile_updated_at,
    leaderboard.leaderboard_updated_at
  from public.get_public_ranked_leaderboard(p_bucket, p_limit, p_offset) leaderboard
  join public.public_player_profiles profile
    on profile.public_profile_id = leaderboard.public_profile_id
$$;

comment on table public.public_profile_accent_presets is
  'Private account-owned custom accent presets. Browser access is RPC-only.';
comment on function public.list_my_accent_presets_v2() is
  'Lists at most 24 private accent presets for the current account.';
comment on function public.upsert_my_accent_preset_v2(uuid, text, text, boolean) is
  'Creates or updates one current-account accent preset under a transactional 24-item limit.';
comment on function public.delete_my_accent_preset_v2(uuid) is
  'Deletes one current-account accent preset and falls back to Aurora when it was active.';
comment on function public.get_public_player_profile_v2(uuid) is
  'Public profile v2 projection adding only the validated active accent hex.';
comment on function public.list_public_player_directory_v2(
  text, text, integer, integer, text, integer, integer
) is
  'Public community directory v2 projection adding only the validated active accent hex.';
comment on function public.get_public_ranked_leaderboard_v2(text, integer, integer) is
  'Authenticated public leaderboard v2 projection adding only the validated active accent hex.';

revoke all on function public.phase29_validate_public_profile_accent_color(text)
  from public, anon, authenticated;
revoke all on function public.phase63_validate_accent_hex(text)
  from public, anon, authenticated;
revoke all on function public.phase63_validate_accent_preset_name(text, text)
  from public, anon, authenticated;
revoke all on function public.phase63_touch_accent_preset_updated_at()
  from public, anon, authenticated;
revoke all on function public.phase63_validate_profile_active_accent()
  from public, anon, authenticated;
revoke all on function public.phase63_clear_deleted_active_accent()
  from public, anon, authenticated;

revoke all on function public.list_my_accent_presets_v2()
  from public, anon, authenticated;
revoke all on function public.upsert_my_accent_preset_v2(uuid, text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.delete_my_accent_preset_v2(uuid)
  from public, anon, authenticated;
revoke all on function public.get_my_public_player_profile_v2()
  from public, anon, authenticated;
revoke all on function public.upsert_my_public_player_profile_v2(
  text, text, uuid, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.get_public_player_profile_v2(uuid)
  from public, anon, authenticated;
revoke all on function public.get_public_player_profiles_v2(uuid[])
  from public, anon, authenticated;
revoke all on function public.list_public_player_directory_v2(
  text, text, integer, integer, text, integer, integer
) from public, anon, authenticated;
revoke all on function public.get_public_ranked_leaderboard_v2(text, integer, integer)
  from public, anon, authenticated;

grant execute on function public.list_my_accent_presets_v2()
  to authenticated;
grant execute on function public.upsert_my_accent_preset_v2(uuid, text, text, boolean)
  to authenticated;
grant execute on function public.delete_my_accent_preset_v2(uuid)
  to authenticated;
grant execute on function public.get_my_public_player_profile_v2()
  to authenticated;
grant execute on function public.upsert_my_public_player_profile_v2(
  text, text, uuid, text, text, text, text
) to authenticated;
grant execute on function public.get_public_player_profile_v2(uuid)
  to anon, authenticated;
grant execute on function public.get_public_player_profiles_v2(uuid[])
  to anon, authenticated;
grant execute on function public.list_public_player_directory_v2(
  text, text, integer, integer, text, integer, integer
) to anon, authenticated;
grant execute on function public.get_public_ranked_leaderboard_v2(text, integer, integer)
  to authenticated;

-- Reassert the exact v1 grants after replacement.
revoke all on function public.upsert_my_public_player_profile(
  text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.upsert_my_public_player_profile(
  text, text, text, text, text, text
) to authenticated;
