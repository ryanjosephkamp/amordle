# Amordle Stage 2 v5.3 manual review checklist

Preview:
`https://amordle-1bj4496rq-ryanjosephkamps-projects.vercel.app`

Deployment: `dpl_27v13DcnvNf4TyETMjeahHuNDpVY`

Application commit: `31be382e50fa451a9a8a961780f317f9555ed408`

## Keyboard evidence

- [ ] Start Solo and confirm untouched letter keys use a blue-gray raised
      surface rather than the ruled-out near-black surface.
- [ ] Submit a word containing an absent letter and confirm its key becomes
      near-black with light text and a visible `×`.
- [ ] Confirm green correct and amber present keys remain easy to distinguish
      from unknown and absent.
- [ ] Confirm Submit and Delete remain neutral and do not imply evidence.
- [ ] Confirm a later duplicate-letter result never downgrades stronger
      correct or present evidence.
- [ ] Use Remove Incorrect Letters and confirm removed keys remain disabled and
      distinct from ordinary absent keys.

## COMBAT evidence and alignment

- [ ] With two accounts, submit a guess from each participant and confirm both
      keyboards show the same accumulated current-puzzle evidence.
- [ ] Confirm the shared transcript reads in one sequence and shows
      `row · actor` beside every accepted guess.
- [ ] At 320, 360, 390, and 412 widths, confirm the row number, separator,
      actor, and guess never overlap.
- [ ] Confirm `YOUR TURN`, `OPPONENT'S TURN`, and waiting/result states remain
      fully visible and do not sit behind another element.
- [ ] In GO, solve one puzzle and confirm the next puzzle's keyboard resets,
      then reflects only its current board and rescored seed evidence.
- [ ] Confirm the complete mobile keyboard remains visible and the board stays
      centered on the same axis.

## Stable persistence presentation

- [ ] Type several letters without submitting and confirm the board and
      keyboard do not move vertically.
- [ ] Confirm routine `SAVING…` or `SYNCING…` copy never appears.
- [ ] If backup failure is simulated, confirm the bounded actionable notice
      appears without losing local progress.

## Account quick tools

- [ ] Open Account while signed in and confirm identity, Level, XP, Coins, View
      profile, and Sign out are present.
- [ ] Confirm Stats, History, Marketplace, and Settings are not duplicated
      inside Account and remain available from Menu.
- [ ] Confirm View profile navigates correctly and Escape restores focus to
      Account.
- [ ] Confirm Sign out works only when deliberately activated.

## Physical keyboard navigation

- [ ] From a non-editable surface, use Shift+1 through Shift+5 to open Home,
      Solo, Daily, COMBAT, and Data/History.
- [ ] Press Shift+M to open and close Menu.
- [ ] During Solo and COMBAT, confirm Shift+M opens Menu but a plain `m` enters
      the letter M.
- [ ] In Auth or another text field, confirm Shift+1 is typed into the field and
      does not navigate.
- [ ] Open a modal dialog and confirm global shortcuts pause until it closes.
- [ ] Confirm Tab/Shift+Tab, Enter/Space, arrow keys, and Escape operate visible
      controls without a mouse.
- [ ] Confirm route navigation moves focus to the new main content and is
      announced by a screen reader.

## Help and manuals

- [ ] Open Help and find “Mouse-free mode — for keyboard diehards.”
- [ ] Confirm Help lists the same direct shortcuts as
      `docs/keyboard-navigation.md` and `docs/keyboard-navigation.html`.
- [ ] Open the HTML manual on mobile and confirm filtering, copy buttons,
      details, light/dark mode, and print layout remain usable.
- [ ] Confirm the rules explain editable-field, modal, and gameplay-input
      boundaries accurately.

## Responsive and alternate presentation

- [ ] Confirm no horizontal document scroll at 320, 360, 390, 412, 768, 960,
      1440, or 1920 widths and at 200% zoom.
- [ ] Confirm the initial six-row game and complete keyboard fit without
      document scrolling at supported mobile sizes.
- [ ] Confirm extended game history scrolls internally while the keyboard stays
      available.
- [ ] Confirm light/dark, forced colors, reduced motion, keyboard, mouse, and
      touch operation.
- [ ] Confirm there are no serious/critical accessibility findings or visible
      console/page/network failures.

## Release boundary

- [ ] Record any remaining manual-review issue before merge consideration.
- [ ] Rotate or revoke the previously exposed Preview-scoped Blob credential.
- [ ] Do not merge, promote to Production, change the default branch or schema,
      inspect stash, delete the branch, mutate the locked shell, or delete real
      accounts from this review.
