# Amordle Stage 2 v6.5.1 Menu Layering Manual Checklist

## Automated completion

- [x] The regression test failed before the stacking repair and passes after it.
- [x] Menu hit testing proves it is topmost where it intersects the game status row at 390×844 and 1440×900.
- [x] 109 domain, 20 browser/component, 20 fixture, 2 service, and 11 visual journeys passed.
- [x] 237/237 parity, 73/73 multiplayer audit, 107/107 bootstrap, 51 synchronized migrations, and exactly 3 HTTP interfaces passed.
- [x] Hosted cleanup completed on attempt 1 with zero database, Storage, and Auth residue.

## Owner review

Open <https://amordle-77f8b403z-ryanjosephkamps-projects.vercel.app>.

- [ ] On a mobile game, open Menu and confirm its frame, heading, and every destination render above the game title/status row.
- [ ] On a desktop game, repeat the check and confirm no header cell or sticky content paints over the Menu.
- [ ] Scroll a terminal Solo GO result, then open Menu; confirm definitions and result content remain behind it.
- [ ] Open Alerts and Account; confirm those popovers also remain above ordinary page and game content.
- [ ] Confirm modal dialogs still render above the global chrome and Menu.
- [ ] Confirm Escape, outside dismissal, focus restoration, touch targets, and keyboard navigation are unchanged.
- [ ] Confirm Menu framing and content remain contained without horizontal scrolling at 320, 360, 390, and 412 px.
- [ ] Confirm Solo, Daily, COMBAT, Help, Profile, Stats, Players, Word Explorer, sounds, haptics, and game tools otherwise remain unchanged.

## Protected boundaries

- [x] Production remains `dpl_739mtwiXc9pZPef3pxsKumwC9DfG`.
- [x] No database, Storage, provider-setting, dependency, HTTP-interface, or game-authority change occurred.
- [x] No real account or existing visible E2E profile was removed.
- [x] No merge or Production release occurred.

## Separate authorization required

- [ ] Approve any merge.
- [ ] Approve any Production release.
