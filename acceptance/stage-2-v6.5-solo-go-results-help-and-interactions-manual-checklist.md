# Amordle Stage 2 v6.5 Solo GO Results, Help, and Interactions Manual Checklist

## Automated completion

- [x] 109 domain, 20 browser, 19 fixture, 2 service, and 11 visual journeys passed.
- [x] 237/237 parity rows and 73/73 multiplayer audit rows remain proven.
- [x] 107/107 bootstrap files, 51 synchronized migrations, 34/34 word assets, and exactly 3 HTTP interfaces passed.
- [x] Future Solo GO answers were excluded from definition requests, query keys, rendered/accessibility content, sharing, and logs.
- [x] Haptic eligibility, exclusions, and one-pulse deduplication passed.
- [x] Hosted cleanup completed on attempt 1 with Storage, database, and Auth residue at zero.
- [x] Production, default branch, real accounts, existing visible E2E profiles, migrations, Storage, and Vercel settings remained unchanged.

## Owner review on protected Preview

Open <https://amordle-h4q2k6xo0-ryanjosephkamps-projects.vercel.app>.

### Solo GO encountered review

- [ ] Win a five-puzzle Solo Practice GO chain and confirm puzzles 1–5 appear in order with each word, definition, Copy Word, and Search Web.
- [ ] Lose a Solo Practice GO chain after revealing the reached answer; confirm only reached puzzles appear and no future word is disclosed.
- [ ] Complete or lose a Solo Daily GO chain; confirm the review stops exactly at the reached puzzle.
- [ ] Confirm missing/offline definitions fail gracefully without removing the encountered word or actions.
- [ ] Confirm View Board, normal result scrolling, Copy Result, and Play Again still work.
- [ ] Confirm Solo OG and COMBAT results are unchanged.

### Profile and Account

- [ ] Confirm avatar technical guidance is hidden initially and opens from `Profile image help` by touch, mouse, and keyboard.
- [ ] Confirm Escape and outside interaction dismiss it, focus returns correctly, and the popover fits at 320–412 px without horizontal scrolling.
- [ ] Confirm URL validation/upload errors remain visible independently of the help popover.
- [ ] Open Account and confirm exact order and capitalization: View Profile, Open Settings, Sign Out.
- [ ] Choose Open Settings; confirm the popover closes and Settings loads. Confirm Profile and Settings remain in the general Menu.

### Haptics

- [ ] On a supported touch device with haptics enabled, tap navigation, menu, Account, dialog, game, result, and button-styled-link controls; confirm one restrained pulse per activation.
- [ ] Confirm the on-screen keyboard also pulses exactly once rather than twice.
- [ ] Confirm disabled controls, ordinary prose links, mouse activation, physical-keyboard activation, and Reduced effects do not vibrate.
- [ ] Confirm haptics disabled and unsupported browsers remain silent without errors.
- [ ] Confirm keyboard sounds still use the selected profile and are unaffected by haptic changes.

### Help and Focus Mode

- [ ] Review GO, Practice/Daily, Hard Mode, Coins/Tools, Access/Navigation, and Privacy aids in light and dark themes.
- [ ] Confirm Hard Mode visually teaches fixed greens, proven-positive multiplicity, known-absent letters, and no invented yellow-position ban.
- [ ] Confirm coin prices and tool availability match the live game and do not imply free use.
- [ ] At 320–412 px and 200% zoom, confirm aids fit without horizontal document overflow.
- [ ] Enable reduced motion and forced colors; confirm every aid remains understandable without motion or color alone.
- [ ] Confirm `Mouse-free mode — for keyboard diehards` is collapsed initially and keyboard-operable.
- [ ] From a game, open More and enter Focus Mode. Confirm the same game remains, surrounding chrome is reduced, Exit Focus Mode is always available, and Back/query parameters behave normally.

### Solo game tools

- [ ] Toggle Sound On/Off; confirm the label switches immediately and never disappears.
- [ ] Use Reveal Letter and Remove Letters; confirm each control remains in place while pending and inventory/counts update after success.
- [ ] If inventory permits, use each tool repeatedly without typing a keyboard letter between uses.
- [ ] Try rapid duplicate taps and a recoverable failure; confirm no duplicate charge/revision and retry remains safe.
- [ ] Confirm pending, success, no-op, unavailable, and failure feedback is visible/announced while Evidence and game tools stays open.
- [ ] Confirm the board and keyboard do not shift when tool state changes.

### Regression

- [ ] Confirm multiple active Solo sessions, route-entry freshness, terminal mobile scrolling, sounds, avatar upload, accents, Stats, Players, Word Explorer, and COMBAT remain correct.
- [ ] Confirm no horizontal document overflow at supported mobile and desktop widths.
- [ ] Confirm no unexpected console, page, network, accessibility, or input-latency regression.

## Protected boundaries

- [x] Production remains `dpl_739mtwiXc9pZPef3pxsKumwC9DfG`.
- [x] No migration, Storage authority, provider setting, dependency, or HTTP interface changed.
- [x] No real player/Auth user or existing visible E2E profile was deleted.
- [x] The locked BRRRDLE-DEV shell was not modified.
- [x] No merge or Production release occurred.

## Separate authorization required

- [ ] Approve any merge.
- [ ] Approve any Production release.
- [ ] Approve any future migration, Storage-policy, provider-setting, paid-capability, vendor, or HTTP-interface change.
