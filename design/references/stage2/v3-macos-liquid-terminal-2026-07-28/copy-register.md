# Stage 2 v3 Copy Register

The visual system may add prompt marks, paths, shortcuts, and compact metadata.
It may not invent player facts, backend terminology, fake commands, or
implementation-facing explanations.

## Shell

- Wordmark: `amordle`
- Primary destinations: `HOME`, `SOLO`, `DAILY`, `COMBAT`, `DATA`
- Utilities: `Sound`, `Share`, `Alerts`, `Settings`, `More`
- Connectivity: `Ready`, `Saved`, `Saving`, `Syncing`, `Offline`,
  `Reconnecting`
- Focus Mode: `Exit Focus`
- Command palette input: `Go to a page or action…`

## Home

- Heading: `Choose a game`
- Support: `Pick a mode and get to work.`
- Commands: `Start Solo`, `Play Daily`, `Open Combat`
- Activity heading: `Active sessions`
- Guest state: `Games save on this device.`
- Account action: `Sign in for cloud saves and COMBAT`

## Solo

- `OG · {length} LETTERS`
- `GO · PUZZLE {current} / {total}`
- `SEED EVIDENCE`
- `Ready for your guess`
- `Saved on this device`
- `Saved to your account`
- `Submit`
- `Delete`
- `Sound`
- `Share`
- `Focus`
- Evidence: `Correct spot`, `Present elsewhere`, `Not in word`,
  `Removed key`

## Daily and economy

- `Daily Calendar`
- `Recent 35 days`
- `All times are shown in your local date.`
- `Unlock past Daily?`
- `Unlock {date} and play the Daily puzzle.`
- `{cost} coins`
- `Cancel`
- `Unlock`
- Purchase success is shown only after persistence succeeds.

## COMBAT

- `Waiting for another player`
- `Both players get the same puzzle.`
- `You`
- `Opponent`
- `Your turn`
- `Opponent’s turn`
- `Submit`
- `Forfeit`
- `You won`
- `Match complete`
- `Request rematch`
- `Back to Combat`
- `Read only`
- `Reconnecting`
- `Your game is safe. Retrying automatically.`

Do not use `real-time` when the underlying mode is alternating-turn and
recoverable through polling.

## Account and data

- `Profile`
- `Player name`
- `Bio`
- `Public visibility`
- `Accent color`
- `Flair`
- `Save Profile`
- `Settings`
- `History`
- `Stats`
- `Leaderboards`
- `Word Explorer`
- `Length`
- `Search`
- `Definition`
- `Account summary unavailable`
- `Try again`
- `Sign in`

## Exceptional states

- Loading describes the resource, for example `Loading your history…`.
- Empty states state what is absent and the next useful action.
- Offline states say what still works.
- Unauthorized states offer sign-in or safe navigation.
- Errors say that nothing changed when persistence did not succeed.
- Recovery states say whether retry is automatic or user initiated.

## Prompt language limits

Allowed decorative syntax:

- `amordle ~ %` as a noninteractive identity line;
- `❯` as a selected command marker;
- route context such as `amordle / solo / practice / og`;
- shortcut labels such as `⌘ K`, `↵`, `Esc`.

Prohibited:

- fake shell output describing backend work;
- fabricated file paths, process IDs, logs, or command history;
- requiring players to type routes or game commands;
- words such as RPC, RLS, payload, DTO, hydration, or authority in
  player-facing copy.
