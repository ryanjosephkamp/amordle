# Amordle Stage 2 v5.3 fidelity ledger

## Scope

This ledger maps the four user-annotated screenshots and associated v5.3
requirements supplied on 2026-07-29 to the protected candidate at
`https://amordle-1bj4496rq-ryanjosephkamps-projects.vercel.app`.

Application commit: `31be382e50fa451a9a8a961780f317f9555ed408`

## User-annotation comparisons

| User evidence                                            | Required correction                                                                                   | Implemented comparison                                                                                                        | Objective result                                                                                                                                                                                         |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Untouched and ruled-out keyboard states feel reversed    | Make unguessed keys neither white-on-black nor black-on-white; move white-on-black plus `×` to absent | Blue-gray unknown field tokens and near-black absent tokens apply to board/keyboard actions without changing keyboard anatomy | Component test checks neutral actions; browser contrast test requires 4.5:1 and different surfaces; hosted participant capture shows blue-gray unknown, near-black `×`, amber present, and green correct |
| `YOUR TURN` is partly hidden on mobile                   | Isolate match detail and turn state without overlay or clipping                                       | Mobile status uses independent minmax/max-content grid cells; very narrow layouts stack                                       | Hosted 390×844 capture shows complete `OPPONENT'S TURN`; service geometry assertion proves turn state stays within its facts container                                                                   |
| Row number and actor overlap; headings do not align      | Separate row, divider, actor, and guess columns                                                       | Transcript metadata is a three-column grid with a literal `·` separator and blank placeholders                                | Hosted 1440×1024 capture shows aligned `ROW · PLAYER GUESS`, `01 · YOU`, and `02 · RIVAL`                                                                                                                |
| COMBAT keyboard does not reflect either player's guesses | Derive both keyboards from the true shared current board; reset for GO puzzle transitions             | Shared current-puzzle evidence selector includes accepted moves and rescored seeds with removed overlay                       | Domain test covers puzzle filtering/seeds; hosted two-context test asserts matching correct/present/absent keys; participant capture confirms the result                                                 |

## Additional interaction comparisons

| Requirement             | Before                                                                | Candidate result                                                                           |
| ----------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Sync feedback stability | Routine save/sync text entered and left the header, shifting gameplay | Routine progress is silent; only actionable backup failure uses reserved game notice space |
| Account quick menu      | Account duplicated general destinations                               | Account contains identity, Level, XP, Coins, View profile, and Sign out only               |
| Direct shell shortcuts  | Bracket hints were primarily visual                                   | Shift+1–5 and Shift+M are active, announced, input-safe, and tested                        |
| Gameplay input          | A global M shortcut could compete with letter entry                   | Shift+M is reserved; plain M still reaches the physical game controller                    |
| Documentation           | Keyboard behavior was scattered                                       | Registry-driven Help plus maintained Markdown and responsive HTML manuals                  |

## Evidence inventory

| Asset                                      | Viewport  | Binding review role                            |
| ------------------------------------------ | --------- | ---------------------------------------------- |
| `account-profile-desktop-light.png`        | 1440×1024 | Account/profile regression                     |
| `combat-mobile-turn-status-dark.png`       | 390×844   | Complete turn status and mobile transcript     |
| `combat-result-rematch-desktop-light.png`  | 1440×1024 | Terminal/result/rematch regression             |
| `combat-shared-evidence-desktop-light.png` | 1440×1024 | Shared keyboard evidence and actor alignment   |
| `solo-200-percent-forced-colors.png`       | 720×1800  | Forced colors and 200% reflow                  |
| `solo-320x568-portrait.png`                | 320×568   | Minimum supported initial-game containment     |
| `solo-390x844-light.png`                   | 390×844   | Unknown-key surface and standard mobile layout |

Exact hashes and dimensions are recorded in
`design/references/stage2/v5.3-input-semantics-keyboard-navigation-2026-07-29/manifest.json`.

## Cross-surface comparison matrix

At least five candidate-to-browser comparisons remain available for each major
surface through the automated 1440 light, 1440 dark, 390 mobile, 320 stress,
and 200% forced-colors variants:

- Shell/Home
- Solo
- Daily/economy
- COMBAT
- Account/data
- Words/support
- Exceptional states

The hosted visual run also checked all standard routes at 320, 360, 390, 412,
768, 960, 1440, and 1920 widths for horizontal document overflow. Native-size
inspection covered the seven committed v5.3 captures. Above-the-fold copy was
compared against the annotations: `YOUR TURN`, `ROW · PLAYER GUESS`, semantic
key labels, and the absence of routine sync copy all match the intended
corrections.

## Professional acceptance

- Coherence: pass
- Hierarchy and density: pass
- Keyboard semantic clarity: pass
- COMBAT actor and header alignment: pass
- Shared current-puzzle evidence: pass
- Stable gameplay geometry: pass
- Account quick-tool restraint: pass
- Keyboard-only navigation: pass
- Mobile initial-play containment: pass
- Light/dark, forced-colors, reduced-motion: pass
- Copy quality and terminal/TUI authenticity: pass

No intentional deviation from the authorized v5.3 corrections remains.
