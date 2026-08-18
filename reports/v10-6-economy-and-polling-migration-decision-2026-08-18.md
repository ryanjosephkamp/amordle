# v10.6 — economy authority and polling cost

**Date:** 2026-08-18 · **Branch:** `codex/amordle-terminal-greenfield-implementation-2026-07-27`
**Migrations:** three, **APPLIED 2026-08-18** and verified in the database
**Production:** **NOT deployed** — still the previous build, and now mismatched with its own database. See the warning below.

Implementation of the recommendations from the 2026-08-18 assessment. The
assessment itself is held outside this repository, deliberately; this packet
describes what changed and why, without restating the parts that were kept out.

---

## Read this first: Production and its database disagree

The migrations are applied. **The application is not deployed.** The live build
still calls `credit_player_economy_coins`, and that grant is gone.

So right now, a signed-in player who finishes a Solo game will not be paid their
coins. Nothing else is affected — the failure is confined to the reward call in
`finalizeAccountHistoryRow`, Solo still plays and saves, COMBAT and ratings are
untouched, and the Daily unlock's old path fails closed rather than giving
anything away. But it is a real, live, player-visible fault, and it lasts until
the new build ships.

**Deploying is the next action, not an optional one.**

This is the ordinary cost of a revoke landing before the code that stops needing
it, and it was the right way round: the reverse order would have left a window
where the new build called a function that did not exist yet. It is worth
recording rather than glossing, because the window is real and the fix is a
deploy.

---

## What changed

### 1. The coin award is derived, not asserted

`credit_player_economy_coins` took the amount and the operation id from the
caller and was granted to `authenticated`. It is no longer granted. In its place,
`claim_game_reward_v1(p_history_row_id)` reads the `game_history` row the client
has already written, derives what that game is worth in PL/pgSQL, and derives
the operation id from the row id.

**This bounds the path. It does not close it**, and the migration says so in
capital letters at the top, because `game_history.entry` is still owner-writable.
The change is one of degree, and the degree matters:

| | before | after |
|---|---|---|
| per call | up to 10,000 coins | what the named game is worth |
| ceiling | none — fresh operation id each time | 48 coins, once per row id |
| evidence | nothing recorded | a game row in the player's own History |

48 is a won GO game with all ten puzzles solved: `8 + 10 × 4`. The solved count
is clamped to what the declared mode could physically have produced before it is
allowed to price anything, so naming a hundred solved puzzles buys nothing.

Two details that were nearly bugs:

**The operation id reproduces the old client-side scheme on purpose.** Every
reward already paid is recorded in `player_economy_operations` under
`solo-reward:<id>` / `completion-reward:<id>`, and that table is keyed on
`(user_id, operation_id)`. A cleaner new scheme would have re-paid every game in
every account's history exactly once, silently, on first claim.

**Non-Solo games derive to zero rather than raising.** COMBAT rows are written
with `rewardCoins: 0` and settle their value as rating. A zero-value claim is
not an error; it is nothing to pay.

### 2. The Daily unlock is atomic, and the entitlement moved

This one closes properly, because the price is fixed rather than a function of
live Solo state.

`unlock_daily_entitlement_v1(p_local_date, p_mode)` holds the price server-side,
takes the coins and writes the entitlement in one transaction. The entitlement
lives in a new `player_daily_entitlements` table with no browser-writable path —
same posture as `player_economy_state`: an owner-read policy for documentation,
a `revoke all` that does the actual work, and RPCs for everything.

The migration **backfills** from both places the field was carried — the progress
snapshot and the account-state continuity row — with `unlocked` winning over
`pending`. A migration that moved the field without carrying the rows would have
silently relocked every Daily anybody had ever bought.

The real prize is `canLoadDailyAnswers` in `src/server/identity.ts`. That
function decides whether the server ships a past Daily's **answers** to the
browser, and it was reading the entitlement out of the owner-writable snapshot.
It now asks the table only the server can write, and a failed read denies rather
than allows.

`ECONOMY_PRICES.dailyUnlock` stays at 60 in the client, deliberately: the
confirmation dialog has to tell the player what they are about to spend. It is
now a label rather than a price, and a contract test requires the label and the
price to agree.

### 3. The notification feed is one request, at a fifth of the rate

This was the largest running cost in the project and the shape of it was worse
than the assessment recorded.

**The assessment said four requests every 30 seconds. It is four to
twenty-four.** After building its lists, `loadNotificationFeed` took up to twenty
terminal Practice games and issued one further request per game to collect
rematch state. That fan-out is invisible unless you read to the end of the
function, and it is the correction most worth carrying forward.

`get_player_notification_feed_v1()` does the whole thing in the database and
returns it once — the same shapes, parsed by the same schemas, so this is a
transport change rather than a behaviour change. Three further savings came with
it:

- **A player with notifications off costs one empty response.** The old code
  fetched everything and then discarded it.
- **The legacy scan is bounded.** It looked for `authority_version = 0` rows —
  pre-v2 games — on every poll, open-ended, forever. Now ninety days.
- **The calendar and the Daily gate no longer read the progress snapshot at
  all**, because entitlements became their own small query.

The interval went from 30 s to 120 s. Nothing in this feed is time-critical: a
match invitation two minutes later is still an invitation, and a player actually
in a match is served by the 5-second match poll.

### 4. Three realtime subscriptions removed, because none of them could fire

The assessment suspected this. It is now checked, and the answer is more complete
than suspected:

- `multiplayer_private_match_requests` and
  `multiplayer_practice_rematch_requests` **are not members of the
  `supabase_realtime` publication.** Only six tables were ever added to it, in
  the Phase 23 migrations, and neither is one of them. A subscription to an
  unpublished table connects, reports `SUBSCRIBED`, and never fires.
- `async_multiplayer_games` **is** published, but its select policy admits only
  `authority_version = 0` rows, and Realtime authorizes each change against that
  policy per subscriber. Every game created since the v2 authority is invisible
  to it.

So the app held a websocket and three subscriptions that did the work of a no-op,
beside a poll that did the work. All three are gone. The one case this gives up
is a change to a surviving legacy row, which the 120-second poll still catches.

Restoring realtime here means publishing the request tables and giving the v2
authority a readable projection — a schema change, and its own piece of work.

---

## The number, and what still needs measuring

**Request count is exact**, because it is derivable from the source:

```
before, per cycle:   4 requests, plus 1 per terminal Practice game, capped at 20
                     = 4 to 24
        per hour:    120 cycles × (4 to 24)  =  480 to 2,880 requests

after,  per cycle:   1
        per hour:    30 cycles × 1           =  30 requests
```

**A 16× reduction at minimum, 96× for a player with a Practice history**, per
signed-in tab, on every page, whether or not they are playing.

**Bytes are not exact, and I will not pretend otherwise.** The response size
depends on live data I cannot read from here. What can be said precisely is the
shape of the saving: 23 of the 24 requests disappear entirely, and each carried
its own request headers — including the JWT, sent on every single call — plus
response headers and a TLS record. The body bytes for combat, legacy and
requests are broadly unchanged; the settings row and the twenty rematch
envelopes are pure removal.

**To turn this into a measured number**, on the deployed build, before and after:

1. DevTools → Network, filter to the Supabase host.
2. Sign in, sit on `/combat` for four minutes, touch nothing.
3. Read the transferred total. Divide by 4 for KB/min.

Four minutes rather than two, because the new interval is two minutes and one
cycle is not a measurement.

---

## Verified

Local gate **green**:

- `pnpm check` — format, lint, typecheck, build, bootstrap 107/107, migrations
  45/45 immutable + 15/15 authorized additive + **3/3 reviewed pending**, word
  assets 34/34, keyboard manuals, boundaries, MP v6 audit 73/73, parity 237/237,
  three HTTP interfaces, 102 CSS custom properties, bundle budgets.
- **241 domain** (was 220 — three new contract files), **31 browser**,
  **24 fixture**, **52 visual**.

Budgets moved by rounding only: home 199011 B JS / 25046 B CSS, game 205422 B JS
/ 29956 B CSS, inside the 220/50 and 320/65 KiB ceilings.

### The new contract tests

All three read the **migration text** and the **source text**, never a restated
copy — the shape established by `economy-rpc-contract.test.ts` after the
consumable vocabulary drifted and shipped.

- `tests/domain/solo-reward-contract.test.ts` — the two halves of the reward
  formula agree across TypeScript and PL/pgSQL, the operation-id scheme matches,
  the clamp exists, the old grant is not restored, and the migration still says
  plainly that it bounds rather than closes. That last one asserts a comment, on
  purpose: a future reader who concludes the economy is tamper-proof would be
  wrong, and the comment is the only thing standing between them and that.
- `tests/domain/daily-entitlement-contract.test.ts` — price agreement, one
  transaction, no browser-writable path, backfill present, no writer left
  pointing at the old field, and the answers gate reading the right table.
- `tests/domain/notification-feed-contract.test.ts` — one request, 120 s, no
  subscription, the disabled-feed short circuit, the settings default, and the
  bounded legacy scan.

**One existing clause was updated rather than worked around.** MP-16 pinned
`refetchInterval: 30_000` and the `notification-projection` channel by name.
Both are deliberately gone, so the clause now pins what replaced them and
asserts the channel is absent. What MP-16 is actually about — durable,
exactly-once alerts — is unchanged.

---

## Applied, and what it proved

All three migrations applied on 2026-08-18. Verified **in the database** rather
than trusted from the CLI's exit code, per the v10.4 precedent:

- `pg_proc` holds all five new functions.
- `has_function_privilege` for `authenticated`: **false** on
  `credit_player_economy_coins`; **true** on `claim_game_reward_v1`,
  `unlock_daily_entitlement_v1` and `get_player_notification_feed_v1`; and still
  **true** on `spend_player_economy_coins`, which is correct — the continuation
  is deliberately still client-priced.
- Registry entries moved to `authorizedAdditiveMigrations`, **15 → 18**, and the
  gate re-run green on the applied state: 18/18 authorized, 0/0 pending, 241
  domain, 31 browser.

### The backfill, which was the one part only reasoned about

It wrote **five rows, every one of them from the account-state continuity row in
`game_history`. `progress_snapshots` contributed nothing** — a count of
well-formed `dailyEntitlements` keys there returns zero.

A backfill from the obvious single source would therefore have silently
relocked **all five** paid Dailies — 2026-08-01 in both modes, 2026-08-02 in
both modes, and 2026-08-06 OG, every one already `unlocked`. The second source
was included on the reasoning that `src/server/identity.ts` read from it; it
turned out to be the only source that had anything.

### The types diff was not empty, and I said it would be

76 insertions across 9 hunks. The prediction was wrong in three ways, none
harmful and all worth recording:

- **Content.** Four of the five hand-written signatures matched the generator
  exactly. `list_my_daily_entitlements_v1` was written with
  `Args: Record<PropertyKey, never>` where this generator emits `Args: never`
  for a no-argument function — a convention already visible in
  `get_player_economy_state`, which should have been copied rather than guessed.
- **Omissions.** The hand edit covered only the `public` functions the client
  calls, so it missed the three `brrrdle_private` helpers and the whole
  `player_daily_entitlements` table block. Nothing broke, because no client code
  references them.
- **Ordering.** Three entries were each placed one alphabetical slot too late.

The generated file is now the committed one. The generator's version wins, which
is what the instruction to re-run it was for.

---

## Rollback

The three migrations are independent; any one can be reverted without the others.

- **Reward.** `grant execute on function public.credit_player_economy_coins(integer, text) to authenticated;` and revert the application commit. The new function can stay; nothing calls it.
- **Daily entitlement.** The only one with rows. `player_daily_entitlements` was
  backfilled from the snapshot rather than moved out of it, so the old field is
  still there and still correct for anything unlocked before the migration —
  reverting the application commit restores the old reads. Entitlements bought
  *after* it would need copying back into the snapshot first.
- **Notification feed.** Pure addition plus an application change. Revert the
  commit; the function is then unused.

## Not done, on purpose

**Continuation pricing stays client-side.** The price is a function of live Solo
state, the server does not hold Solo state, and giving it one means a Solo
authority table and the loss of offline play. The Methodology page continues to
say so, now with the reason attached.
