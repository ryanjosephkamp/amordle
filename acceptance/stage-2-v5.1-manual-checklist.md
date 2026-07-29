# Amordle Stage 2 v5.1 manual review checklist

Preview:
`https://amordle-gve0ekzaa-ryanjosephkamps-projects.vercel.app`

Deployment: `dpl_9ykWPY3nhuWzmcG1pf5aUZkpaz2X`

Application commit: `098bdb5ef2335fff86d04a89acdbd122414246fb`

## COMBAT

- [ ] Create or join Practice with two accounts.
- [ ] Confirm every accepted guess enters one centered chronological board.
- [ ] Confirm each completed row clearly identifies its player.
- [ ] Confirm the current turn is explicit without splitting the board into
      left/right player lanes.
- [ ] Confirm waiting, active, recovery, result/rematch, and Live spectation
      use consistent row geometry.
- [ ] Confirm spectation is visibly read-only and exposes no private answer,
      seed, request, or participant-only field.

## Solo and global containment

- [ ] Enter a new Solo game on a phone and confirm the board and complete
      keyboard are visible without initial document scrolling.
- [ ] Confirm routine successful persistence shows no developer-style status.
- [ ] If practical, interrupt account backup and confirm the bounded
      player-facing message and Retry action.
- [ ] Review routes at normal zoom and confirm there is no horizontal document
      scroll.
- [ ] Confirm Submit and Delete remain fully visible and easy to tap.

## Words

- [ ] Confirm Length, Search, and Sort are visibly interactive fields.
- [ ] Select a word near the top of the list and confirm its definition opens
      immediately without page travel.
- [ ] Close the dialog with X, Escape, and backdrop; confirm focus returns to
      the selected word.
- [ ] Confirm Copy and web-search actions remain available.

## Calendar

- [ ] Confirm the current month appears as a seven-column Sunday-first grid.
- [ ] Confirm cells contain only the date and one minimal state.
- [ ] Move between months with the arrow controls.
- [ ] On touch, swipe horizontally to change month.
- [ ] Confirm future dates are disabled and no horizontal document scroll is
      introduced.

## Account continuity and navigation

- [ ] Open the Account menu beside Alerts and visit Profile, Stats, History,
      Marketplace, and Settings.
- [ ] Confirm Profile and Home attention load independently rather than turning
      one failed query into a whole-page failure.
- [ ] Confirm an account with no games receives stable zero/empty Stats rather
      than an indefinite skeleton.
- [ ] Confirm Leaderboards show an empty state or rows, not an avoidable
      unavailable state.
- [ ] Confirm sign out remains available from the Account menu.

## Home, Help, and supporting surfaces

- [ ] Confirm selected Home secondary copy remains readable in light and dark
      system themes.
- [ ] Confirm Help includes understandable OG and shared-board COMBAT examples.
- [ ] Confirm Marketplace, All game modes, Settings, and Help remain
      intentionally minimal; no invented filler was added.

## Release boundary

- [ ] Record any requested design or UX changes before merge consideration.
- [ ] Rotate or revoke the previously exposed Preview-scoped Blob credential.
- [ ] Do not merge, promote to Production, change the default branch, alter
      migrations, delete the branch, mutate the locked shell, or delete real
      accounts from this review.
