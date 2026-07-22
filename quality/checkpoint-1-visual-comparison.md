# Checkpoint 1 visual comparison ledger

Status: implementation evidence pending protected-preview recapture. Automated captures are produced by `tests/e2e/visual.shell-parity.spec.ts` at 1440 x 1024 and 390 x 844. Structural coverage is enforced at 320, 360, 390, 412, 768, 960, 1440, and 1920 pixels.

## Daily GO fixed-five launch - L03, L04

- Composition: the board remains centered in the stage between the context spine and tools rail.
- Density: the fixed five-column board preserves the compact editorial field instead of opening a seven-column Daily variant.
- Typography: the context line explicitly reports `5 letters` and the Daily GO lane.
- Hierarchy: date, scope, mode, length, difficulty, and chain position remain readable in that order.
- Interaction state: tampered `length` and `count` parameters disappear before word data or a session is created.
- Responsive behavior: the five-column board and keyboard fit without document overflow at every required width.

## GO solved hold - L03, L04, L25-L32

- Composition: solved tiles remain in their board position for the full evidence interval.
- Density: the reserved transition band replaces the former overlapping continuation panel.
- Typography: saved state and automatic next-puzzle copy are one concise in-flow status.
- Hierarchy: solved board first, transition status second; keyboard and terminal controls are absent during the hold.
- Interaction state: input is disabled for exactly 2,000 ms and reload restores only the remaining delay.
- Responsive behavior: the transition band wraps within the game stage and does not create page overflow.

## GO prior-answer evidence - L03, L04

- Composition: seeded rows sit above player-attempt rows within the same centered matrix.
- Density: each completed puzzle adds exactly one evidence row without consuming one of six player attempts.
- Typography: compact `P1`, `P2`, and later gutter labels distinguish seeded evidence from guesses.
- Hierarchy: the chain spine exposes the full prior answer while the board label marks its evidence role.
- Interaction state: prior rows contribute tile, keyboard, and Hard Mode evidence but never become editable.
- Responsive behavior: symmetric label and balance gutters keep the matrix centered on desktop and mobile.

## Keyboard evidence and sound - L03, L04, L25-L32

- Composition: three compact QWERTY rows remain directly below attempts and the reserved transition band.
- Density: keys retain practical hit targets without widening the game stage.
- Typography: uppercase key labels consume normalized lowercase domain evidence.
- Hierarchy: correct overrides present, present overrides absent, and removed is final; evidence never downgrades.
- Interaction state: letter/delete emits one click; submit emits one semantic result cue; disabled/no-op input is silent.
- Responsive behavior: keys are at least 44px high, use `touch-action: manipulation`, and fit at 320px.

## Shared COMBAT board centering - L25-L32

- Composition: every actor-attributed row has equal left and right gutters.
- Density: actor initials remain compact and do not widen individual tile rows asymmetrically.
- Typography: actor attribution stays secondary to the submitted word matrix.
- Hierarchy: the tile matrix, not the attribution chip, defines the visual center.
- Interaction state: open rows retain neutral balance gutters and never jump when an actor arrives.
- Responsive behavior: automated geometry holds each tile-row center within two pixels of the board center.

## Calendar lane chips - L09-L12

- Composition: the four Daily lanes form a stable two-column mini-ledger inside each day.
- Density: `S-OG`, `S-GO`, `C-OG`, and `C-GO` replace four unreadable micro-glyphs.
- Typography: abbreviated text is large enough to scan while full state names remain accessible.
- Hierarchy: day/date remains primary; lane and state are secondary; selected-day outline remains distinct.
- Interaction state: available, recorded, locked, and unavailable use distinct marks or borders as well as color.
- Responsive behavior: chips recompose without colliding with the day number or right-side calendar rail.

## Word Explorer search and actions - L49-L50

- Composition: search control, result metadata, list, detail, and privacy band keep their intended two-column ledger.
- Density: metadata receives deliberate breathing room without making the results list sparse.
- Typography: visible-count and selected-word metadata remain distinct from the input placeholder.
- Hierarchy: selected word and definition state lead; Copy and explicit Google fallback form one subordinate action row.
- Interaction state: both actions align to the same height and baseline with visible focus states.
- Responsive behavior: the compact action row remains cohesive, aligned, and contained at 320px.
