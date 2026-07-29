# v5.1 UX Continuity Refinement

Status: user-authorized implementation authority.

This package refines the active v5 Quiet System Shell using the user’s protected
Preview review from 2026-07-29. It does not replace the application, change game
rules, or reopen the visual direction. The five supplied screenshots are
preserved byte-for-byte under `user-feedback/`.

## Binding corrections

1. COMBAT participant and spectator guesses use one centered chronological
   board. Every accepted row identifies its actor; no player owns a separate
   left or right lane.
2. Standard-width pages must not require horizontal document scrolling. Routine
   successful persistence is silent; failed account backup becomes a bounded,
   actionable notice while the local save remains usable.
3. Word Explorer controls must read as controls. Selecting a word opens a
   focus-managed detail dialog that preserves copy and explicit web-search
   actions.
4. Calendar uses a minimal seven-column month grid with arrow and swipe month
   navigation. Day cells contain only the day and concise state.
5. The selected Home command keeps strong secondary-text contrast.
6. Account surfaces accept nullable public fields and recognized BRRRDLE
   schema-v11 private progress. New Amordle writes use a successor-owned,
   revisioned private history row and never overwrite the legacy snapshot.
7. Stats, Settings, Leaderboards, Profile, and Home attention must settle into
   data, empty, or retryable error states—never an indefinite skeleton.
8. A global Account menu sits beside Alerts. All Modes, Marketplace, Settings,
   and Help remain intentionally restrained; Help adds only code-native tile
   and turn examples.

## Non-negotiable boundaries

- Preserve 237 clauses, 107 bootstrap files, 45 migrations, three HTTP
  interfaces, route identities, persistence envelopes, RPC authority, RLS,
  Production, real users, and the locked BRRRDLE-DEV shell.
- Never surface stored answers, private account identifiers, or raw legacy
  payloads through public/player-facing projections.
- No speculative settings, marketplace inventory, or game modes.

## Evidence sources

| File | SHA-256 | Dimensions | Binding observation |
|---|---|---:|---|
| `photo-1-combat-split-board.jpg` | `bc2a40f55efb777e9a52e7c7cfbc7cd8f90f9726a58ed5e710cecd47a8ee51dd` | 679×1280 | Split COMBAT lanes are rejected. |
| `photo-2-solo-reference.jpg` | `ba6f42d5bbb40c66658d3d36b3abf4071a9f5063e375c192b07bd182458b87a4` | 677×1280 | Solo’s centered chronological board is the structural reference. |
| `photo-3-sync-overflow.jpg` | `0c1770e92c216bcce4ec88409ff385b6fc450b9576d09b47f785faff0d50d88f` | 679×1280 | Routine sync detail and horizontal status scrolling are rejected. |
| `photo-4-word-controls.jpg` | `dc6d5b8793935aad5a52540afb24e3a58f33cb413d4e672dc8e4ab3f2f845042` | 616×1280 | Explorer fields need explicit surfaces; details must not require page-bottom travel. |
| `photo-5-home-contrast.jpg` | `bb373f2a2ddb303c895029a0447c046b1c8f6bf231dd8df413b05fd6b55bbaf5` | 678×1280 | Selected-row supporting copy needs stronger contrast. |
