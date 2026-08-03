# Amordle Stage 2 v6.6 Account Controls, COMBAT GO, Stats, and Responsive Manual Checklist

## Automated completion

- [x] 121 domain, 21 browser, 20 fixture, 3 hosted service, and 13 visual journeys passed.
- [x] 237/237 parity, 73/73 multiplayer audit, and 107/107 bootstrap checks passed.
- [x] 52 migrations are synchronized: 45 immutable plus 7 authorized additive.
- [x] Exactly three application API routes remain.
- [x] Protected hosted lifecycle acceptance passed with zero database, Storage, function-test, and
      Auth residue on cleanup attempt 1.
- [x] Production, the default branch, real accounts, existing visible test profiles, word authority,
      and the locked shell remained unchanged.

## Owner review on protected Preview

Open <https://amordle-j0a0ycuc0-ryanjosephkamps-projects.vercel.app>.

### Settings and account security

- [ ] Open Settings with an older account that previously showed `Settings unavailable`; confirm
      valid preferences render and only missing properties use defaults.
- [ ] Change a harmless preference, save, revisit Settings, and confirm the normalized preference
      remains current.
- [ ] Open Change email and Change password; confirm current-password, confirmation, error, Escape,
      outside-dismissal, and focus-restoration behavior. Do not change a real email/password unless you
      intentionally want that account change.
- [ ] Confirm the Danger Zone clearly distinguishes delete Solo progress, restart competitive
      profile, and permanent account deletion, with precise retained/deleted descriptions.
- [ ] Do **not** exercise a destructive action on a real account. Automated disposable-user proof is
      complete; use a newly created disposable account only if you choose to repeat it manually.

### COMBAT GO and sound

- [ ] In a Practice GO match after puzzle 1, confirm the prior answer appears as transcript row 1,
      labeled as seed evidence, scored against the current puzzle.
- [ ] After another transition, confirm prior seed rows stay ordered before current-puzzle player
      guesses and are never attributed to either player.
- [ ] Confirm the keyboard evidence matches the visible current-puzzle transcript.
- [ ] Check participant and Live/spectator views; confirm no future answer is exposed.
- [ ] Submit invalid-length, invalid-dictionary, and Hard Mode-invalid guesses; confirm the distinct
      reject sound. Disconnect/network failures must not use that cue.
- [ ] In Settings, confirm the ordinary and Invalid guess previews are distinct and respect Sound Off
      and Reduced effects.

### Lobby and contrast

- [ ] Confirm Open public games and Private matches are unmistakably separate terminal sections.
- [ ] At wide desktop width, confirm Join uses a bounded right action rail instead of spanning the
      screen. Narrow the window and confirm it stacks under the match summary before collision.
- [ ] At 320-412 px, confirm public and private panels fit without horizontal document scrolling.
- [ ] Hover/focus/select light buttons and navigation; confirm primary and descriptive text remain
      readable across named/custom accents and light/dark modes.
- [ ] Enable forced colors and confirm focus, borders, icons, and semantic evidence remain clear.

### Responsive shell and routes

- [ ] Narrow a COMBAT match desktop window through the previously failing intermediate widths;
      confirm the long match context ellipsizes before Alerts, Account, and Menu.
- [ ] Hover/focus the truncated context and confirm the complete route label remains available.
- [ ] At 100%, 125%, 150%, 175%, and 200% zoom, review Home, Solo, Daily, COMBAT, Lobby, Active,
      Live, Profile, Settings, Stats, History, Leaderboards, Players, Marketplace, Help, and Auth.
- [ ] Confirm forms and secondary panels stack before collision, controls stay within panels, and no
      route creates horizontal document scrolling.
- [ ] Confirm the accepted mobile gameplay and menu composition is unchanged.

### Stats

- [ ] Confirm rating cards never overlap and that status, W-L-D, games, and dates remain readable on
      mobile, intermediate, and wide desktop layouts.
- [ ] Compare level progress, result composition, completed-game comparisons, attempt distribution,
      and rating comparison with the textual values on the page.
- [ ] Use keyboard focus and touch on figure details; confirm values and sample sizes are available
      without relying on hover or color.
- [ ] Confirm truthful zero/empty states for a new account and no invented trend line or time series.
- [ ] Check print, forced colors, reduced motion, light/dark themes, and 200% zoom.

### Regression

- [ ] Confirm Solo/GO/COMBAT rules, words, evidence semantics, scoring, ratings, economy, History,
      notifications, profiles, avatars, accents, haptics, sounds, definitions, and route-entry freshness
      remain correct.
- [ ] Confirm no unexpected console, page, network, accessibility, or input-latency regression.

## Protected boundaries

- [x] Production remains `dpl_739mtwiXc9pZPef3pxsKumwC9DfG`.
- [x] No real account or existing visible E2E profile was deleted.
- [x] No provider setting, paid capability, default branch, or locked shell changed.
- [x] No merge or Production release occurred.

## Separate authorization required

- [ ] Approve any merge.
- [ ] Approve any Production release.
- [ ] Approve any future migration, function, Storage-policy, provider-setting, paid-capability,
      vendor, or HTTP-interface change.
