-- Phase 55 ranked Daily cleanup orphan repair.
--
-- Pair reservations are created before game finalization. Cleanup must
-- therefore discover the private dependency chain from the reservation table,
-- not only from authority rows that may not exist after a failed finalization.

create or replace function public.cleanup_ranked_daily_multiplayer_for_users(
  p_user_ids uuid[]
)
returns table (
  action_rows_deleted integer,
  authority_rows_deleted integer,
  reservation_rows_deleted integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action_rows_deleted integer := 0;
  v_authority_rows_deleted integer := 0;
  v_game_ids text[] := array[]::text[];
  v_reservation_rows_deleted integer := 0;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  if p_user_ids is null or cardinality(p_user_ids) = 0 then
    return query select 0, 0, 0;
    return;
  end if;

  select coalesce(array_agg(reservation.game_id), array[]::text[])
  into v_game_ids
  from brrrdle_private.ranked_daily_pair_reservations reservation
  where reservation.player_one_user_id = any(p_user_ids)
    or reservation.player_two_user_id = any(p_user_ids);

  if cardinality(v_game_ids) = 0 then
    return query select 0, 0, 0;
    return;
  end if;

  delete from brrrdle_private.ranked_daily_action_ledger action
  where action.game_id = any(v_game_ids);
  get diagnostics v_action_rows_deleted = row_count;

  delete from brrrdle_private.ranked_daily_game_authority authority
  where authority.game_id = any(v_game_ids);
  get diagnostics v_authority_rows_deleted = row_count;

  delete from brrrdle_private.ranked_daily_pair_reservations reservation
  where reservation.game_id = any(v_game_ids);
  get diagnostics v_reservation_rows_deleted = row_count;

  return query select
    v_action_rows_deleted,
    v_authority_rows_deleted,
    v_reservation_rows_deleted;
end;
$$;

revoke all on function public.cleanup_ranked_daily_multiplayer_for_users(uuid[])
  from public, anon, authenticated;
grant execute on function public.cleanup_ranked_daily_multiplayer_for_users(uuid[])
  to service_role;

comment on function public.cleanup_ranked_daily_multiplayer_for_users(uuid[])
  is 'Service-role-only cleanup for ranked Daily reservations and any dependent authority/action rows associated with supplied users.';

-- Rollback notes:
-- - Restore the 20260710180608 definition only if no unfinalized reservation
--   can remain for a cleanup target.
-- - Do not weaken grants or expose private tables to browser roles.

-- Remote probes:
-- - create or identify a reservation without authority and prove cleanup
--   removes it before queue deletion;
-- - prove finalized action/authority/reservation chains are removed in order;
-- - prove repeated cleanup returns zero counts and remains service-role-only.
