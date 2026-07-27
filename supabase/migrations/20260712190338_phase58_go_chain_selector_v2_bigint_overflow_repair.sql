-- Phase 58 corrective migration: preserve the v2 mixer contract while
-- performing its unsigned 32-bit multiplications outside bigint range.

create or replace function brrrdle_private.phase58_mix_u32(p_value bigint)
returns bigint
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_value bigint := brrrdle_private.phase55_u32(p_value);
begin
  v_value := brrrdle_private.phase55_u32(v_value # (v_value >> 16));
  v_value := mod(v_value::numeric * 2246822507::numeric, 4294967296::numeric)::bigint;
  v_value := brrrdle_private.phase55_u32(v_value # (v_value >> 13));
  v_value := mod(v_value::numeric * 3266489909::numeric, 4294967296::numeric)::bigint;
  return brrrdle_private.phase55_u32(v_value # (v_value >> 16));
end;
$$;

revoke all on function brrrdle_private.phase58_mix_u32(bigint)
  from public, anon, authenticated;
