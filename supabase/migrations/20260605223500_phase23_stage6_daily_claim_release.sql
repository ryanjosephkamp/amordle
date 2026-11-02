-- Phase 23 Stage 6: release Daily Multiplayer claims only for creator-cancelled,
-- unjoined lobbies/games. Joined or terminal Daily Multiplayer participation
-- remains claimed for the UTC date and bucket.

create or replace function public.release_daily_multiplayer_claim(
  p_user_id text,
  p_transport text,
  p_mode text,
  p_daily_date_key text,
  p_source_kind text,
  p_source_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if p_user_id is null
    or p_user_id = ''
    or p_daily_date_key is null
    or p_daily_date_key = ''
    or p_source_id is null
    or p_source_id = ''
  then
    return;
  end if;

  begin
    v_user_id := p_user_id::uuid;
  exception
    when invalid_text_representation then
      return;
  end;

  delete from public.multiplayer_daily_claims
  where user_id = v_user_id
    and transport = p_transport
    and mode = p_mode
    and daily_date_key = p_daily_date_key
    and source_kind = p_source_kind
    and source_id = p_source_id;
end;
$$;

revoke all on function public.release_daily_multiplayer_claim(text, text, text, text, text, text) from public;
revoke all on function public.release_daily_multiplayer_claim(text, text, text, text, text, text) from anon;
revoke all on function public.release_daily_multiplayer_claim(text, text, text, text, text, text) from authenticated;

create or replace function public.enforce_async_daily_multiplayer_claim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.scope = 'daily' then
    if new.status = 'cancelled' and new.player_two_user_id is null then
      perform public.release_daily_multiplayer_claim(new.host_user_id::text, 'async', new.mode, new.daily_date_key, 'async_game', new.id);
      perform public.release_daily_multiplayer_claim(new.player_one_user_id::text, 'async', new.mode, new.daily_date_key, 'async_game', new.id);
      return new;
    end if;

    perform public.claim_daily_multiplayer_participation(new.host_user_id::text, 'async', new.mode, new.daily_date_key, 'async_game', new.id);
    perform public.claim_daily_multiplayer_participation(new.player_one_user_id::text, 'async', new.mode, new.daily_date_key, 'async_game', new.id);
    perform public.claim_daily_multiplayer_participation(new.player_two_user_id::text, 'async', new.mode, new.daily_date_key, 'async_game', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_async_daily_multiplayer_claim_trigger on public.async_multiplayer_games;
create trigger enforce_async_daily_multiplayer_claim_trigger
  before insert or update of scope, mode, daily_date_key, host_user_id, player_one_user_id, player_two_user_id, status
  on public.async_multiplayer_games
  for each row
  execute function public.enforce_async_daily_multiplayer_claim();

create or replace function public.enforce_live_lobby_daily_multiplayer_claim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.scope = 'daily' then
    if new.status = 'cancelled' and new.match_id is null then
      perform public.release_daily_multiplayer_claim(new.host_user_id::text, 'live', new.mode, new.daily_date_key, 'live_lobby', new.id);
      return new;
    end if;

    perform public.claim_daily_multiplayer_participation(new.host_user_id::text, 'live', new.mode, new.daily_date_key, 'live_lobby', new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_live_lobby_daily_multiplayer_claim_trigger on public.live_lobbies;
create trigger enforce_live_lobby_daily_multiplayer_claim_trigger
  before insert or update of scope, mode, daily_date_key, host_user_id, status, match_id
  on public.live_lobbies
  for each row
  execute function public.enforce_live_lobby_daily_multiplayer_claim();
