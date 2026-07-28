# Stage 2 v2 Fidelity Ledger

Status: pending implementation. The approved concepts, if approved, become the
comparison baseline.

Each major surface requires at least five comparisons:

1. 1440×1024 light
2. 1440×1024 dark
3. 390×844 mobile
4. 320px or 360px stress viewport
5. 200% zoom, forced colors, or reduced motion

| Surface                   | Concept                                                               | Required states                                                  | Status  |
| ------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------- | ------- |
| Shell and Home            | `approval-board-home-solo.png`                                        | chrome, activity, menus, light/dark                              | pending |
| Solo                      | `approval-board-home-solo.png`                                        | OG, GO, seed, result, Focus                                      | pending |
| Daily and economy         | `approval-board-data-account.png`, `approval-board-mobile-states.png` | Calendar, locked, confirm, Marketplace                           | pending |
| COMBAT                    | `approval-board-combat.png`                                           | waiting, active, recovery, result, alerts, spectator             | pending |
| Account and data          | `approval-board-data-account.png`                                     | Profile, Settings, Stats, History, Leaderboard                   | pending |
| Word Explorer and support | `approval-board-mobile-states.png`                                    | Words, Help, Feedback, Admin                                     | pending |
| Exceptional states        | `approval-board-mobile-states.png`                                    | loading, empty, offline, reconnecting, unavailable, unauthorized | pending |

Every implementation entry must record screenshot path, viewport, browser,
theme, native-size inspection, above-the-fold copy diff, scores for the ten
professional criteria, and any intentional deviation with contract rationale.
