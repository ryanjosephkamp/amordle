# v5 Fidelity Ledger

The v5 authority is code-native, so comparisons are against the binding
manifest rather than an Image Gen board. Native-size screenshots were produced
by `tests/e2e/visual.responsive.spec.ts` in the local production build. The
protected COMBAT service render remains gated by Preview credential rotation;
its chronological structure is covered locally at component level.

| Surface       |        Viewport | Comparison point      | Expected authority                                      | Render evidence                        | Result / deviation                                                                                                             |
| ------------- | --------------: | --------------------- | ------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Shell         |       1440×1024 | Chrome anatomy        | One toolbar; no faux window frame                       | `quiet-system-home-1440x1024-dark.png` | Green: one 48px toolbar; no traffic lights, titlebar, outer frame, wallpaper, or footer                                        |
| Shell         |         390×844 | Mobile navigation     | Toolbar plus route rail; no fixed footer                | `shell-home-390x844-mobile.png`        | Green: 44px toolbar plus 40px route rail; content is unobstructed                                                              |
| Solo          |         320×568 | Entry fit             | Board and full keyboard visible without document scroll | `solo-entry-320x568-portrait.png`      | Green: all six rows and all 26 keys plus Submit/Delete are native-size visible                                                 |
| Solo          |         568×320 | Landscape fit         | Board and keyboard use two-pane composition             | `solo-entry-568x320-landscape.png`     | Green: six-row board and complete keyboard fit side by side                                                                    |
| Solo          |         390×844 | Long history          | Internal history scrolling and `Latest row` recovery    | `tests/browser/components.test.tsx`    | Green: manual scroll pauses following; explicit recovery returns to the latest row                                             |
| COMBAT        |       component | Transcript            | Chronological YOU/OPPONENT rows and six-row floor       | `tests/browser/components.test.tsx`    | Green locally: ordered actor-labelled transcript and shared keyboard; protected service screenshot pending credential rotation |
| COMBAT        |         568×320 | Landscape fit         | Transcript and input remain independently usable        | CSS matrix plus component evidence     | Local structure green; protected two-account visual verification remains pending                                               |
| Calendar      |         390×844 | Density               | Horizontal date rail; selected inspector unobstructed   | `daily-economy-390x844-mobile.png`     | Green: five visible recent dates, compact inspector, and collapsed date rules                                                  |
| Calendar      |       1440×1024 | Hierarchy             | One date rail and one selected-day inspector            | `daily-economy-1440x1024-dark.png`     | Green: one horizontal rail, one action inspector, no decorative frame                                                          |
| Accessibility | 720×900 at 200% | Forced colors / focus | Opaque semantic fallbacks and visible focus             | `solo-200-percent-forced-colors.png`   | Green: no serious/critical axe findings or horizontal document overflow                                                        |

## Above-the-fold copy comparison

- Shell copy is unchanged except that redundant `amordle — play`, session, and
  footer shortcut strings were removed with their deleted chrome layers.
- Solo retains mode, length, attempt, save, status, tool, and keyboard language.
- Calendar retains the local-versus-UTC distinction but moves it into the
  `Choose another date and review date rules` disclosure.
- COMBAT retains all player-facing match, turn, wait, score, result, and
  recovery language. `YOU` and `OPPONENT` now label rows in chronological order.

## Intentional deviations

- There is no v5 concept image. The user requested a focused correction inside
  the existing typography and palette, and the approved plan explicitly chose
  code-native iteration without Image Gen.
- Protected COMBAT screenshots, real disposable accounts, hosted Preview
  acceptance, and cleanup receipts are deferred until the exposed
  Preview-scoped credential is rotated or revoked. No service contract changed.
