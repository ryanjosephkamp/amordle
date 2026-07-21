# Start Here — Greenfield amordle

**Status:** Canonical entry point for the fresh private implementation task
**Date:** 2026-07-20
**Current gate:** Plan only; no implementation or external mutation is authorized by this document

## Purpose

This repository is intentionally a clean bootstrap. It contains the complete accepted product, backend, privacy, migration, testing, and visual contracts without carrying forward the rejected frontend implementation, its package graph, or its accumulated Wave plan.

The existing live functional shell at <https://amordle.vercel.app> remains the behavioral and recovery reference. It is not the visual target and must not be replaced before a new private preview has passed the accepted implementation and review gates.

## Required reading order

1. [`CONSTITUTION.md`](CONSTITUTION.md)
2. [`FUNCTIONAL-CONTRACT.md`](FUNCTIONAL-CONTRACT.md)
3. [`BACKEND-AND-SERVICES-CONTRACT.md`](BACKEND-AND-SERVICES-CONTRACT.md)
4. [`TESTING-AND-ACCEPTANCE-CONTRACT.md`](TESTING-AND-ACCEPTANCE-CONTRACT.md)
5. [`CONCEPT-GALLERY-MAP.md`](CONCEPT-GALLERY-MAP.md) and the exact L01–L64 images it links
6. [`BOOTSTRAP-INSTRUCTIONS.md`](BOOTSTRAP-INSTRUCTIONS.md)
7. [`SOURCE-REFERENCE-MANIFEST.md`](SOURCE-REFERENCE-MANIFEST.md)
8. [`BUNDLE-MANIFEST.json`](BUNDLE-MANIFEST.json)
9. [`supabase/migrations/`](supabase/migrations/) only when planning schema and service continuity

Do not fetch or inspect archived branches, old Wave artifacts, or the rejected implementation unless a specific required behavior remains genuinely ambiguous after reading these sources and checking the live shell.

## Activation prompt

Use this prompt in a new Codex project/task opened on `/Users/noir/visual_studio/Codex_Projects/amordle-greenfield` in Plan mode:

```text
Use /Users/noir/visual_studio/Codex_Projects/amordle-greenfield as the only writable target. Read bootstrap/CONSTITUTION.md, bootstrap/FUNCTIONAL-CONTRACT.md, bootstrap/BACKEND-AND-SERVICES-CONTRACT.md, bootstrap/TESTING-AND-ACCEPTANCE-CONTRACT.md, bootstrap/BOOTSTRAP-INSTRUCTIONS.md, bootstrap/SOURCE-REFERENCE-MANIFEST.md, bootstrap/BUNDLE-MANIFEST.json, and the complete portable Concept Gallery Map with all 64 locked images. In Plan mode, design a decision-complete end-to-end greenfield implementation of amordle. Preserve every functional, backend, privacy, migration, service, testing, and cleanup contract while materially realizing the concepts' composition, density, hierarchy, responsive behavior, and fire/ice identity. Research the best current stack from official primary sources. Treat the previous frontend architecture, Wave plan, and executable suite as nonbinding and do not fetch or inspect archived branches unless a specific functional ambiguity cannot be resolved from the starter pack or live shell. Include an early real interactive visual proof, recurring concept-comparison screenshots, private preview cadence, real-service testing with exact cleanup, autonomous implementation strategy, checkpoint cadence, rollback, and paired Markdown/mobile-HTML final reports and manual checklists. Do not mutate source, services, Git, deployment, or configuration while planning. Stop for my alignment.
```

Displaying this prompt does not authorize implementation. Ryan activates it by submitting it in the fresh Plan-mode task.
