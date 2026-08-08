# v7.3 — work intake (in scope now)

Source: owner intake of 2026-08-08, dictated by voice, plus four annotated screenshots.
Base: `3d7e99b`, tag `amordle-stage2-v7.2-help-and-match-setup-golden-2026-08-08`. v7.2 accepted.
Companion: `DEFERRED-ROADMAP.md` — everything explicitly **not** to build in this pass.

This file is the working spec. Where the owner's wording and the code disagree, the code
observation is recorded alongside so the plan can resolve it rather than discover it late.

---

## W1 — Remove CLAIM WIN ON TIME entirely

**Owner ruling, stated as a rule of the game:** if a player runs out of time, that player loses.
Period. No claim, no discussion, no button. The button added in v7.1 is to be removed together with
its functionality.

**Two observed defects that prompted it, both real:**

1. It renders on **untimed** matches. Screenshot: an untimed unranked Practice OG match with no
   clocks beside either player, showing the control. Cause is mine, in `readCombatClock`
   (`src/domain/clock.ts`): `durable = Math.max(0, durableRemainingMs ?? 0)`, so an untimed lane's
   `null` budget becomes `0`, `remainingMs` becomes `0`, and `expired` becomes `true`. `ClockValue`
   is gated on `timeRemainingMs != null` and so renders nothing, but `canClaimTimeout` has no such
   gate.
2. On a timed match it renders before the opponent's clock is out, and pressing it returns
   *"Their clock has not run out yet."* — the `TIMEOUT_PENDING` mapping.

**Scope of removal:** the `CLAIM WIN ON TIME` button, `canClaimTimeout` and its tests, and the
`TIMEOUT_PENDING` user-facing message if nothing else reaches it. Keep `readCombatClock` itself —
the v7.1 anchoring fix is unrelated and accepted — but fix the untimed/null handling regardless,
because `expired === true` on an untimed lane is wrong on its own terms.

**Explicitly keep unchanged:** `CANCEL BEFORE PLAY` and the `FORFEIT MATCH` it becomes after the
first turn. The owner retracted an earlier suggestion about these. They work correctly.

### The unresolved half — must be settled in the plan, not assumed

Removing the control alone restores the pre-v7.1 hole: the server only materialises the clock and
declares a timeout **inside `save_amordle_combat_command_v2`**, when some command arrives. There is
no `pg_cron` and no scheduled job anywhere in `supabase/migrations`. So with no button and no other
mechanism, a match whose player walks away sits at `0:00` indefinitely — which contradicts the
owner's rule that running out of time *is* the loss.

Candidate resolutions, cheapest first:

- **A. Silent automatic claim.** When a client observes the opponent's clock at zero, it issues the
  existing `timeout` command with no UI and no message. Matches the ruling exactly — the player
  never chooses, it just happens. No migration. Both clients race harmlessly: the command is
  idempotent by action id and the second caller gets `TERMINAL`. Weakness: settlement still needs
  *someone's* client open, so it resolves on next visit rather than instantly.
- **B. Scheduled settlement.** A cron/edge job sweeping expired turns. Truly automatic, but needs a
  forward migration and infrastructure, and the owner has not authorised one.
- **C. Settle-on-read.** Make the read RPC debit and terminate. Rejected on sight: it is declared
  `stable`, and making a read mutate is a large authority change.

Recommendation to carry into the plan: **A**, with the residual honestly recorded — it is
"automatic from the player's point of view" rather than "guaranteed within N seconds". B is the
right long-term answer and belongs in the deferred roadmap.

---

## W2 — Combat turn affordances

Both from the second screenshot: a GO Practice match on the opponent's turn.

**W2a. The draft-row caret must disappear when it is not the viewer's turn.** Today the blinking
block renders and blinks during the opponent's turn, which reads as an invitation to type — most
misleading at the very start of a match when neither player has moved and the board is empty. It
should be absent while waiting, and reappear (blinking) the moment the turn returns.

The blink is `@keyframes terminal-cursor` in `src/features/solo/solo-game.css`, applied via
`.board-row.is-draft .tile:empty:first-child::after`. Note the solo route shares this stylesheet, so
the change must be scoped to combat's not-your-turn state and must not alter Solo, where it is
always the player's turn.

**W2b. Dim the keyboard further on the opponent's turn.** The existing dim is correct in kind but
too weak. Increase it noticeably without making the keys look broken or unreadable. Whatever value
is chosen must still satisfy the contrast sweep — a disabled control is measured on what a player
actually sees, so this trades directly against `--control-disabled-opacity` (currently `0.74`).

Together these two should make "not your turn" obvious without looking up at the status line.

---

## W3 — Muted text on light surfaces (site-wide audit)

**Instance:** profile page, custom accent card. The card is a light/near-white surface; the accent
name (`Gay`) and hex (`#8702B0`) render in light grey and are hard to read, while `edit` on the same
card and `save profile` below it are dark and readable. Owner wants the light grey replaced by that
same dark treatment — here, **and everywhere the same pairing occurs**.

**This is the third instance of one defect family, not a new bug.** Same root as the v7.2 alerts
badge (2.89:1 hovered) and notification row (1.94:1 hovered): *secondary text keeping `--muted`
after its surface flips to the selected/light treatment.* In dark scheme `--muted` is a light grey
and `--terminal-selected` is a light slab, so muted-on-selected is light-on-light.

The token for this already exists and is already used correctly by `.route-link:hover span` and, as
of v7.2, the notification row: **`--terminal-selected-muted`** (light scheme `oklch(0.86 0.01 220)`,
dark scheme `oklch(0.34 0.018 225)`). Known starting point: `.custom-accent-option small` at
`src/app/tui-shell.css:3090` sets `color: var(--muted)`.

**Do not treat this as a one-line fix.** Audit every rule that paints `--muted` (or another light
secondary ink) on a surface that is or can become light — selected states, `--terminal-selected`,
accent-backed cards, hovered/pressed controls — and route them through the selected-muted token.
The owner's rule, in their words: a light grey must never sit on a light or white background
anywhere in the game; it is acceptable only over a genuinely dark background.

**The check that would have caught all three** is the same one: the contrast sweep only measures
`controlSelector` plus a small accent-surface probe. It does not walk arbitrary text on selected
surfaces. Widening that is the durable fix and should be part of this work, not a follow-up.

---

## W4 — History page

**W4a. `definition` link alignment.** Each completed-game card is a two-column grid: ALL-CAPS label
left (DATE, GAME, RESULT, PROGRESS, REWARD, STATUS, DEFINITIONS), value right. Every value is
left-aligned at a consistent x and shares its label's row — except the DEFINITIONS row, whose
`definition` link is centred and sits below the label's baseline. Make it behave like every other
value: same row as its label, left-aligned to the same column edge.

**W4b. Result colour coding.** `RESULT` is currently plain text. Colour it:

| Result | Colour |
| --- | --- |
| `won` | green |
| `lost` | red |
| `draw` | orange (yellow acceptable) |

Constraints: must remain legible in **both** schemes — the owner specifically flagged that the draw
colour must not wash out in light mode. Use the existing semantic tokens rather than new literals
where they fit (`--correct` / `--danger` already exist; an orange/warning token may need adding, and
if so it needs both scheme values and must pass the sweep). Colour must not be the only signal —
the word itself remains.

**`draw` does not exist as a result yet.** Nothing produces it today; the mechanic that would is
deferred (see `DEFERRED-ROADMAP.md` D1). Add the colour treatment so the value is ready, but do not
build the mechanic and do not invent a fake draw state in the data.

---

## W5 — Help page animations (artifact-first)

The owner's verdict on v7.2's aids: correct in style, theme, font and colour, but **unsubstantial**.
The Hard Mode interactive component is **"basically perfect" and must not change.**

### W5.0 The process, which is itself part of the ask

Do **not** iterate these inside the app. Build every animation into **one artifact**, embedded and
replayable in the same manner as in-game, hand it over, take feedback, **update that same artifact in
place** (same URL), and repeat until the owner locks them all in. Only then port them into the app,
replacing the current aids. Rationale, in the owner's words: avoid repeatedly pushing preview
deployments while refining, and keep alignment cheap.

The artifact does **not** need to reimplement the game — only to show the animations faithfully
enough to judge, with the same replay affordance.

Timing within the pass is free: first, middle or last, as long as it happens.

### W5.1 OG and scoring — REMOVE the animation

Keep only the final frame, statically: coloured tiles with their marks. No replay control. The
owner's reasoning: watching colours appear teaches nothing and replaying it is purely cosmetic. The
colours themselves now render correctly on mobile and that part is appreciated.

### W5.2 GO chains — REPLACE with a real solo GO playthrough

Show the **gameplay area only, no keyboard** — the same thing the LIVE spectator view shows.
A default-configuration solo Practice GO chain: **5 letters, 5 puzzles**, deterministic, that ends in
a **win**. Include **wrong guesses** so evidence visibly accumulates; the point is to show a real
game, not a flawless one. Pace roughly **one guess every 1.5–2 seconds**. Show the hand-off between
puzzles, which is the thing this section actually teaches.

Effectively: what a screen recording of someone winning a 5×5 GO chain would look like, minus the
keyboard.

### W5.3 Practice and Daily — REMOVE the animation

Revert to the static comparison. Owner: the animation "just lights up some colours" and adds
nothing; a good animation for this content is hard to justify, so do not force one.

### W5.4 COMBAT — NEW animation, the most ambitious item

Replace "FOLLOW THE SHARED BOARD", which the owner could not interpret.

Layout — a **horizontal** rectangle on the usual dark ground, sized so nothing needs squinting but
without eating the page height:

- **Gameplay area** in the centre, positioned **above** the midline between the two keyboards, not
  level with them. Standard **six** visible rows, OG, 5 letters, Practice COMBAT.
- **Keyboard on the left**, and **keyboard on the right**, identical in layout, each in a
  **different default accent colour**, each with a player name.

Sequence:

1. Left player's keys light as the guess is entered; letters populate the current board row exactly
   as they would in play.
2. They submit; the board row resolves to its evidence colours, and **both** keyboards update —
   this is the shared-evidence point of the whole figure.
3. Turn passes to the right player, indicated **subtly and non-intrusively** but unmistakably.
4. Repeat, alternating.

**The board must exceed six guesses — target 7 to 9 total.** This is the teaching goal: COMBAT does
not end at the sixth row the way Wordle and Hurdle do, and the board keeps extending. Ends with one
player winning; which player and the names are free choices.

### W5.5 Coins and tools — FOUR short new animations

One per tool, each brief and replayable, in the established style.

| Tool | Content |
| --- | --- |
| **Reveal** | Two rows, five letters. Row 1 carries some evidence (roughly one green, one yellow, rest dark). The button fires and a green letter appears in row 2 at its true position and identity — matching the real reveal mechanic. No full six-row board needed. |
| **Remove** | A keyboard. The button fires and letters that are not in the solution are removed from it. Simple, in the same theme, any default accent. |
| **Past Daily** | The calendar view for a month. A locked past Daily OG is clicked and unlocked; show what that looks like. |
| **Continue** | Gameplay area only, no keyboard. Five of six rows already filled consistently and accurately. The sixth guess is wrong, the continue option is used, and a new row is added. |

### W5.6 Everything else on Help

No further animations. Once these are finalised, Help is considered done for animations unless new
game features arrive much later.

---

## W6 — Stats page (discretionary)

The existing progress bars are liked and stay. The owner suspects value is being left on the table
and invites **additional charts or figures, possibly interactive**, at my judgement — with an
explicit instruction not to add filler: *if nothing genuinely valuable fits the data, add nothing.*

Constraints if anything is added: real data the app already has, correct colours, graceful and
precise, and it must survive the accessibility and contrast obligations that apply to every route.
A "no additions, here is why" outcome is an acceptable and expected result.

---

## Standing constraints for this pass

- No game mechanics, scoring, or evidence colour semantics change. W1 is a **removal** of a control,
  not a rules change — the rule it encodes is the owner's stated rule.
- Keyboard behaviour unchanged (W2b changes only the disabled *appearance*).
- 45 immutable migrations, the 107-file bootstrap baseline, and exactly three HTTP interfaces stay
  untouched. Any new migration requires separate authorisation and is not assumed.
- Reduced motion must degrade to a readable static state; the global block stops CSS animation only,
  so any JS sequencing checks `prefers-reduced-motion` itself.
- Bundle budgets stay inside limits; report what the animation work costs, as v7.2 did.
- Production release remains unauthorised.

## Owner working preferences worth carrying

- Values accuracy, care and precision over speed; wants work done as autonomously as possible.
- Wants to be told plainly when a claim of theirs does not match the code, rather than have it
  quietly worked around.
- Prefers artifacts for review, and plan mode before large or open-ended work.
- Dictates by voice; transcription artefacts are expected and should be read through, not
  interpreted literally.
