# Deferred roadmap — recorded, not scheduled

Source: owner intake of 2026-08-08. Everything here is **explicitly out of scope** for the v7.3 pass
and is recorded so it is not lost. Each item gets its own cycle when the owner calls for it.

Companion: `WORK-INTAKE.md` — what *is* in scope now.

---

## D1 — Draw by threefold repetition

The owner's original design from the pre-rewrite shell version. Almost certainly **not implemented**
in the current codebase; the plan should confirm rather than assume, but must not build it.

**Rule.** In a COMBAT match **not** on Hard Mode, a player may repeat the same guess, provided it is
not the current puzzle's solution. If **both** players guess the same word three times each in an
unbroken alternating sequence — six identical guesses in a row across both players — the match ends
in a **draw**.

- One player repeating three times does **not** force it; that would be unfair to the opponent.
- The sequence must be unbroken, and is voided if either player wins the puzzle or the match ends.
- Hard Mode may make it unreachable; that is fine and expected.

**Draw outcome.** No winner. Not a win and not a loss. Zero coins, zero points, no rating effect —
a null result, functionally a mutual quick cancel.

**In-match progress indicator**, modelled on how online chess warns of an approaching draw. Shown to
both players in the game area, ideally naming the word:

- after the first mutual pair — "repeat GUESS two more times for threefold repetition"
- after the second — "repeat GUESS one more time…"
- after the third — draw by repetition.

**Not documented in Help.** The owner explicitly does not want it taught or advertised; it is a
hidden mechanic.

**Dependency note:** W4b in the current pass adds the `draw` result colour ahead of this, so the
History page is ready when the mechanic lands.

---

## D2 — About / Info section

A new area, likely under Profile, holding several sub-pages. Structure may follow the "All game
modes" pattern: a page of buttons leading to sub-pages.

### D2a — Methodology (the priority piece)

Exists to keep the game **transparent**, especially for ranked COMBAT — players should be able to see
they are not being evaluated unfairly, and understand how to improve.

Must contain, accurately and grounded in the real implementation:

- **The ELO algorithm**: the actual equation, plus a plain-language explanation and a justification
  for the choice. Nothing in the game currently shows this.
- **Experience points and levelling**: how XP is earned and how levels are reached.
- **The coin economy**, including the **variable continuation cost algorithm** — the price of opening
  an extra row changes, and the owner does not want players left in the dark about how.

**Inbound links:**

- **Leaderboards — required.** A button along the lines of "How is ELO calculated?" that navigates to
  Methodology and scrolls to the ELO section.
- **Stats — undecided.** The owner is on the fence; skip it unless it clearly helps.

### D2b — Updates / changelog

A per-release changelog, technical enough for a developer and high-level enough for a player.
Intended approach: a **GitHub Pages blog** embedded into this page. Precedent the owner has already
built: their research-monitor macOS app embeds a GitHub Pages blog the same way. Exact mechanism to
be settled when the work is scheduled.

### D2c — About the creator / contact

- Name, avatar, short bio.
- A link to the owner's **in-game player profile**.
- External links, supplied later: X (Twitter), GitHub, personal website, YouTube.
- A **creator-only flair** that no other account can have, marking them as the game's author.

### D2d — Donate

Possibly its own page rather than combined with contact.

- Payment target undecided: **PayPal** at minimum, possibly **Patreon** (owner has not used it yet).
- Ideal shape: one button, authorise an amount, done.
- Copy explaining **why** donations matter: backend scaling and security costs if the game grows.
- Possible later: donor flair or features. Explicitly bells and whistles.

**Framing that should shape all of D2:** the game is meant to be *"the Lichess of Wordle"* — free
forever, no ads, no nonsense. That is the product's identity and should read through this section.

---

## D3 — First-run onboarding

**The concern.** A newcomer without terminal, TUI or CLI familiarity may read the deliberately
minimal aesthetic as cheap or "vibe-coded" and leave before discovering the game is good.

Ideas raised, none settled:

- Detect a first-time visitor (no cookie or stored state) and route them to Help.
- Embed a full tutorial video from the owner's YouTube channel, once made.
- A chess.com-style interactive first-run walkthrough pointing out what controls do, dismissible,
  and re-enablable afterwards.

The owner explicitly does not know the best approach and wants help choosing it.

---

## D4 — Homepage and first-impression redesign

**The concern.** The homepage does not convey how good the game is. It should feel like an
**experience**, not a dashboard or a tool. The owner wants it modern and professional **without
abandoning the terminal aesthetic** — the minimalism is deliberate, but the pages a newcomer meets
first have to be excellent.

- Applies to the homepage and other early-introduction surfaces.
- One idea floated: a brief entry effect, as though "entering the terminal".
- Explicitly framed as bells and whistles rather than core mechanics — real, but not urgent.

---

## D5 — Leaderboards player search

Not needed yet and not decided. Revisit once the player base is large enough that finding a specific
player matters.

---

## Settled — no work wanted

- **Word Explorer** — "basically perfect", leave alone.
- **Leaderboards** — "basically perfect for now", see D5.
- **Hard Mode interactive Help aid** — "basically perfect", must not change (also stated in
  `WORK-INTAKE.md` W5).
- **CANCEL BEFORE PLAY / FORFEIT MATCH** — working correctly; an earlier suggestion about them was
  retracted.
