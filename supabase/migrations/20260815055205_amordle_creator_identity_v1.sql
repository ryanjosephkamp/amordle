-- Amordle v10 creator identity.
--
-- Adds a fourth flair, `creator`, and a seventh named accent, `voltage`, both
-- restricted to the account that built the game.
--
-- The restriction is a CHECK constraint on the row rather than a test of the
-- caller, and that is the point. Flair has always been self-assertion: the
-- validator normalises a string and the enum lists what is allowed, so anything
-- in the list is available to anyone who calls the RPC, whether or not the
-- picker offers it. A caller-based gate would have to be repeated in every
-- write path — the two v2 upserts, the superseded v1 upsert, and any future
-- one — and would be silently bypassed by the first path that forgot it.
--
-- Binding the value to a user id in a CHECK makes the rule a property of the
-- data. There is no code path that can violate it: not a hand-written RPC call,
-- not a direct table write, not the service role, not a later migration that
-- forgets this one exists.
--
-- The validators are widened too, and gain a friendly error, so an ordinary
-- caller gets a sentence rather than a raw constraint violation. They are the
-- courtesy; the constraint is the authority.
--
-- Forward-only and additive. No existing row changes: every current row carries
-- a flair and accent from the old sets, so the new constraint is satisfied
-- trivially on validation.

-- 1. The fourth flair.

alter table public.public_player_profiles
  drop constraint if exists public_player_profiles_flair_key_check;

alter table public.public_player_profiles
  add constraint public_player_profiles_flair_key_check
  check (flair_key in ('none', 'daily', 'combat', 'creator'));

-- 2. The seventh named accent.

alter table public.public_player_profiles
  drop constraint if exists public_player_profiles_accent_color_check;

alter table public.public_player_profiles
  add constraint public_player_profiles_accent_color_check
  check (accent_color in ('ice', 'aurora', 'cyan', 'violet', 'rose', 'amber', 'voltage'));

-- 3. The restriction itself.
--
-- Written as one constraint over both columns so there is a single place that
-- names the account, and so widening it later — to an admin role, or to every
-- player once the accent has proven itself — is one edit rather than two.

alter table public.public_player_profiles
  drop constraint if exists public_player_profiles_creator_identity_check;

alter table public.public_player_profiles
  add constraint public_player_profiles_creator_identity_check
  check (
    (flair_key <> 'creator' and accent_color <> 'voltage')
    or user_id = '2bc33680-d9e5-4dd5-9965-24bc4ea43497'::uuid
  );

-- 4. The validators, widened, and told who is asking.
--
-- These become `stable` rather than `immutable` because they now read
-- auth.uid(). Nothing indexes on them, so no index is invalidated.

create or replace function public.phase29_validate_public_profile_flair_key(
  p_flair_key text
)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_flair text := lower(coalesce(nullif(btrim(p_flair_key), ''), 'none'));
begin
  if v_flair not in ('none', 'daily', 'combat', 'creator') then
    raise exception 'Unsupported public profile flair.' using errcode = '22023';
  end if;

  if v_flair = 'creator'
    and auth.uid() is distinct from '2bc33680-d9e5-4dd5-9965-24bc4ea43497'::uuid then
    raise exception 'That flair is reserved.' using errcode = '22023';
  end if;

  return v_flair;
end;
$$;

create or replace function public.phase29_validate_public_profile_accent_color(
  p_accent_color text
)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_accent text := lower(coalesce(nullif(btrim(p_accent_color), ''), 'aurora'));
begin
  if v_accent not in ('ice', 'aurora', 'cyan', 'violet', 'rose', 'amber', 'voltage') then
    raise exception 'Unsupported public profile accent color.' using errcode = '22023';
  end if;

  if v_accent = 'voltage'
    and auth.uid() is distinct from '2bc33680-d9e5-4dd5-9965-24bc4ea43497'::uuid then
    raise exception 'That accent is reserved.' using errcode = '22023';
  end if;

  return v_accent;
end;
$$;
