# Verified Current State

Verified read-only on 2026-08-05 before the handoff package was committed.
All drift-prone identities must be revalidated by Claude Code.

## Repository

- Workspace: `/Users/noir/Documents/amordle-final`
- GitHub: `ryanjosephkamp/amordle`
- Visibility: private
- Remote: `https://github.com/ryanjosephkamp/amordle.git`
- Current branch:
  `codex/amordle-terminal-greenfield-implementation-2026-07-27`
- Accepted v6.6 code/evidence golden commit:
  `16d7a510a15ab5eaf254bc2c163f77b9059854cc`
- Accepted v6.6 golden tree:
  `a4a3a5a130d21d72444e60e09de4d7c30e4f5152`
- Accepted v6.6 golden tag:
  `amordle-stage2-v6.6-account-controls-combat-stats-responsive-golden-2026-08-02`
- Default branch: `bootstrap/greenfield-2026-07-20`
- Open or historical PR for the implementation branch at preparation time:
  none returned by GitHub
- Worktrees at preparation time: only the primary checkout

The branch and remote were synchronized at the accepted v6.6 golden commit
before the three owner-feedback source artifacts and this handoff package were
committed. The handoff checkpoint adds documentation and evidence only; it does
not change the accepted application source tree.

## Deployed application

- Protected Preview URL:
  `https://amordle-j0a0ycuc0-ryanjosephkamps-projects.vercel.app`
- Protected Preview deployment: `dpl_526Pf8MBtD2GionGGuX7y5ViyuGf`
- Preview status verified: Ready
- Preview application commit recorded in run state:
  `f0a3a10c116530641cb23bafce0aea22f8ba53e5`
- Preview evidence commit recorded in run state:
  `2330dd6bd90fb0c8386f4b31508d1eaefdc5322b`
- Frozen Production deployment: `dpl_739mtwiXc9pZPef3pxsKumwC9DfG`
- Production status verified: Ready

No Preview or Production deployment was changed for this handoff.

## Supabase

- Linked project: `squqdstdvbsvhagfuzgj` (`amordle`)
- Status verified: `ACTIVE_HEALTHY`
- Migrations: 52 local/remote synchronized
  - 45 immutable baseline migrations
  - 7 separately authorized additive migrations
- Edge Function: `account-lifecycle-v1`
- Function ID: `8e75a009-e375-4a6e-8de6-6ebb92e1e2c0`
- Function status/version: `ACTIVE`, version `1`
- JWT verification: enabled

The locked BRRRDLE-DEV Supabase project was observed as separate and inactive.
It was not modified and remains outside scope.

## Acceptance invariants

Focused live verification passed:

- immutable bootstrap baseline: 107/107
- immutable migrations: 45/45
- authorized additive migrations: 7/7
- functional parity registry: 237/237 acceptance-verified
- multiplayer audit: 73/73
- application API routes/interfaces: exactly three

The complete v6.6 acceptance evidence is in:

- `reports/stage-2-v6.6-account-controls-combat-stats-responsive-completion.md`
- `reports/stage-2-v6.6-account-controls-combat-stats-responsive-completion.html`
- `acceptance/stage-2-v6.6-account-controls-combat-stats-responsive-manual-checklist.md`
- `acceptance/stage-2-v6.6-account-controls-combat-stats-responsive-manual-checklist.html`
- `progress/run_state.json`
- `progress/events.jsonl`

## Current next work

The owner supplied twelve annotated screenshots after v6.6. Mandatory planning
scope is `ANNOT-01` through `ANNOT-12` in the canonical intake. No part of that
scope has been implemented in the accepted v6.6 application.

The current task is therefore planning and then, only after separate owner
authorization, implementation of the v6.7 polish/remediation cycle.

## Hard boundaries

- No merge or default-branch change is authorized.
- No Production release or Production configuration change is authorized.
- No real player or Auth-user deletion is authorized.
- No stash inspection is authorized.
- The 45 immutable migrations must remain byte-for-byte unchanged.
- Any new migration or service interface requires an exact forward-only
  decision packet and separate authorization.
- Secrets, raw Auth identifiers, unsolved answers, and private player data must
  not enter source, logs, screenshots, reports, or prompts.
- The locked BRRRDLE-DEV shell is read-only.
