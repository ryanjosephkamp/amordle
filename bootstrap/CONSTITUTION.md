# Amordle Greenfield Constitution

Version: 1.0
Status: binding bootstrap authority

## 1. Product truth

Amordle is a browser game for human players. It must be understandable,
responsive, and fully functional before it is considered polished.

The locked functional shell defines the minimum behavior. The new product may
improve architecture, accessibility, language, and design, but it may not omit
or simulate required functionality.

## 2. Honest implementation

- A feature exists only when its real state transition, persistence, error
  behavior, recovery, and cleanup work.
- Production routes may not use fictional records, proof matches, static
  statistics, or test-only repositories.
- Realtime is an accelerator, not the sole durable authority.
- Player actions are confirmed only after the required local or remote
  persistence succeeds.
- Errors preserve relevant player state and explain what the player can do.

## 3. Human interface

- Write for a general audience.
- Prefer short, direct language over implementation terminology.
- Preserve rich data where useful; simplify wording rather than content.
- All essential flows work with keyboard, mouse, touch, and assistive
  technology.
- Responsive gameplay keeps the board, current status, and keyboard usable
  within the available viewport.
- Motion, glass, and terminal styling support comprehension and never become
  obstacles.

## 4. Privacy and authority

- Public projections contain only intentionally public information.
- Unsolved answers, seeds, emails, raw Auth identifiers, private settings,
  administrative capabilities, and service secrets do not enter public
  responses or browser logs.
- Guest and authenticated state remain account-isolated.
- Server-authoritative operations remain server-authoritative.
- The existing RLS and service-role separation are preserved.

## 5. Durable services

- The 45 accepted migrations are immutable.
- The existing private GitHub repository, Vercel project, and Supabase project
  remain the service baseline.
- Production stays unchanged until a separately approved release.
- A needed schema change is forward-only, additive, tested, and separately
  authorized.
- Paid infrastructure or a new long-lived vendor requires explicit approval.

## 6. Evidence

- Every functional-contract item maps to implementation ownership and passing
  evidence.
- Unit tests alone do not prove service or multiplayer behavior.
- Real hosted E2E uses disposable accounts, real UI sign-in, isolated browser
  contexts, and exact cleanup.
- Visual acceptance uses assertion-before-screenshot evidence at required
  widths.
- Completion requires zero registered service residue.

## 7. Safe autonomy

The implementation agent should continue through ordinary coding and debugging
failures without prematurely returning work. It must stop for:

- repository or service identity drift;
- migration drift or unavoidable destructive migration;
- missing necessary authority that cannot be safely substituted;
- secret, answer, or private-data exposure;
- unavoidable Production mutation;
- cleanup residue after the bounded retry policy;
- an unresolved contradiction among binding authorities.

## 8. Recovery

The rejected application is recoverable from:

- branch `codex/pre-terminal-greenfield-golden-2026-07-26`;
- tag `amordle-pre-terminal-greenfield-golden-2026-07-26`;
- commit `43556d99e6e59ff77135ff347da3bc9be056fedf`.

Those references are recovery material, not governing product input.
