# amordle Minimal Constitution

**Status:** Binding bootstrap authority for the fresh private build.
**Version:** 1.0
**Date:** 2026-07-20

## 1. Goal

Build a polished, fast, accessible, full-stack `amordle` game whose functionality satisfies `FUNCTIONAL-CONTRACT.md`, whose backend satisfies `BACKEND-AND-SERVICES-CONTRACT.md`, whose verification satisfies `TESTING-AND-ACCEPTANCE-CONTRACT.md`, and whose visual result is convincingly aligned with the locked concept gallery.

The product name is lowercase `amordle`, pronounced like “immortal.” The user-facing multiplayer destination is `COMBAT`.

## 2. Authority

Use this order when instructions conflict:

1. Ryan’s explicit instruction in the current task.
2. This constitution.
3. The three accepted contracts named above.
4. The portable concept-gallery map and its exact locked images for visual direction.
5. An implementation plan Ryan has explicitly accepted.
6. Current source and tests as implementation evidence, never as permission to contradict a higher source.

Stop and ask only when the conflict would materially change behavior, privacy, cost, external state, or an irreversible action.

## 3. Required outcomes

- Implement every required capability and privacy boundary in the functional contract.
- Preserve the exact dedicated Supabase and Vercel service identities unless Ryan explicitly authorizes a change.
- Preserve the ordered migration ledger and server-authority semantics.
- Produce a result materially faithful to the concept gallery’s layout, hierarchy, density, and competitive fire/ice atmosphere on desktop and mobile.
- Maintain fast startup, route-level loading discipline, robust responsive behavior, accessibility, reduced motion, and PWA/recovery behavior.
- Verify behavior with unit, component/integration, browser, real-service, privacy, accessibility, performance, and cleanup evidence appropriate to the claim.

## 4. Implementation freedom

The implementation agent is encouraged to rethink the architecture and use the best current stack for the job. It may replace the old frontend architecture, framework, routing, styling system, state management, component primitives, animation approach, asset pipeline, and testing organization after research and measured justification.

The old shell’s source is behavioral reference, not a UI template. Do not copy its visual composition or CSS merely because it already exists. Reuse exact domain rules, migration contracts, data formats, or proven algorithms only when doing so is the best way to preserve behavior.

The concept images are visual targets, not fake-data specifications. Do not invent functionality, private data, service health, latency, ratings, player identities, or game rules merely because generated artwork contains them.

## 5. Autonomy

After Ryan accepts the implementation plan and explicitly authorizes execution, the implementation agent should work autonomously to completion:

- use sub-agents when their work is disjoint and integration ownership is clear;
- research primary documentation when stack or platform facts are current or uncertain;
- implement, test, diagnose, refine, and clean up without stopping for ordinary technical choices;
- capture periodic internal screenshots and compare them directly with the concepts;
- create bounded Git checkpoints and private remote backups only when the execution authorization explicitly includes them;
- communicate concise progress during long work;
- stop only for a genuinely user-only decision, unavailable private credential, destructive or costly external action outside authorization, cross-project risk, private-data risk, irrecoverable cleanup problem, or material contradiction in the accepted contracts.

## 6. Safety and privacy

- Modify only the explicitly named fresh amordle workspace, repository, and dedicated amordle services.
- Never modify `brrrdle-dev`, stable `brrrdle`, or any unrelated directory, repository, deployment, database, account, or project.
- Never print, commit, paste into chat, screenshot, or publish secrets or private user data.
- Browser code receives only browser-safe public values. Privileged credentials remain server/process scoped.
- Real-service tests use deterministic temporary identities and rows and must prove exact cleanup.
- Do not expose puzzle answers, auth identifiers, private projections, admin data, or server-only state.

## 7. Review and release

- Internal iteration may continue without Ryan review until the agreed implementation milestone is complete.
- Formal handoffs provide one canonical Markdown report, an equivalent lightweight mobile HTML report, a Markdown manual-review checklist, and an equivalent mobile HTML checklist.
- Every required screenshot or preview is linked directly.
- A private interactive preview must be available for Ryan’s final review.
- Production promotion, public visibility, domain changes, release, and merge remain separately authorized actions.

## 8. Evidence rule

Do not claim completion from screenshots, mocks, fixtures, passing unit tests, or deployment readiness alone. Claims must match the evidence actually run. A failed required gate is a defect to diagnose, not a reason to weaken or remove the requirement.
