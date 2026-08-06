# Claude/Codex Continuity Log

## Status

- Handoff state: v6.7 complete and OWNER-ACCEPTED (2026-08-06)
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

### 2026-08-06T01:45:00Z — v6.7 owner-feedback polish, hosted-green candidate

- Harness/model: Claude Code / Opus 5
- Workspace: `/Users/noir/Documents/amordle-final`
- Branch: `codex/amordle-terminal-greenfield-implementation-2026-07-27`
- Head/tree before: `16d7a510a15ab5eaf254bc2c163f77b9059854cc` / `a4a3a5a130d21d72444e60e09de4d7c30e4f5152`
- Head/tree after: `0fbcb4d83532901c32d8db12850f4679f3582500` / `8f6b48b4100c15eca1c3435926d7cb87224a3006`
- Scope completed: `ANNOT-01` through `ANNOT-12`, plus findings register `W-1` through
  `W-10`. `W-11` is implemented in source but its migration is unapplied (below).
- Decisions:
  - The four contrast annotations shared one cascade bug; contextual muting moved into a
    `context` layer so control-state rules always win, rather than patching each site.
  - The contrast sweep then exposed a second mirror-image class (transparent hover
    surfaces keeping selected ink). Current appearance was preserved by correcting the
    ink, not by letting hover paint new fills.
  - Active Solo reuses the existing `.responsive-table` primitive instead of new CSS.
  - Stats plots cumulative rating _change_, since History records deltas and not absolute
    ratings; inventing a baseline would be fabricated history.
  - `W-5` needed no server change — the RPC always accepted all four public lanes.
- Validation: `pnpm check` green (107/107 baseline, 45/45 + 8/8 migrations, MP audit
  73/73, parity 237/237, three HTTP interfaces, CSS tokens, budgets); 137 domain, 27
  browser, 20 fixture E2E, 20 visual local; hosted acceptance PASS.
- Preview: `dpl_AL4UNa59TdXhmMn8ek2rBu6oMGrR` —
  <https://amordle-gghpij2o3-ryanjosephkamps-projects.vercel.app>
- Supabase/Vercel/Storage/Auth mutations: one Preview deployment. **No database
  migration was applied.** No Production, Storage, or Auth configuration change.
- Disposable resources: hosted run `e2e_20260806T013802070Z_0fbcb4d8_fae940c4` — 6 Auth
  users, 7 games, 7 queue requests, 25 accent presets, 2 storage objects.
- Cleanup: attempt 1, status `zero-residue`; 25 residue probes plus Auth residue all zero.
- Known failures/risks:
  1. `20260805200000_amordle_ranked_leaderboard_bucket_repair.sql` is written, registered,
     and committed but **not pushed**. Its authorization requires a local replay, and
     Docker image pulls hang behind Docker Desktop's proxy
     (`http.docker.internal:3128`). Registries answer from the shell, so this is a Docker
     Desktop setting. Until applied, Leaderboards OG/GO cannot show ratings settled under
     the current v3 ranked Practice authority — the pre-existing defect, not a regression.
  2. `W-11` has no end-to-end settled proof: the hosted suite settles only a timed
     Practice match (excluded from leaderboards) and a Daily match (mapping already
     correct). Closing it needs an untimed ranked Practice two-player flow.
  3. `verify:budgets` reports 0B JS/0B CSS for both routes, so the bundle gate is not
     measuring. Pre-existing; untouched and reported.
- Next exact action: owner reviews the Preview and decides on the unapplied migration.
- Merge authorized: no
- Production release authorized: no

### 2026-08-06T02:55:00Z — W-11 migration replayed, applied, and re-verified

- Harness/model: Claude Code / Opus 5
- Branch: `codex/amordle-terminal-greenfield-implementation-2026-07-27`
- Scope completed: `W-11` closed. The blocker recorded in the previous entry is resolved.
- Unblocking: the owner disabled Docker Desktop's manual proxy, after which image pulls
  succeed. The daemon had been reachable all along; only registry access was blocked.
- Replay: `supabase db diff --linked` provisioned a fresh shadow database and applied all
  53 migrations in order without error, including
  `20260805200000_amordle_ranked_leaderboard_bucket_repair.sql`.
- Dry-run: `migration list --linked` showed exactly one pending migration and zero
  remote-only drift, before and after.
- Applied: `supabase db push --linked` applied exactly that one file. Migrations are now
  53 synchronized — 45 immutable plus 8 authorized additive.
- Verified on remote: a `db dump` of the public schema confirms the deployed
  `get_public_ranked_leaderboard` maps `multiplayer:og -> async:og:amordle:v2` and
  `multiplayer:go -> async:go:amordle:v2`, with the reverse map and row filter updated
  and no remaining `'async:og'` / `'async:go'` literals. Signature, grants, and the `_v2`
  wrapper are unchanged.
- Hosted re-run: `e2e_20260806T024758627Z_2c6980ca_30d0b6d8` — 20 fixture, 3 service, 20
  visual, parity 237/237. All four leaderboard lanes resolved; Daily OG returned 2 rows.
- Cleanup: attempt 1, `zero-residue`; 6 Auth users, 7 games, 25 accent presets, 2 storage
  objects removed; every residue probe and Auth residue zero.
- Supabase/Vercel mutations: one authorized migration applied. Edge Function
  `account-lifecycle-v1` still ACTIVE v1 with JWT verification. No Production change.
- Shadow-database containers and volumes removed after the replay.
- Known failures/risks:
  1. `W-11` still has no end-to-end _settled_ proof for the untimed ranked Practice lane;
     the hosted suite settles only a timed Practice match and a Daily match.
  2. `verify:budgets` reports 0B JS/0B CSS for both routes (pre-existing).
- Next exact action: owner reviews the Preview and decides on merge and Production.
- Merge authorized: no
- Production release authorized: no

### 2026-08-06T03:10:00Z — owner acceptance recorded

- Owner reviewed the protected Preview and accepted the work: "the game runs very
  smoothly... no significant bugs or problems". Recorded in `progress/run_state.json`
  (`status: owner-accepted`) and `progress/events.jsonl`
  (`stage-2-v6.7-owner-accepted`).
- Accepted commit: `afd48b6ce209767bc58ddeb9930f0fb9192edd17`
- Accepted tag: `amordle-stage2-v6.7-owner-feedback-polish-golden-2026-08-05`
- Accepted Preview: `dpl_AL4UNa59TdXhmMn8ek2rBu6oMGrR`
- Scope accepted: `ANNOT-01`..`ANNOT-12` and findings register `W-1`..`W-11`, with the
  two open items acknowledged as known.
- Merge: owner authorized, but **not performed**. See below.
- Production release: still NOT authorized.

#### Why the merge was not performed

The owner authorized merging. On inspection the default branch
`bootstrap/greenfield-2026-07-20` is an **unrelated history** — decision `D-002`
deliberately made the implementation lineage an orphan branch so that "review uses exact
commits/manifests rather than an unrelated-history PR". The default branch holds 119
bootstrap-only files; this branch holds 598. Eleven paths exist on both sides and **all
eleven differ**, including seven files inside the 107-file immutable bootstrap baseline.

A merge would therefore require `--allow-unrelated-histories` and eleven manual conflict
resolutions on governance-critical files, while delivering no functional benefit: the
default branch would simply become a copy of this one. Backup and revertability — the
owner's stated conditions — are already satisfied by the pushed branch and the golden tag.

Escalated to the owner with two clean alternatives instead: promote this branch to default
(no merge, no conflicts), or leave the lineages separate and keep branching from the
golden tag. Awaiting that decision; nothing was changed in the meantime.
