# Report Delivery Amendment

## Scope

This amendment governs how completed work is **delivered to the owner for
review**. It changes nothing about what a report must contain, where reports are
stored, or any other completion requirement.

It does not change game rules, ratings, matchmaking policy, persistence
ownership, the three application HTTP interfaces, the immutable 107-file
bootstrap baseline, the first 45 migrations, Production, or the locked shell.

## Why

The owner reviews work from a mobile device, over remote control, away from the
desk where the repository lives. A canonical Markdown report under `reports/`
is the durable record and remains so — but on a phone it is either an unrendered
wall of text in a terminal or a file that has to be fetched before it can be
read at all. Work that is finished but unreadable at the moment of review is not
finished from the owner's side.

## The rule

**Every canonical report gets a published Claude Artifact companion, and the
link is handed to the owner in the same message that announces the work.**

This is *in addition to* the Markdown report, never instead of it. The Markdown
file under `reports/` stays the canonical record: it is versioned with the
commit it describes, it is what a future session reads, and it is what the
governance trail points at. The artifact is a reading surface.

Applies to:

- cycle and release reports;
- migration decision packets;
- assessments and plans;
- incident write-ups;
- any handoff where the owner is expected to review, decide, or approve.

Does not apply to ordinary turn-by-turn replies, single-step tasks, or
intermediate progress inside a phase that is still running. A link per turn is
noise, and noise is how a real link gets missed.

## What the artifact must do

1. **Lead with anything live.** If Production is mismatched with its database,
   if a deploy is outstanding, if a player-visible fault exists right now — that
   goes at the top, before the narrative, styled so it cannot be scrolled past
   by accident.
2. **Be readable on a phone.** Single column, no horizontal scrolling of the
   body, tap targets that a thumb can hit, wide content in its own scrolling
   container.
3. **State what the owner must do**, in order, with any command in a form that
   can be copied — including a copy control that works when the clipboard API is
   blocked.
4. **Carry the corrections.** Anything the report gets wrong about a previous
   claim belongs in the artifact too. The reading surface must not be the
   flattering version.
5. **Render in both themes**, from the game's own tokens in
   `src/app/tui-shell.css`, so the reports and the game are one object seen from
   two places.

## What the artifact must not do

- It must not be the only copy. If the artifact exists and the Markdown does
  not, the work is incomplete.
- It must not carry material deliberately kept out of the repository. An
  artifact is a hosted page that can be shared onward; anything held outside the
  repository for disclosure reasons stays out of the artifact too, and the
  artifact points at it rather than restating it.
- It must not silently diverge from the Markdown. When the report is corrected,
  the artifact is republished to the same URL.

## Authority

`AGENTS.md` is entry in the frozen 107-file bootstrap baseline and is not
amended here. Changing it would require re-baselining the manifest, which is a
separate owner decision with its own packet — the procedure used for
`vercel.json` in v10.

So this amendment is made operative the way a session actually encounters it:
`progress/run_state.json` carries `reportDeliveryPolicy`, and every session is
instructed to read that file before doing anything. This document is the
reasoning; the run-state entry is the instruction.

If the owner would rather have the rule in the top-authority file, amending
`AGENTS.md` and re-baselining entry 1 of the manifest is a small, well-precedented
change — it simply needs authorizing rather than assuming.
