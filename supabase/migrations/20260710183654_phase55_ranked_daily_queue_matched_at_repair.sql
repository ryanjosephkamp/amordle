-- Phase 55 ranked Daily queue matched-at repair.
--
-- The ranked Daily queue claim and status functions introduced by
-- 20260710061039 read and write this nullable timestamp. The underlying queue
-- table predates that contract and did not yet include the column.

alter table public.multiplayer_matchmaking_queue
  add column if not exists matched_at timestamptz;

comment on column public.multiplayer_matchmaking_queue.matched_at
  is 'Server-authored time when a ranked queue request was paired; null while unmatched or after terminal requeue reset.';

-- Rollback notes:
-- - Do not drop this column while any deployed ranked Daily claim/status
--   function reads or writes matched_at.
-- - A rollback must first restore function definitions that do not reference
--   matched_at, then verify no caller depends on the timestamp.

-- Remote probes:
-- - prove the column exists once, is timestamptz, nullable, and has no default;
-- - prove ranked Daily pair claim writes matched_at for both requests;
-- - prove terminal requeue creates a new request whose matched_at starts null;
-- - preserve all queue RLS policies, grants, indexes, and Practice behavior.
