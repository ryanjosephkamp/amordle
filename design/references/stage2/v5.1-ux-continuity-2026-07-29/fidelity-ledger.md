# Stage 2 v5.1 fidelity ledger

This ledger compares the implemented browser surfaces with the binding v5.1
user-feedback manifest. All screenshots are code-native renders from exact
application commit `098bdb5ef2335fff86d04a89acdbd122414246fb`.

The `browser-evidence/fidelity/` directory contains 35 native-size comparisons:
five variants for each of seven major surface groups. The variants are
1440×1024 light, 1440×1024 dark, 390×844 mobile, 320×844 stress, and 200%
zoom with forced colors. The `browser-evidence/services/` directory contains
the protected-Preview account and COMBAT state captures from the final
disposable-user run.

| Surface group      | Comparisons | Binding v5.1 correction                                                                                    | Result                                                                                                                                         |
| ------------------ | ----------: | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell and Home     |           5 | Preserve the approved shell; improve selected-row secondary-copy contrast and add universal account access | Green: selected copy inherits the selected foreground; Account menu exposes Profile, Stats, History, Marketplace, Settings, and session action |
| Solo               |           5 | Remove routine sync telemetry and prevent avoidable horizontal or initial gameplay scrolling               | Green: successful persistence is silent; recoverable failure is bounded and retryable; board and keyboard stay contained                       |
| COMBAT             |           5 | Replace split player lanes with one chronological, centered, actor-labelled board                          | Green: waiting, active, result, rematch, and spectation share the same row geometry; current turn remains explicit                             |
| Daily and economy  |           5 | Replace the dense date rail with a minimal month calendar                                                  | Green: Sunday-first month grid, previous/next buttons, swipe navigation, minimal day states, no document overflow                              |
| Account and data   |           5 | Recover existing account data instead of indefinite or all-or-nothing failure                              | Green: native plus schema 1–11 continuity, partial Home attention, retryable Stats/Settings, corrected leaderboard buckets                     |
| Words and support  |           5 | Make fields legible and show definitions immediately without page travel                                   | Green: visible field surfaces, focus-managed definition dialog, retained copy/search actions, improved Help examples                           |
| Exceptional states |           5 | Keep loading, offline, unavailable, recovery, and forced-color states usable                               | Green: explicit bounded recovery, opaque forced-color fallbacks, no serious/critical axe findings                                              |

## Protected service-state comparisons

The final hosted run captured and verified:

1. Profile, Settings, History, Stats, and Leaderboard account surfaces.
2. COMBAT waiting and active states.
3. One chronological shared result/rematch transcript.
4. Privacy-safe read-only spectation.
5. Participant refresh recovery.

The run also seeded a disposable schema-v11 account snapshot, proved that
Stats and History remained readable, completed a signed-in Solo game, created
the successor account-state row, and confirmed that the legacy source snapshot
was byte-for-byte unchanged.

## Above-the-fold copy comparison

- Home retains the approved command hierarchy; selected supporting copy is now
  readable against the light selection surface.
- Solo no longer exposes routine `local save ok` or `cloud retry needed`
  implementation telemetry. A real backup failure uses the player-facing
  message `Saved on this device. Account backup needs attention.` with Retry.
- COMBAT keeps match and turn language but moves every accepted guess into one
  ordered board with a compact player label.
- Calendar day cells contain only the date and one short state such as Today,
  Locked, Played, or Future.
- Word Explorer keeps Length, Search, Sort, Apply, Copy, and web-search
  functionality while moving selected-word detail into an immediate dialog.

## Intentional deviations

- The user allowed horizontal month switching, but the final implementation
  uses a non-overflowing seven-column calendar with both swipe and arrow
  navigation; the document itself never scrolls horizontally.
- Successful account backup is silent. Only active saving, active syncing, or
  a recoverable failure is announced.
- No new settings were invented. The existing contract-backed settings remain
  intentionally minimal.
- Help wording is preserved for the later user-authored editorial pass; this
  revision adds only code-native visual examples.

## Objective acceptance

- Coherence, hierarchy, density, spacing, typography, interaction completeness,
  responsive translation, copy quality, accessibility, and terminal/TUI
  authenticity were reviewed across all 35 fidelity renders.
- All seven groups meet the v5.1 authority without scaffolding, generic SaaS
  card grids, accidental horizontal scrolling, or fake-terminal theatrics.
- Hosted mobile vitals: LCP 304 ms, INP 40 ms, CLS 0.
- No serious or critical axe findings and no unexpected console, page, or
  network failures occurred in the final hosted suite.
