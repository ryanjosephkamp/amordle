# Amordle Stage 2 v5.2 visual comparison ledger

## Scope

This ledger maps the five user-annotated screenshots supplied on 2026-07-29 to
the implemented candidate at
`https://amordle-a9w7pjo4g-ryanjosephkamps-projects.vercel.app`.

Application commit: `bdc492fc2edbe7ceb367529166cd472f5aaff1d3`

## Comparisons

| User evidence                             | Required correction                                                            | Implemented comparison                                                                               | Objective result                                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Desktop Solo at 100% zoom                 | Increase the board without widening the keyboard or changing mobile negatively | Standard 5-letter desktop cells use a viewport-constrained 58–72px scale and share the keyboard axis | Direct 1440×1024 inspection measured 71.7px square cells; board centered; document 1440/1440 wide and 1024/1024 high                |
| Mobile Solo                               | Modestly enlarge rows while retaining the full initial board and keyboard      | 2–7 letter games use a height-aware 46–54px target with low-height reduction before keyboard loss    | Direct 390×844 inspection showed six rows and all keyboard actions; keyboard bottom 838.4px; document 390/390 wide and 844/844 high |
| Ruled-out `L` remains visually ambiguous  | Distinguish absent from untouched and validate all evidence precedence         | Absent keys use stronger fill, `×`, text, and ARIA evidence; removed is a separate overlay           | Domain and browser coverage includes duplicates, stronger later evidence, absent, and removed precedence                            |
| Auth fields disappear into the background | Apply the Word Explorer-style field surface globally                           | Shared field tokens cover text-like inputs, textarea, select, and combobox controls                  | Direct 390×844 Auth inspection measured 44px fields with distinct inset background/border; no horizontal overflow                   |
| COMBAT board is left-biased               | Center the chronological transcript and keyboard on one axis                   | Match canvas constrains and centers actor-labelled rows and controls                                 | Hosted participant, result/rematch, and spectator captures use one centered chronological board; split columns remain absent        |

## Additional continuity comparisons

| Surface        | Before                                                      | Candidate result                                                                                                                 |
| -------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Lobby          | Public Practice rows could be absent from discovery         | Tolerant public Practice/Daily projection with safe join/cancel states and separate private requests                             |
| Profile accent | Native color value did not match the named backend contract | Six named accessible radio swatches save and reload from the successful response                                                 |
| History        | Signed-in Solo completions could remain absent              | Account outbox projects pending/remote completion exactly once; hosted Solo reload kept one row                                  |
| Stats          | Minimal, stale, or indefinitely loading                     | Truthful zero state plus progression, results, breakdowns, attempts, ratings, activity, provenance, and partial-failure recovery |
| Alerts         | Popover mechanics worked but durable events were absent     | Request, match, turn, result, and rematch projections with deterministic revisions and read state                                |

## Hosted evidence inventory

Final run:
`.codex-internal/evidence/e2e_20260729T202419108Z_bdc492fc_b45c3146`

- `account-history-mobile-light.png`
- `account-leaderboard-mobile-dark.png`
- `account-profile-desktop-light.png`
- `account-settings-desktop-dark.png`
- `account-stats-mobile-light.png`
- `combat-active-mobile-dark.png`
- `combat-result-rematch-desktop-light.png`
- `combat-spectator-desktop-light.png`
- `combat-waiting-desktop-light.png`
- `participant-refresh-recovery.png`
- `sanitized-spectator.png`

The evidence directory is intentionally ignored local custody because it
contains run-scoped identifiers. The committed report records bounded results,
not private identifiers or credentials.

## Acceptance

- Coherence: pass
- Hierarchy and density: pass
- Board/keyboard centering: pass
- Mobile initial-play containment: pass
- Extended-board internal scrolling: pass
- Field affordance and focus: pass
- Evidence-state clarity: pass
- Light/dark, forced-colors, reduced-motion: pass
- No horizontal document overflow at required widths and 200% zoom: pass
- Leaderboards regression-only boundary: pass

No intentional deviation from the five annotated corrections remains.
