# Claude/Codex Continuity Log

## Status

- Handoff state: v6.7 implementation in progress
- Current authority: owner execution authorization, 2026-08-05
- Last accepted application golden commit:
  `16d7a510a15ab5eaf254bc2c163f77b9059854cc`
- Mandatory scope: `ANNOT-01` through `ANNOT-12` plus `W-1` through `W-11`
- Merge authorized: no
- Production release authorized: no

## Operating notes

- The Supabase CLI is a project devDependency, not a global install. Invoke it as
  `pnpm exec supabase ...`; a bare `which supabase` reports "not found" and has
  already misled one audit into believing it was unavailable. (`W-10`.)
- `README.md` and `bootstrap/DECISION-LEDGER.md` are inside the 107-file immutable
  bootstrap baseline. Operating notes and decision records belong here instead;
  `pnpm verify:bootstrap` fails on any edit to those files.

## Authorized additive migrations under D-005

- `20260805200000_amordle_ranked_leaderboard_bucket_repair.sql` — authorized by the
  owner on 2026-08-05 for `W-11`. `get_public_ranked_leaderboard` still resolved
  `multiplayer:og`/`multiplayer:go` to the pre-v2 storage buckets `async:og`/
  `async:go`, which the current v3 combat authority never writes, so no rating
  earned in ranked Practice today could appear on Leaderboards (`ACC-12.b/d`). It
  applies the same repair `20260801051509` already made for the directory and
  public-stats RPCs. Forward-only `create or replace` of one function body; no
  column, table, grant, role, RLS, or signature change. Immutable migrations remain
  45/45; authorized additive 7 -> 8. Registered by hash in
  `scripts/verify-bootstrap-baseline.mjs`.

## How to maintain this log

After execution is separately authorized, Claude should append one entry per
cohesive checkpoint. Never include secrets, passwords, raw Auth IDs, private
player data, unsolved answers, or disposable-account credentials.

Use this template:

```markdown
### YYYY-MM-DDTHH:MM:SSZ — checkpoint name

- Harness/model: Claude Code / [model]
- Workspace: `/Users/noir/Documents/amordle-final`
- Branch: `[branch]`
- Head/tree before: `[commit]` / `[tree]`
- Head/tree after: `[commit]` / `[tree]`
- Remote branch OID: `[oid]`
- Scope completed: [exact requirements]
- Files changed: [bounded paths or linked manifest]
- Decisions: [important implementation decisions]
- Validation: [exact commands and results]
- Preview: [unchanged or exact URL/deployment/commit]
- Supabase/Vercel/Storage/Auth mutations: [none or separately authorized receipt]
- Disposable resources: [registered identifiers in safe redacted form]
- Cleanup: [not applicable, pending, or exact zero-residue receipt]
- Known failures/risks: [honest status]
- Next exact action: [one action]
- Merge authorized: no
- Production release authorized: no
```

## Planning result

Not yet recorded. After owner approval, add the accepted plan's tracked path,
date, and explicit execution authorization message here.

## Checkpoint entries

None yet.
