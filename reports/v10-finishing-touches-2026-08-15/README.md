# v10 — the finishing touches

**Date:** 2026-08-15 · **Range:** `f2b28a7` → `683fad9`
**Migration:** `20260815055205_amordle_creator_identity_v1.sql` — written, reviewed, **pending apply**
**Changelog:** **live** at <https://ryanjosephkamp.github.io/amordle-updates/>
**Operator manual:** <https://claude.ai/code/artifact/96411a8b-f9bb-4627-aa4f-fb8b04c5894f>
**Preview:** not yet deployed
**Production:** unchanged, `dpl_CdUNmm9RzxF3fgLCkMoewUkjMC3G`

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
107/107, migrations 45/45 immutable plus 13 authorized and 1 reviewed-pending,
parity 237/237, three HTTP interfaces, 99 CSS custom properties resolving.

Budgets: home 198804 B JS / 25178 B CSS, game 205205 B JS / 30088 B CSS — inside
the 220/50 and 320/65 KiB ceilings.

One caution worth recording: a stale `pnpm start` left on port 3000 caused 43
visual failures that looked like real regressions and were the suite testing an
older build. Free the port before believing a visual failure.

## What is still open

1. **The migration is not applied.** Authorized by the owner, but
   `supabase db push --linked` needs the database password, which is the owner's
   to enter. Until it runs, `creator` and `voltage` are refused by the server —
   harmless, since the picker only offers them to that one account.
2. **No Preview deployment yet**, and therefore no hosted acceptance. The
   release path is Preview → full hosted acceptance → promote.
3. **The daily streak** is displayed and never advanced. It should either start
   working or stop being shown.
4. **Continuation pricing and the Daily unlock price are client-side.** The
   Methodology page says so plainly. Moving them server-side is a migration and
   its own change.
5. **`src/domain/rating.ts`** is a dead second copy of the Elo constants,
   imported only by a test. Its `Math.round` differs from Postgres on exact
   halves. Left in place, but it is now next to a page claiming precision.

## Rollback

`git revert` any of the three commits independently; they do not depend on each
other. The migration has not been applied, so there is nothing to reverse in the
database. The changelog repository is separate and affects nothing in the game.
