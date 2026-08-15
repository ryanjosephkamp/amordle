# v10 — the finishing touches

**Date:** 2026-08-15 · **Range:** `f2b28a7` → `9735a0a`
**Migration:** `20260815055205_amordle_creator_identity_v1.sql`, **applied**
**Changelog:** **live** at <https://ryanjosephkamp.github.io/amordle-updates/>
**Operator manual:** <https://claude.ai/code/artifact/96411a8b-f9bb-4627-aa4f-fb8b04c5894f>
**Preview:** <https://amordle-q6a7m4t5o-ryanjosephkamps-projects.vercel.app> (protected), commit `9735a0a`
**Production:** unchanged, `dpl_CdUNmm9RzxF3fgLCkMoewUkjMC3G` — no release

---

## Two things found before any of the work started

**The gate was already red.** `pnpm verify:bootstrap` failed on `HEAD` before
this cycle touched anything. Commit `046e3b9` added the framework and output
directory to `vercel.json` — the durable fix for the v9 release incident — but
`vercel.json` is entry 107 of the frozen bootstrap manifest and its hash was
never updated. Re-baselined to the shipped bytes rather than reverting the fix;
decision recorded in
`reports/v10-bootstrap-rebaseline-decision-2026-08-15.md`.

**The signed-in shop had never worked.** Reading the economy in order to
describe it truthfully on the Methodology page turned up a client/server
mismatch. The client sent `reveal_one_letter` / `remove_incorrect_letters` and
scope `solo-practice`; the RPCs branch on `revealOneLetter` /
`removeIncorrectLetters` and refuse any scope but `practice`. Every signed-in
Marketplace purchase raised `Invalid consumable` and every hint raised `Practice
only`, in production, since the economy shipped.

Nothing could have caught it. Both sides were internally consistent and no test
compared them. Guests were unaffected — they never leave the local adapter —
which is why the shop looked fine to anyone testing signed out.

_Proven:_ `tests/domain/economy-rpc-contract.test.ts` compares the client's
constants against the **migration text**, not a restated copy. A restated copy
would have drifted the same way.

## What changed

**A Methodology page.** `/methodology` publishes every scoring formula the game
uses: the Elo expected-score equation, K = 40 provisional and 24 after ten
games, the 1200 seed, why there are forty rating pools, how a match is decided
on points, leaderboard ordering and tiebreaks, the XP formula and the square
level curve, coins, and the continuation-cost formula with a worked table. Every
value was read out of the code and the file's header names its source for each
one, file and line.

_Proven:_ 24 fixture and 52 visual tests now walk it, including the contrast
sweep at 7 accents × 3 states × 2 schemes and the horizontal-overflow assertion.
`tests/domain/server-render.test.ts` requires it to prerender real content.

**Three uncomfortable facts are on the page.** No rating floor or ceiling. A
match is not always zero-sum, because two players on different K values do not
trade equal points. And the price of another guess is computed by the client
while the fixed prices are server-enforced — the page ends with a section saying
which side enforces what.

**The daily streak was deliberately left off.** `private-stats.tsx:109` displays
it, and no current code path advances it; only a legacy import ever sets it.
Documenting a dead number on a page about honesty invites exactly the suspicion
the page exists to prevent. Carried as open work below.

**About was already written and unreachable.** It existed at
`src/app/about/page.tsx` and was in no menu — only an old redirect reached it. It
now carries the changelog, three issue routes, the repository, terse credit with
profile, sponsorship and personal links, and the English OpenList with its three
addresses.

**Both are in the menu**, after Help and before Sign in / Profile, which is the
requested order. Nothing pinned the menu's contents, so this broke no test.
Leaderboards links to the methodology.

**Creator flair and the Voltage accent**, restricted to
`2bc33680-d9e5-4dd5-9965-24bc4ea43497` by a CHECK constraint on the row rather
than a test of the caller. Flair has always been self-assertion; a caller-based
gate would need repeating in all three write paths and would be bypassed by the
service role. Binding the value to a user id makes the rule a property of the
data, so no code path can violate it — including ones that do not exist yet.

_Proven:_ `tests/domain/creator-identity.test.ts` asserts the constraint exists
and that the client and the migration name the same account. Two copies of a
uuid is one typo from a gate that opens for nobody.

**Voltage is a real seventh accent**, not a one-off, so opening it to everyone
later is deleting one line of SQL. Only shadows animate: the sweep injects
`animation: none` before measuring, so an animation touching `--accent-text`
would be verified at one frame and unverified at every other. `text-shadow` and
`box-shadow` cannot alter the pair the sweep samples, so the moving part is
unmeasurable by construction. A domain test enforces that no future frame
smuggles in a colour property.

**Shareable profile links.** Unique profile URLs already existed; there was no
way to find your own, because opening your own public profile redirects you to
`/profile`. Copy affordances now sit on both surfaces. The dead `EDIT PROFILE`
button the redirect had made unreachable is gone.

One `CopyButton` replaces four raw `navigator.clipboard` calls. Only one of the
four guarded for an absent clipboard or reported success; a copy button that
fails silently is worse than none, because the reader walks away believing they
have the link.

**One outbound-link treatment.** The two that existed disagreed about `rel`, and
these pages would have been a third pattern.

**A prose `h3` rule.** No prose page had used a third heading level, and
preflight resets headings to inherit, so an `h3` would have rendered as a
paragraph.

## The changelog

Live at <https://ryanjosephkamp.github.io/amordle-updates/>, in its own **public**
repository. The game's repository stays private, which is the reason it lives
there — publishing from a private repo needs a paid plan, and the alternative
was a decision about the game's source visibility that no changelog should
force.

The tokens in its stylesheet are lifted from `src/app/tui-shell.css` rather than
approximated, so the site and the game are one object seen from two places.
Hand-written HTML and one stylesheet; no build step for the pages, because a
changelog that needs a toolchain to publish a paragraph stops getting written.

Remotion produces the videos, and the composition is generic — the props are the
script, so the next video is a props object rather than a new composition. The
first is 24 seconds. Figures are drawn rather than screen-recorded: a recording
of a page that will change next month dates the video the moment it ships.

**The video has no audio track**, deliberately. The captions carry the whole
message, so silence costs the viewer nothing and is more honest than a stock
loop chosen at random. The brief asked for music that is light and never
overwhelming; nothing is the lightest that constraint allows. Adding a score
later is a props change.

## Verified

Local gate green: **179 domain · 31 browser · 24 fixture · 52 visual**, bootstrap
107/107, migrations 45/45 immutable plus 14 authorized additive,
parity 237/237, three HTTP interfaces, 99 CSS custom properties resolving.

Budgets: home 198804 B JS / 25178 B CSS, game 205205 B JS / 30088 B CSS — inside
the 220/50 and 320/65 KiB ceilings.

One caution worth recording: a stale `pnpm start` left on port 3000 caused 43
visual failures that looked like real regressions and were the suite testing an
older build. Free the port before believing a visual failure.

## Hosted acceptance

**Green**, run `e2e_20260815T164937677Z_ccdd330e_79cc29ef` against the protected
Preview at commit `ccdd330`: **24 fixture · 3 services · 52 visual · 237/237
parity acceptance-verified**, cleanup on attempt 1 with **zero residue** across
every tracked resource — 6 auth users, 7 games, 3 queue requests, 25 accent
presets and 2 avatar objects all removed, and every residue counter at 0.

Three runs were needed and the two failures are worth reading, because neither
was what it looked like.

**Two runs died on /help**, on different tests, both with strict-mode violations
against two identical nodes — the second with two elements sharing one DOM id,
which is what made it worth chasing rather than retrying. The shell suspends
during SSR, so React streams the page into `<div hidden id="S:0">` and an inline
script moves it into place; between arrival and the swap both copies are in the
document. Walking the parent chain at the moment of duplication put copy one
under `MAIN#main-content` and copy two under `DIV#S:0[HIDDEN]`, so **nothing is
user-visible** — the second copy is inside `hidden`. Counting duplicate ids over
cold loads measured it at **6 in 15 on Production** and **2 in 15 on the
Preview**, so it predates this cycle and the release does not worsen it. The
tests were reaching into React's staging area and calling it the page; they now
search within `#main-content`, which is what they always meant.

**One run died in the services suite** on a draft row that had not cleared
inside fifteen seconds. It did not reproduce, and the same family is recorded in
v8 Cycle B as a stopwatch failure rather than a product one. Recorded as a flake
rather than explained, which is the honest description.

## What is still open

1. **The daily streak** is displayed and never advanced. It should either start
   working or stop being shown.
3. **Continuation pricing and the Daily unlock price are client-side.** The
   Methodology page says so plainly. Moving them server-side is a migration and
   its own change.
4. **`src/domain/rating.ts`** is a dead second copy of the Elo constants,
   imported only by a test. Its `Math.round` differs from Postgres on exact
   halves. Left in place, but it is now next to a page claiming precision.

5. **A services-suite flake** on the draft-clear window, unexplained.

## The owner's review pass

After reading the Preview and the changelog the owner asked for a set of edits,
all of which are in.

**The rating figure was clipping its outermost labels.** The gutter was 8 units,
so the first tick sat at `x=8` and the last at `x=632` in a 640-wide viewBox —
and because the labels are anchored at their middle, "600" and "1800" each hung
half their width outside the frame. Widened to 26. Measured at 1440px, 320px and
in both schemes: nothing overflows either edge.

**American spellings.** Six fixes in rendered copy — `maths`, `centred`,
`towards`, `labelled` twice, `coloured` — across four files. `cancelled` was
deliberately left: it is the stored database value for a match result and the
History table prints it raw, so changing only the dozen UI messages would spell
it both ways on adjacent screens, and both spellings are valid American English.
Code comments, stylesheets and reports keep theirs; churning roughly 190 of them
against a release candidate buys nothing.

**About** is rewritten to the owner's copy — what the game is, what it upgrades,
and why — with Credit moved down to sit above Accessibility and privacy, and
"What has changed" renamed to "Changelog". The four new outbound links go
through the shared `ExternalLink` rather than becoming a fourth pattern. One
judgment call: the brief referenced the methodology page by its Preview URL,
which is a deployment rather than a route and would rot on the next deploy, so
the link is internal.

**Methodology** keeps every number and loses a sentence: the intro is shorter,
"Elo system" links to Wikipedia, "Three things worth stating plainly" is now "A
few notes", and the last section is regrouped under Server and App headings so
the split is visible rather than described.

**The changelog post** is retitled "What's under the hood" everywhere it
appears, and the video was re-rendered rather than left disagreeing with the page
it sits on — the title is a prop, so that was one line and two commands, which is
what building the composition generically was for.

**Eight of the eleven accounts in the player directory were not people.** They
were end-to-end testing accounts from a pre-greenfield harness whose cleanup ran
only in a `finally` and threw instead of retrying, so an interrupted run left
public profiles behind with no receipt. They carried the same "PLAYER" label a
real account gets. `scripts/retire-legacy-test-accounts.mjs` removes them,
targeting the eight public profile ids rather than the `Ember`/`Frost` name
pattern that found them — a name is something a player can change and something
a real player could coincidentally hold, and ids cannot collide. Dry run by
default; the deletion is the owner's to run.

## The release, and the one thing only the owner can do

Everything is staged. Production still runs the pre-v10 build and the release is
a separate authorization: promote the Preview, then **verify the live build id**
rather than the deploy exit code, because a prior rollback pins Production until
`vercel promote` runs.

## Rollback

`git revert` any of the application commits independently; they do not depend on
each other. Reversing the migration is three `drop constraint` statements plus
re-emitting the two validators from their previous definitions — nothing would
be lost, since no row holds the new values until the owner selects them. The
changelog repository is separate and affects nothing in the game.
