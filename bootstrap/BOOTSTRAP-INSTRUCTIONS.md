# amordle Fresh-Build Bootstrap Instructions

**Status:** Canonical instructions for the new Codex project/task.
**Date:** 2026-07-20

## 1. Intended use

After this clean bootstrap workspace is verified:

1. create a new local workspace from the clean default branch of `ryanjosephkamp/amordle`;
2. open that workspace as a new Codex project;
3. start a fresh task in Plan mode using the selected high-capability model;
4. paste the fresh-build planning prompt included in `START-HERE.md`;
5. let the model inspect the starter pack, concepts, migration ledger, live shell, and current official documentation;
6. align one complete end-to-end implementation plan;
7. explicitly authorize execution of that accepted plan in a later task;
8. allow autonomous implementation until the agreed completion gate or a genuine user-only blocker.

## 2. Required first read

The fresh planning task reads, in order:

1. `bootstrap/CONSTITUTION.md`;
2. `bootstrap/FUNCTIONAL-CONTRACT.md`;
3. `bootstrap/BACKEND-AND-SERVICES-CONTRACT.md`;
4. `bootstrap/TESTING-AND-ACCEPTANCE-CONTRACT.md`;
5. `bootstrap/CONCEPT-GALLERY-MAP.md` and every L01–L64 image relevant to the plan;
6. `bootstrap/SOURCE-REFERENCE-MANIFEST.md`;
7. `bootstrap/BUNDLE-MANIFEST.json`;
8. exact `bootstrap/supabase/migrations/` only when planning backend authority or schema continuity.

It should not begin from old implementation plans, current Wave artifacts, chat history, or rejected frontend source.

## 3. Planning expectations

The fresh plan should:

- start from product outcomes and contracts, not the old source tree;
- assess the best current architecture and stack using official primary documentation;
- explain frontend, backend, data, state, routing, design-system, animation, asset, accessibility, testing, deployment, and observability choices;
- preserve the current Supabase/Vercel targets and migration authority;
- include a concrete plan for visually realizing the concept gallery—not merely borrowing colors;
- use an early interactive shell milestone and recurring screenshot/concept comparisons so layout drift is caught immediately;
- integrate real functionality vertically rather than creating a disposable mock frontend;
- permit autonomous implementation and disjoint sub-agent work with one integration owner;
- define checkpoint/backup cadence, preview cadence, test gates, cleanup, rollback, and final review artifacts;
- identify only genuine Ryan decisions rather than asking Ryan to choose routine engineering details;
- stop for alignment before any source/service/Git/deployment mutation.

## 4. Recommended implementation shape

The exact plan belongs to the fresh model. The following is a recommendation, not a mandatory wave system:

1. **Architecture and visual proof:** choose stack, implement the real global shell/navigation plus one real Solo and one real COMBAT state, deploy a private preview, and prove concept fidelity before scaling.
2. **Gameplay/domain completion:** build OG/GO, Daily/Practice, persistence, results, economy, and account flows against the real contracts.
3. **COMBAT authority:** build shared gameplay, queue/lobby/private requests, Live/spectator, scoring/rating/settlement, and real two-client testing.
4. **Product routes and operational states:** complete Calendar, History, Stats, Leaderboards, Profile, Marketplace, Word Explorer, Settings, Help, notifications, Admin, PWA, and recovery.
5. **Integrated hardening:** accessibility, performance, responsive stress, privacy, hosted verification, cleanup, complete concept comparison, and final review packet.

Unlike the rejected process, internal milestones should not force Ryan to approve every small slice. The agent should iterate autonomously and use the preview/screenshot loop as its own quality control, stopping for Ryan only at the agreed visual proof gate if the plan considers that necessary and at final acceptance.

## 5. Secrets and local setup

Planning requires no secret.

Before service-backed implementation/testing, a separately authorized setup should:

- verify the exact fresh workspace, GitHub repo, Supabase ref, Vercel project, and team;
- link the fresh workspace to Vercel without altering another project;
- populate ignored `.env.local` through a nonprinting allowlisted local transfer or exact-project environment pull;
- set mode `0600` and prove ignored/untracked state;
- keep the Node-only E2E service-role key out of Vercel/browser scope;
- preserve all legitimate current accounts and rows.

Ryan should not paste secrets into chat.

## 6. Progress and completion reporting

During long autonomous execution, report concise progress at meaningful intervals. At completion provide:

- what changed and current status;
- private preview link;
- representative and complete evidence links;
- canonical Markdown plus mobile HTML completion report;
- canonical Markdown plus mobile HTML manual checklist;
- exact test/cleanup results;
- Git checkpoint/backup state if authorized;
- immediately next step;
- exact Ryan action items;
- one copy-ready next prompt when appropriate.

## 7. Fresh-build planning prompt template

`bootstrap/START-HERE.md` contains the canonical path-correct prompt. Its current text is:

```text
Use /Users/noir/visual_studio/Codex_Projects/amordle-greenfield as the only writable target. Read bootstrap/CONSTITUTION.md, bootstrap/FUNCTIONAL-CONTRACT.md, bootstrap/BACKEND-AND-SERVICES-CONTRACT.md, bootstrap/TESTING-AND-ACCEPTANCE-CONTRACT.md, bootstrap/BOOTSTRAP-INSTRUCTIONS.md, bootstrap/SOURCE-REFERENCE-MANIFEST.md, bootstrap/BUNDLE-MANIFEST.json, and the complete portable Concept Gallery Map with all 64 locked images. In Plan mode, design a decision-complete end-to-end greenfield implementation of amordle. Preserve every functional, backend, privacy, migration, service, testing, and cleanup contract while materially realizing the concepts' composition, density, hierarchy, responsive behavior, and fire/ice identity. Research the best current stack from official primary sources. Treat the previous frontend architecture, Wave plan, and executable suite as nonbinding and do not fetch or inspect archived branches unless a specific functional ambiguity cannot be resolved from the starter pack or live shell. Include an early real interactive visual proof, recurring concept-comparison screenshots, private preview cadence, real-service testing with exact cleanup, autonomous implementation strategy, checkpoint cadence, rollback, and paired Markdown/mobile-HTML final reports and manual checklists. Do not mutate source, services, Git, deployment, or configuration while planning. Stop for my alignment.
```
