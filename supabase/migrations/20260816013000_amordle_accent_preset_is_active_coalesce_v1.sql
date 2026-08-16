-- Amordle · coalesce is_active at source in list_my_accent_presets_v2
--
-- WHY
--
-- `list_my_accent_presets_v2` computed
--
--   profile.active_accent_preset_id = preset.preset_id as is_active
--
-- Save a custom accent and then switch back to a named one, and
-- `active_accent_preset_id` goes null while the preset row survives. The
-- comparison is then `null = uuid`, which in SQL is NULL rather than false. The
-- client schema demanded a strict boolean, the parse threw, and /profile
-- rendered "Profile unavailable" with a Try again button that could never
-- succeed — for any player who tried a custom accent and changed their mind.
--
-- v10.1 fixed that on the client, which tolerates null and reads it as false.
-- That is the right meaning — "no active preset" is exactly "this preset is not
-- the active one" — but the wrong place for it to be decided. This moves the
-- decision to the source.
--
-- This is not a new policy. `upsert_my_accent_preset_v2`, two functions further
-- down the same migration, already returns
-- `coalesce(profile.active_accent_preset_id = v_preset.preset_id, false)`. The
-- two functions returned the same column and disagreed about whether it could
-- be null. Only one of them was ever wrong.
--
-- WHAT CHANGES
--
-- The function body, and nothing else. The signature, volatility, security,
-- search_path, ordering, limit and grants are re-emitted exactly as they were,
-- so nothing downstream moves. No table, column, constraint or row is touched,
-- and no data is read or written by this migration.
--
-- SAFETY
--
-- Forward-compatible with the deployed client either way: a client that
-- tolerates null still accepts false. Reversing it is re-emitting the previous
-- body, which is recorded in the decision packet.

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
    coalesce(profile.active_accent_preset_id = preset.preset_id, false) as is_active,
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

comment on function public.list_my_accent_presets_v2() is
  'Lists the caller''s saved custom accent presets. is_active is false rather than null when no preset is active.';

revoke all on function public.list_my_accent_presets_v2() from public;
revoke all on function public.list_my_accent_presets_v2() from anon;
grant execute on function public.list_my_accent_presets_v2() to authenticated;
