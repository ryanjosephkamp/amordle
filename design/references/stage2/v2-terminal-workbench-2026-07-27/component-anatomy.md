# Terminal Workbench Component Anatomy

## Frame

- `WorkbenchFrame`: command bar, context rail, main workspace, optional
  contextual status/action rail.
- Desktop command destinations: `HOME`, `SOLO`, `DAILY`, `COMBAT`, `DATA`.
- Mobile destinations: `HOME`, `SOLO`, `DAILY`, `COMBAT`, `MORE`.
- Focus Mode removes global navigation but retains game status, alerts where
  required, sound, and `EXIT FOCUS`.

## Work regions

- Use titled rules and open regions rather than floating cards.
- A region has one dominant purpose, optional trailing status, content, and an
  optional bottom action/status rail.
- Desktop may use two principal columns. Mobile stacks regions in reading and
  action order.
- Corners are 0–4px. Full pills are limited to compact status tokens.

## Commands and controls

- Buttons use text-first primary, secondary, quiet, and danger variants.
- Fields always have a visible label, stable help/error line, and visible
  focus.
- Dialogs are reserved for consequential confirmation and restore focus on
  close.
- Menus close on Escape and outside interaction and remain inside the
  viewport.
- Tabs use underline plus contrast/inversion; selection never relies on color
  alone.
- Mobile targets are at least 44×44 CSS pixels.

## Status

- Status is human-readable first; an optional compact token may supplement it.
- Persistence is reported only after success.
- Loading uses skeleton rows matching the final structure.
- Empty, offline, reconnecting, unavailable, unauthorized, and error states
  explain what happened and the next valid action.

## Game workspace

- Top rail: mode, word length, difficulty, puzzle progress, attempts/moves,
  Hard Mode, turn, timer, save/connection state.
- Board: aligned low-radius cells in a controlled region.
- Evidence:
  - correct: `✓` plus double lower rule;
  - present: `~` plus dashed lower rule;
  - absent: `×` plus neutral solid rule;
  - removed key: strike plus textual legend.
- GO seeded rows are labeled `SEED EVIDENCE`.
- Keyboard keys are at least 44px high on touch layouts and share the physical
  input reducer.
- Bottom action rail: primary game action, delete, sound, share, Focus, and
  route-valid secondary actions.

## COMBAT

- Desktop uses symmetrical `YOU` and `OPPONENT` panes with shared turn/clock
  status.
- Mobile keeps opponent evidence visible above the dominant playable board.
- Waiting and recovery are work-region states, not marketing cards.
- Results combine outcome, score, settlement/reward facts, rematch, and next
  navigation.
- Spectation is labeled `READ ONLY`, puts boards first, and renders no mutation
  controls.

## Data surfaces

- Tables use stable columns, tabular numerals, controlled overflow, and sticky
  headers when useful.
- Mobile data becomes ruled key/value rows without changing the underlying
  data.
- Statistics may be derived only from current authoritative responses or
  History.
- Calendar uses a month grid and selected-date inspector on desktop and a
  chronological date inspector on mobile.

## Icon treatment

- Text labels remain primary.
- Use small, consistent line icons only for universally familiar actions such
  as sound, alerts, share, calendar, search, or visibility.
- Every icon-only control has an accessible name.
- Generated raster icons are illustrative and are never shipped.
