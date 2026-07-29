# Amordle Stage 2 v5.2 manual review checklist

Preview:
`https://amordle-a9w7pjo4g-ryanjosephkamps-projects.vercel.app`

Deployment: `dpl_DAFZrppgyVeDE5rABLdtRqBbqSq2`

Application commit: `bdc492fc2edbe7ceb367529166cd472f5aaff1d3`

## Lobby

- [ ] With two accounts, create a public Practice game and confirm it appears
      under public games for the other account.
- [ ] Confirm the row shows mode, length, lane, safe host identity, age, and
      availability without an answer, seed, email, or private identifier.
- [ ] Join and confirm the row disappears once it is no longer joinable.
- [ ] Create and cancel another public game; confirm it disappears.
- [ ] Confirm private requests remain in their separately labelled section.
- [ ] If Daily is available, confirm an open Daily game appears with the correct
      lane and mode.

## Profile accent

- [ ] Select each named accent with mouse/touch and keyboard.
- [ ] Save one accent, navigate away, reload Profile, and confirm it persists.
- [ ] Confirm the selected accent decorates the public profile consistently.
- [ ] Confirm a save failure, if simulated, leaves other valid edits intact and
      provides an actionable error.

## History and Stats

- [ ] Finish one signed-in Solo game.
- [ ] Open History and confirm exactly one new row with mode, result, settings,
      guesses/puzzles, reward, and date information.
- [ ] Reload History and Stats repeatedly and confirm the completion does not
      duplicate rewards, XP, coins, or rows.
- [ ] Confirm Stats updates games, outcomes, guesses/puzzles, rewards, and its
      relevant Solo/Practice/Daily/OG/GO breakdown.
- [ ] Complete one COMBAT game with two accounts and confirm exactly one
      History entry and corresponding Stats update for each participant.
- [ ] Review a new account and confirm History is empty and Stats show truthful
      zeros instead of an indefinite loading state.
- [ ] If sync is interrupted, confirm the local History row says sync pending
      and clears after recovery without inventing remote rewards or rating.

## Alerts

- [ ] Create a private request and confirm the recipient receives one alert.
- [ ] Verify match-created, turn, result, and rematch transitions each appear
      once and route to the relevant surface.
- [ ] Mark alerts read, refresh, and confirm the read state persists.
- [ ] Confirm no notifications and partially unavailable notification sources
      have distinct messages.
- [ ] Confirm blocked-player and notification preferences remain respected.

## Annotated gameplay repairs

- [ ] At desktop 100% zoom, confirm five-letter Solo and COMBAT rows are larger,
      centered, and share the keyboard axis.
- [ ] At 320, 360, 390, and 412 widths, confirm the initial six-row game and
      complete keyboard are usable without document scrolling.
- [ ] Add purchased or multiplayer rows beyond the initial capacity and confirm
      the board history scrolls internally while the keyboard stays available.
- [ ] Score an absent letter and confirm its keyboard key is visibly filled,
      marked `×`, announced as absent, and clearly different from untouched.
- [ ] Confirm stronger correct/present evidence is not downgraded by a later
      duplicate-letter result.
- [ ] Confirm removed consumable keys remain disabled and visually distinct
      from scored absent keys.
- [ ] Confirm COMBAT stays one chronological center board with an actor label
      beside each accepted row.

## Fields and containment

- [ ] Confirm inputs are visibly identifiable in Auth, Profile, Settings,
      Feedback, Admin, Word Explorer, and COMBAT forms.
- [ ] Confirm focus, autofill, invalid, disabled, and placeholder states remain
      legible in light and dark system themes.
- [ ] Confirm no horizontal document scroll at 320, 360, 390, 412, 768, 960,
      1440, or 1920 widths and at 200% zoom.
- [ ] Confirm forced colors and reduced motion remain usable.
- [ ] Confirm Leaderboards behave as before; no redesign was intended.

## Release boundary

- [ ] Record any remaining manual-review issue before merge consideration.
- [ ] Rotate or revoke the previously exposed Preview-scoped Blob credential.
- [ ] Do not merge, promote to Production, change the default branch, alter
      migrations, delete the branch, inspect stash, mutate the locked shell, or
      delete real accounts from this review.
