# Amordle Stage 2 v6.4 Solo Continuity and Experience Manual Checklist

## Automated completion

- [x] Both authorized migration hashes were preserved and applied exactly.
- [x] Linked types regenerated; all 51 local/remote migrations synchronized.
- [x] Storage MIME/size/path/ownership and feedback-value authority tests passed.
- [x] 98 domain, 17 browser, 17 fixture, 2 service, and 11 visual journeys passed.
- [x] 237/237 parity rows and 73/73 multiplayer audit rows remain proven.
- [x] 107/107 bootstrap files, 34/34 word assets, and exactly 3 HTTP interfaces passed.
- [x] Hosted cleanup completed on attempt 1 with Storage, database, and Auth residue at zero.
- [x] Production, default branch, real accounts, existing visible E2E profiles, and Vercel project settings remained unchanged.

## Owner review on protected Preview

Open <https://amordle-p2478e0c6-ryanjosephkamps-projects.vercel.app>.

### Active Solo sessions

- [ ] Start two or three Practice OG games with different settings; confirm `/play/solo` lists each separately and each resumes its own board.
- [ ] Do the same with Practice GO; confirm OG and GO never overwrite one another.
- [ ] Confirm a fourth active session in one Practice mode is blocked with a clear limit message while the other mode remains available.
- [ ] Abandon one session and confirm a new slot becomes available.
- [ ] Confirm Daily OG and Daily GO appear separately and resume the correct local date.
- [ ] Confirm Home shows the active Solo sessions and does not silently choose an ambiguous game.
- [ ] Sign out or switch accounts and confirm another identity's sessions do not appear.

### Sound and haptics

- [ ] In Settings, preview all five keyboard sound profiles and choose one.
- [ ] Type with the physical keyboard and tap the on-screen keyboard; confirm both use the selected profile.
- [ ] Turn Sound off and confirm no subsequent key cue plays.
- [ ] On a supported mobile browser, enable Touch haptics and confirm direct key taps produce one restrained vibration.
- [ ] Confirm physical-keyboard input, unsupported browsers, desktop, and Reduced effects do not vibrate.
- [ ] Reload or sign in on another context and confirm signed-in feedback preferences persist.

### Profile avatar

- [ ] Confirm an existing public HTTPS image URL still saves and renders.
- [ ] Upload a local PNG, JPEG, WebP, and animated GIF within the documented limits.
- [ ] Confirm the preview appears before save and the selected image remains crisp on mobile and desktop profile pages.
- [ ] Replace and remove an owned upload; confirm the profile fallback remains readable.
- [ ] Try an SVG, wrong-extension/magic-byte file, or file over 6 MiB and confirm it fails with an actionable message.
- [ ] Confirm avatar failures never interfere with gameplay or other profile edits.

### Mobile result review and menu frame

- [ ] Open Menu at 320–412 px and confirm both the top and bottom terminal-frame lines are visible.
- [ ] Complete Solo OG and GO on mobile; confirm the result is brought into view and normal scrolling can return to the full board/guesses.
- [ ] Repeat for Daily and a COMBAT result if available.
- [ ] Confirm active games still keep the board and complete keyboard in the accepted gameplay-first viewport.
- [ ] Confirm no horizontal document scrolling appears.

### Data freshness and regression

- [ ] Complete a signed-in Solo game, navigate normally to History, and confirm it appears without a hard refresh.
- [ ] Enter Stats, Leaderboards, Home, and Active views and confirm each loads current authoritative data on route entry.
- [ ] Confirm a second already-open browser context need not live-update, but becomes current after route re-entry, visibility recovery, or manual refresh.
- [ ] Confirm no duplicate History, XP, coin, reward, or rating settlement appears after reload/retry.
- [ ] Confirm Word Explorer, Players, public profiles, accents, Solo gameplay, and COMBAT show no regression.

## Protected boundaries

- [x] Production remains `dpl_739mtwiXc9pZPef3pxsKumwC9DfG`.
- [x] No down migration was created or applied.
- [x] No real player/Auth user or existing visible E2E profile was deleted.
- [x] No Vercel project setting, paid service, or vendor changed.
- [x] The avatar bucket was retained; only exact disposable objects were removed.
- [x] The locked BRRRDLE-DEV shell was not modified.
- [x] No merge or Production release occurred.

## Separate authorization required

- [ ] Approve any merge.
- [ ] Approve any Production release.
- [ ] Approve any future Vercel project-setting or paid-capability change.
- [ ] Authorize a forward-only repair if a database or Storage defect is later found.
