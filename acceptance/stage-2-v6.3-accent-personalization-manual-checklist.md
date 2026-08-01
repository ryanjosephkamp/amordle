# Amordle Stage 2 v6.3 Accent Personalization Manual Checklist

## Automated completion

- [x] Authorized migration hash preserved and applied as `20260801193000`.
- [x] Linked types regenerated; all 49 local/remote migrations synchronized.
- [x] Owner-only RPC, forced-RLS, grant, preset-cap, name-uniqueness, public-sanitization, v1-compatibility, and cascade-cleanup tests passed.
- [x] 83 domain, 16 browser, 15 fixture, 2 service, and 11 visual journeys passed.
- [x] 237/237 parity rows and 73/73 multiplayer audit rows remain acceptance-proven.
- [x] 107/107 bootstrap files, 34/34 word assets, and exactly 3 HTTP interfaces passed.
- [x] Hosted cleanup completed on attempt 1 with 25 preset rows and all disposable database/Auth resources at zero residue.
- [x] Production, default branch, real accounts, existing visible E2E profiles, and Vercel project settings remained unchanged.

## Owner review on protected Preview

Open <https://amordle-p04gk2mv2-ryanjosephkamps-projects.vercel.app>.

### Profile and custom presets

- [ ] Confirm Aurora is the default in a signed-out/fresh context.
- [ ] Confirm all six named accents visibly change prompt/focus, alert count, and unknown keyboard keys.
- [ ] Confirm correct, present, absent, and removed evidence colors never change with the accent.
- [ ] Open “Custom color”; inspect the live alert/key/evidence sample and keyboard-only focus order.
- [ ] Create a named hex preset, choose “Save and use,” reload, and confirm it remains selected.
- [ ] Rename and recolor the preset, then confirm the Profile and game surfaces update.
- [ ] Create a very dark and a very light sample and confirm alert/key text remains readable.
- [ ] Delete the active custom preset and confirm the selection falls back to Aurora.
- [ ] Confirm the Public/Private disclosure appears below Flair and reads clearly on mobile/desktop.

### Gameplay stability and layout

- [ ] In Solo, type and delete repeatedly; confirm the board and keyboard do not jump.
- [ ] If account backup is unavailable, use Retry and confirm the fixed status rail does not move gameplay.
- [ ] At desktop width, confirm Solo and COMBAT are centered with balanced left/right space.
- [ ] On mobile, confirm COMBAT remains in the approved centered chronological composition.
- [ ] At a small phone height, confirm all six initial rows and the complete keyboard are visible.

### Stats and regression

- [ ] Inspect Stats at 320–412 px and confirm “provisional”/“established” do not clip, spill, or wrap by character.
- [ ] Confirm there is no horizontal document scrolling.
- [ ] Confirm Word Explorer definitions and layout remain unchanged.
- [ ] Confirm Players, Leaderboards, History, alerts, public profiles, Solo, and COMBAT show no regression.

## Protected boundaries

- [x] Production remains `dpl_739mtwiXc9pZPef3pxsKumwC9DfG`.
- [x] No down migration was created or applied.
- [x] No real player/Auth user was deleted.
- [x] No Vercel project setting or paid service changed.
- [x] The old Blob store and locked BRRRDLE-DEV shell were not modified.
- [x] No merge or Production release occurred.

## Separate authorization required

- [ ] Approve any merge.
- [ ] Approve any Production release.
- [ ] Approve any future Vercel project-setting change.
- [ ] Authorize a forward-only repair if a database defect is later found.
