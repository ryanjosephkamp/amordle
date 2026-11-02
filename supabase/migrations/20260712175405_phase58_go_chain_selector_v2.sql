-- Phase 58: deterministic GO chain selector v2.
--
-- Existing ranked Daily authority rows and games remain v1. New Daily GO
-- games dated on or after the cutoff use the same hash-ranked selector as
-- the TypeScript client. Public projections receive only the selector
-- version; canonical answers remain private.

alter table brrrdle_private.ranked_daily_game_authority
  add column if not exists answer_generation_version text not null default 'v1';

alter table brrrdle_private.ranked_daily_game_authority
  add constraint ranked_daily_game_authority_answer_generation_version_check
  check (answer_generation_version in ('v1', 'v2'));

-- Preserve the exact applied Phase 55 selector for legacy dates and rows.
alter function brrrdle_private.phase55_ranked_daily_answers(text, text)
  rename to phase58_ranked_daily_answers_v1;

create or replace function brrrdle_private.phase58_go_answer_generation_version(
  p_daily_date_key text,
  p_mode text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_mode text := lower(coalesce(p_mode, ''));
begin
  if p_daily_date_key !~ '^\d{4}-\d{2}-\d{2}$' or v_mode not in ('og', 'go') then
    raise exception 'Ranked Daily answer key is invalid.' using errcode = '22023';
  end if;

  if v_mode = 'go' and p_daily_date_key::date >= date '2026-07-14' then
    return 'v2';
  end if;
  return 'v1';
end;
$$;

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
  v_value := brrrdle_private.phase55_u32(v_value * 2246822507::bigint);
  v_value := brrrdle_private.phase55_u32(v_value # (v_value >> 13));
  v_value := brrrdle_private.phase55_u32(v_value * 3266489909::bigint);
  return brrrdle_private.phase55_u32(v_value # (v_value >> 16));
end;
$$;

create or replace function brrrdle_private.phase58_ranked_daily_go_answers_v2(
  p_daily_date_key text,
  p_ranked boolean
)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  v_answer_count integer;
  v_ranked_answers text[];
  v_stream_key text;
  v_unranked_answers text[];
begin
  if p_daily_date_key !~ '^\d{4}-\d{2}-\d{2}$' or p_ranked is null then
    raise exception 'Ranked Daily GO selector input is invalid.' using errcode = '22023';
  end if;

  select count(*)::integer
  into v_answer_count
  from brrrdle_private.ranked_daily_word_catalog catalog
  where catalog.kind = 'answer';

  if v_answer_count < 10 then
    raise exception 'Ranked Daily GO answer catalog cannot provide separated chains.' using errcode = '22023';
  end if;

  v_stream_key := 'go-chain-v2:multiplayer:daily:unranked:'
    || p_daily_date_key || ':5:expert:5';

  select array_agg(ranked.word order by ranked.rank_value, ranked.word)
  into v_unranked_answers
  from (
    select
      catalog.word,
      brrrdle_private.phase58_mix_u32(
        brrrdle_private.phase55_fnv1a(v_stream_key || ':' || catalog.word)
      ) as rank_value
    from brrrdle_private.ranked_daily_word_catalog catalog
    where catalog.kind = 'answer'
    order by rank_value, catalog.word
    limit 5
  ) ranked;

  if not p_ranked then
    return v_unranked_answers;
  end if;

  v_stream_key := 'go-chain-v2:multiplayer:daily:ranked:'
    || p_daily_date_key || ':5:expert:5';

  select array_agg(ranked.word order by ranked.rank_value, ranked.word)
  into v_ranked_answers
  from (
    select
      catalog.word,
      brrrdle_private.phase58_mix_u32(
        brrrdle_private.phase55_fnv1a(v_stream_key || ':' || catalog.word)
      ) as rank_value
    from brrrdle_private.ranked_daily_word_catalog catalog
    where catalog.kind = 'answer'
      and catalog.word <> all (v_unranked_answers)
    order by rank_value, catalog.word
    limit 5
  ) ranked;

  if cardinality(v_unranked_answers) <> 5 or cardinality(v_ranked_answers) <> 5 then
    raise exception 'Ranked Daily GO selector did not produce complete chains.' using errcode = '22023';
  end if;

  return v_ranked_answers;
end;
$$;

-- Retain the original callable name because the applied finalizer and action
-- authority functions resolve it at execution time.
create or replace function brrrdle_private.phase55_ranked_daily_answers(
  p_daily_date_key text,
  p_mode text
)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
begin
  if brrrdle_private.phase58_go_answer_generation_version(p_daily_date_key, p_mode) = 'v2' then
    return brrrdle_private.phase58_ranked_daily_go_answers_v2(p_daily_date_key, true);
  end if;
  return brrrdle_private.phase58_ranked_daily_answers_v1(p_daily_date_key, p_mode);
end;
$$;

create or replace function brrrdle_private.phase58_stamp_ranked_daily_authority_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.answer_generation_version := brrrdle_private.phase58_go_answer_generation_version(
    new.daily_date_key,
    new.mode
  );
  return new;
end;
$$;

drop trigger if exists phase58_stamp_ranked_daily_authority_version
  on brrrdle_private.ranked_daily_game_authority;
create trigger phase58_stamp_ranked_daily_authority_version
before insert or update on brrrdle_private.ranked_daily_game_authority
for each row execute function brrrdle_private.phase58_stamp_ranked_daily_authority_version();

create or replace function brrrdle_private.phase58_stamp_ranked_daily_projection_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version text;
begin
  if new.ranked = true and new.scope = 'daily' and new.mode = 'go' then
    v_version := brrrdle_private.phase58_go_answer_generation_version(
      new.daily_date_key,
      new.mode
    );
    new.projection := coalesce(new.projection, '{}'::jsonb)
      || jsonb_build_object('answerGenerationVersion', v_version);
  end if;
  return new;
end;
$$;

drop trigger if exists phase58_stamp_ranked_daily_projection_version
  on public.async_multiplayer_games;
create trigger phase58_stamp_ranked_daily_projection_version
before insert or update on public.async_multiplayer_games
for each row execute function brrrdle_private.phase58_stamp_ranked_daily_projection_version();

revoke all on function brrrdle_private.phase58_ranked_daily_answers_v1(text, text)
  from public, anon, authenticated;
revoke all on function brrrdle_private.phase58_go_answer_generation_version(text, text)
  from public, anon, authenticated;
revoke all on function brrrdle_private.phase58_mix_u32(bigint)
  from public, anon, authenticated;
revoke all on function brrrdle_private.phase58_ranked_daily_go_answers_v2(text, boolean)
  from public, anon, authenticated;
revoke all on function brrrdle_private.phase55_ranked_daily_answers(text, text)
  from public, anon, authenticated;
revoke all on function brrrdle_private.phase58_stamp_ranked_daily_authority_version()
  from public, anon, authenticated;
revoke all on function brrrdle_private.phase58_stamp_ranked_daily_projection_version()
  from public, anon, authenticated;

comment on column brrrdle_private.ranked_daily_game_authority.answer_generation_version is
  'v1 preserves the Phase 55 selector; v2 uses Phase 58 deterministic hash-ranked GO chains.';
