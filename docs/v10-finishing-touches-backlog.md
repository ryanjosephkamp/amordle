# v10 — the finishing touches

Captured 2026-08-15 from the owner, at the end of the session that released v9 to
Production. This is the source of truth for the next session; the handoff artifact
summarises it, this file holds the detail.

**Nothing here is started.** Production is live and healthy at
https://amordle.vercel.app (`dpl_CdUNmm9RzxF3fgLCkMoewUkjMC3G`, build `3c2ef4d4a154`).

---

## The shape of it

Four workstreams. They are largely independent, so they can be planned together and
executed in any order the next session and the owner agree on.

|     | Workstream                                                            | Needs a migration? |
| --- | --------------------------------------------------------------------- | ------------------ |
| A   | The **About** page                                                    | No                 |
| B   | The **Methodology** page — transparent scoring disclosure             | No                 |
| C   | The **changelog / blog**, published separately, with occasional video | No                 |
| D   | **Creator** flair, a dynamic accent, and shareable profile links      | Yes, probably      |

Plus one small item that belongs with A and B: the menu order changes.

---

## A · The About page

A new route, reachable from the `[m] menu` popover. Contents, in whatever order the
next session judges best — the owner explicitly delegated the ordering and layout, and
asked for the game's own visual language rather than anything new.

- **A link to the changelog** (workstream C).
- **Feedback routes**: GitHub issues — bug report, security report, feature request.
  Separate entry points if that reads better than one link.
- **The repository**: https://github.com/ryanjosephkamp/amordle
- **Credit**, deliberately terse. "Built by Ryan Kamp" or similar, with the name
  linking to https://ryanjosephkamp.github.io. **No biography, no description.**
  Alongside it, buttons to:
  - His player profile in this game — see workstream D, the link does not exist yet
  - GitHub — https://github.com/ryanjosephkamp
  - GitHub Sponsors — https://github.com/sponsors/ryanjosephkamp
  - LinkedIn — https://www.linkedin.com/in/ryanjosephkamp
- **Where the words come from.** One or two sentences on the English OpenList, noting
  it is also his work, with three links:
  - https://english-openlist.pages.dev/
  - https://huggingface.co/datasets/ryanjosephkamp/english-openlist
  - https://github.com/ryanjosephkamp/english-openlist

Links should carry the accent treatment the rest of the app uses. The owner invited
additional links if any are obviously missing.

## B · The Methodology page

The reason this exists is **transparency**: a player should never suspect the scoring
is arbitrary or unfair. Everything stated here must be read out of the code, never
recalled or inferred — a wrong equation on a page titled "methodology" is worse than
no page.

**Elo comes first on the page**, because it is the thing players will follow a link to
read. Cover:

- The actual equation, rendered so it can be read in one line. LaTeX or a typeset
  equivalent — the next session's call.
- A short conceptual explanation: what a win, a loss and a draw do to a rating, enough
  that a reader can predict the direction and rough size of a change.
- That **each ranked time control keeps its own rating** — ten clocks × two modes ×
  hard/standard, forty pools — and why.
- The provisional K-factor and the seed rating, both read from the settlement function.
- A diagram or interactive figure. It need not use real game data; an illustrative
  rating distribution is fine. Mentioning the chess lineage is welcome.

Then, with the same rigour:

- **XP** — how experience is awarded.
- **Coins** — how they are earned, and in particular the **variable cost of buying
  another guess**, which is computed rather than fixed. An equation if it can be made
  legible; prose if not.

A brief justification for each choice is welcome. Anything else that could look
arbitrary to a player belongs here too.

**The leaderboards page links here**, landing the reader on the Elo section. The owner
is happy for Elo to simply be the top of the page rather than an anchor jump.

### Where the algorithms actually live

- **Elo**: `settle_amordle_ranked_practice_v2` and now the shared core
  `brrrdle_private.amordle_settle_ranked_practice`, most recently re-emitted in
  `supabase/migrations/20260814120000_amordle_system_settlement_and_reaper_v1.sql`.
  Seed 1200; K=40 while provisional (<10 games), K=24 after.
- **Rating pools**: `brrrdle_private.amordle_rating_bucket`, and the parser/formatter in
  `src/domain/profile.ts` (`resolveRatingLane`, `rankedClockLadder`).
- **XP / coins / consumable pricing**: start at `src/domain/account-stats.ts`,
  `src/domain/account-continuity.ts`, and the economy RPCs
  (`consume_solo_practice_consumable`, `spendCoins` in `src/adapters/cloud/account.ts`).

## C · The changelog

A separate published site — GitHub Pages was the owner's suggestion — carrying a post
per significant update.

**Reference, for the shape of the thing only:**

- https://github.com/ryanjosephkamp/reword-nerd
- https://ryanjosephkamp.github.io/reword-nerd/updates/

**Read it, do not modify it, and do not copy its visual style.** The Amordle changelog
should look like Amordle. What to borrow is the _approach_: what a post contains, how
often one is written, and the voice.

**Voice.** First person in the sense that it is his project, but avoiding "I" and "my".
Plain, factual, black and white about what changed.

**Videos.** When an update changes something visible — new themes, new modes, anything
with a visual surface — the post embeds a short Remotion product video, **15–30
seconds**. Non-visual updates do not need one. Constraints the owner was firm about:
any music must be **light and not overwhelming**; sound effects must not be loud,
jarring or inappropriate. The video is an alternative to reading the post, so it should
stand on its own.

Very minor updates may not warrant a post at all. Use judgement.

## D · Creator flair, dynamic accent, shareable profiles

**The account:** `ryanjosephkampsapps@gmail.com`. Created after this session, so the
next session must look up its user id and public profile id rather than assume.

**Creator flair.** A fourth flair alongside the current three (`none`, `daily`,
`combat` — see `flairLabels` in `src/domain/profile.ts`). Restricted to that one
account. The owner mentioned an admin account exists but has never signed into it;
scoping this to the single account is acceptable for now.

**A dynamic accent.** An accent that animates — the owner described "neon, moving,
electricity". Selectable only by that account, and only if it does not destabilise
anything. Genuinely optional and cosmetic; do it last. Two things to respect:
`prefers-reduced-motion`, and the contrast sweep that every accent already goes
through. The owner explicitly wants it built so it could later be generalised to all
players, so build it as a real accent variant rather than a one-off hack.

**Shareable profile links — the practical one.** `/players/[publicProfileId]` already
exists, so unique URLs are already there; what is missing is any way to _find your
own_. Add a copy-link or share affordance on a player's own profile, and on someone
else's profile when viewing it.

## E · The menu

New entries, in this exact vertical order:

1. All Game Modes · 2. Leaderboards · 3. Players · 4. History · 5. Words · 6. Stats ·
2. Marketplace · 8. Settings · 9. Help · **10. Methodology** · **11. About** ·
3. Sign In — replaced by **Profile** when signed in.

So: Methodology sits between Help and About; About sits between Methodology and the
Sign In / Profile entry. The list lives in `secondary` in `src/components/app-shell.tsx`.

---

## Page-by-page notes

The owner walked the app looking for small defects and **found almost nothing worth
reporting**. Treat the surfaces above as the work; do not go hunting for cosmetic
changes that were not asked for.

## Operator manual — a deliverable in its own right

The owner wants a reusable artifact for running future sessions, containing at least
one **prompt template with a single placeholder** (an ALL-CAPS description slot) that
they fill by voice or natural language. The working pattern it should describe:

1. Open a new session in **plan mode**.
2. Paste the template, replacing the placeholder with whatever they want — a bug, a
   feature, or both — and attach screenshots and any relevant context files.
3. The model plans, aligns with them, then executes.
4. Unless the change is trivial, it also produces a changelog post, and a video if the
   change is visual.

## Constraints carried forward

- Production is live. Every release goes **Preview → full hosted acceptance → promote**,
  never straight to Production. See the v9 incident record in `progress/run_state.json`.
- A Vercel **rollback pins Production**: a later `--prod` deploy will not take the alias
  until `vercel promote` runs. Verify the live build id, not the deploy exit code.
- Commits must use the repository-local `noreply` author or the push is rejected.
- Credentials are the owner's to enter, never the assistant's.
