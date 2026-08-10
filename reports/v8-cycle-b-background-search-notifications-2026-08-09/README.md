# v8 Cycle B — background searching and the notification centre

**Date:** 2026-08-09
**Branch:** `codex/amordle-terminal-greenfield-implementation-2026-07-27`
**Range:** `81e96f1` (end of Cycle A) → `9fc688d`
**Preview:** `dpl_AS17pQYKnVdkF7mCpcWaGbrhmWPH`
`https://amordle-23n0hovtc-ryanjosephkamps-projects.vercel.app` (protected)
**Production:** unchanged, frozen at `dpl_739mtwiXc9pZPef3pxsKumwC9DfG`. No release.
**Migration:** none.

---

## What this cycle fixed

Cycle A made the ranked search *poll correctly*. It was still owned by the Practice
lobby, which meant it was still a property of a page: leave that page and the search
stopped, while the server-side queue row stayed alive and kept counting against the
five-request cap. Session storage made it narrower still — the record was scoped to one
tab, so a second tab could neither see the search nor cancel it.

And the notification centre, which is where a background search has to report to, was
one undifferentiated list in which a game waiting on you looked exactly like a rematch
somebody declined last week.

## B1 · One search, owned by the application

`RankedQueueProvider` is mounted above the shell in the root layout and owns the whole
search: the intent, the poll, the claim, the finalize, the cancel. The lobby drives that
context and renders from it; it holds nothing.

The intent moved from per-tab `sessionStorage` to the account-scoped IndexedDB envelope
store the rest of the app already uses. Because the namespace is `account:<userId>`,
account deletion already wipes it — no new cleanup path was needed.

**The promotion path is the part that could have stranded people.** Anyone with a live
search at the moment this shipped has a server-side queue row they can only reach
through the session-storage record the new code no longer reads. A durable read that
finds nothing therefore drains any surviving session record into the durable store
exactly once, and that is covered by a browser test rather than assumed.

There is deliberately exactly **one** poller. Two would both be safe — the claim and
finalize action ids live in the shared intent, so the RPCs are idempotent — but they
would race on the resulting navigation and double the request rate for nothing. Two
*tabs* do each poll, and that is safe for the same reason: both read the same durable
intent, so the server sees the second call as a replay of the first.

## B2 · Notify rather than yank

A search that outlives its page can be running while the player is anywhere, and an
invisible thing that will eventually seize the screen is worse than one that never ran.
A status strip now shows the search, its elapsed time and a cancel, on every route —
except the lobby, which renders all of that inline already. Two polite live regions
describing one search is worse than one.

When the match lands, **it announces itself and offers a link**. Auto-navigation happens
on the lobby, where the player is already waiting for exactly that, and nowhere else;
being pulled out of a Solo game by a background search is not a feature.

Both floating strips now share one stack. They were independently fixed to the same
corner before, which was survivable only while they could not co-occur — a background
search that survives navigation can now be running when the connection drops.

## B3 · The notification centre gets lanes

Filter chips for turn, results, requests and rematches, with **unread** counts on each,
so "is anything waiting on me" is answerable without reading the list. A game waiting on
the opponent shares the turn lane, because both answer the same question: which games am
I in right now.

Every row now carries a summary — who, ranked or not, mode, word length, hard mode —
taken from the payloads the feed already fetched. No new RPC.

## B4 · A board at a glance

Game rows carry a snapshot of the last four rows of the puzzle in play: evidence colour
only, no letters. At that size letters would be unreadable, and the colours already
answer what the snapshot is for. It also means a snapshot can never carry a word out of
a surface not meant to show one.

It is **never persisted**. The envelope keeps identity and read state; the live feed
reattaches the rest on every load. That required changing `mergeNotifications` to take
the live row and carry the read flag across, rather than returning the stored row
wholesale — behaviour that was indistinguishable from correct while a notification was
nothing but identity plus a flag, and which would have silently stripped every read
notification of its summary and its board.

---

## Three defects the new tests found, each a repeat of a documented family

**A cross-row baseline group, again.** The two-row summary variant kept
`align-items: baseline`, which is precisely the construct A3 removed from this same
component last cycle. It is `start` now, with the first band's baseline restored
per-cell — safe, because those three cells share one named row and so cannot group
across rows. Caught by extending the cross-engine test to the new row shape.

**A surface without its ink.** The filter chips declared a rest background but no
colour, so `button:hover` painted `--control-ink-on-selected` on a surface that never
flipped: in the dark scheme that is near-black on near-black, **1.04:1, for every
accent**. This is exactly the rule `.segmented` states in the stylesheet — surface and
ink always travel together. The ranked search strip had the same shape and was fixed
with it.

**Accent ink on a tinted surface, again.** The unread count in `--accent-text` failed on
all three surfaces a chip can present: 3.60:1 selected, 4.26:1 at rest, and as low as
1.01:1 hovered. Colour was never carrying meaning there — the number is already a
number — so it inherits its chip's ink and is correct by construction.

All three were found by measurement, not review, and all three are now swept for named
*and* custom accents in both schemes across rest, hover, focus and active.

---

## Verification

Local gate, `pnpm test:acceptance:local` — green:
**159 domain · 31 browser · 24 fixture · 43 visual**, budgets
`home 197,273 B JS / 23,770 B CSS; game 203,576 B JS / 28,680 B CSS`.

Home JS grew 193,242 → 197,273 B across Cycles A and B. That is the cost of a watcher
every route now loads, and it is inside budget.

Hosted acceptance against the Preview:

| Suite | Result |
| --- | --- |
| fixture (Chromium · Firefox · WebKit) | 24 passed |
| services (real Supabase, 1 worker) | 3 passed |
| visual (Chromium 39 · Firefox 2 · WebKit 2) | 43 passed |
| parity registry | 237/237 acceptance-verified |
| working-tree residue | none |

**The hosted ranked scenario now walks the case this cycle exists for.** The waiting
player starts a search on the lobby, has their tab forced hidden, navigates to Home, and
the opponent claims. It asserts the search is still visibly running from Home, that the
match announces itself there, that the player is **not** dragged out of the page they
were on, and that opening it by hand works.

### Two hosted failures, and what each actually was

The first run failed on the lobby no longer saying "Restored your ranked search" after a
reload. That was a real defect: the provider's generic phase message had been given
precedence over the page's own, so it always won. The page's message wins now, and a
change of phase clears it — a phase change makes anything said before it stale by
definition. A search started from the form is also no longer announced as "restored",
which it never was.

The second failed waiting for the draft row to clear after the 35-letter ranked winner.
The product did everything correctly — the failure screenshot shows the win, the points,
and both players' rating movement, 1200→1220 and 1200→1180, applied with no button
press — but the command round-trip, the terminal transition, automatic settlement and a
35-column re-render take longer than the five-second default. Only the window changed;
the assertion did not.

---

## What Cycle B deliberately did not do

- **No realtime on the queue table.** It would need a migration and the poll is
  sufficient; five seconds to discover a match is not the bottleneck.
- **No cross-tab leader election.** Two tabs both poll. It is safe because the action
  ids are shared and the RPCs are idempotent, and the fix would cost more than the
  duplicate request rate does.
- **Ranked Daily still uses its own session-scoped intent.** Its queue resolves to a
  known game id synchronously, so it never had the background problem this cycle solves.
- **Server-side settlement, buckets, the portal** — Cycles C and D, both migrations,
  both needing their own decision packet.
- **`get_public_site_stats_v1` is still broken**, still filtering the pre-v2
  `async:og` / `async:go` buckets. Cycle C.

## How to undo it

`git reset --hard 81e96f1` returns to the end of Cycle A; `git reset --hard 59e5833`
discards both cycles. No migration was applied and Production was never touched.
