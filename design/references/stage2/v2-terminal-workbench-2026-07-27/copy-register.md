# Stage 2 Player Copy Register

This register overrides generated raster copy. Dynamic names, dates, counts,
balances, scores, and timers remain data-driven.

## Primary shell

- Home title: `Choose your next game`
- Home support: `Pick a mode and get to work.`
- Primary commands: `START SOLO`, `PLAY DAILY`, `OPEN COMBAT`
- Activity title: `RIGHT NOW`
- Desktop destinations: `HOME`, `SOLO`, `DAILY`, `COMBAT`, `DATA`
- Mobile destinations: `HOME`, `SOLO`, `DAILY`, `COMBAT`, `MORE`

## Solo

- Ready: `Ready for your guess.`
- Local save: `Saved on this device`
- Cloud save: `Saved to your account`
- GO prior-answer label: `SEED EVIDENCE`
- Submit: `SUBMIT`
- Delete: `DELETE`
- Focus exit: `EXIT FOCUS`

## Daily and economy

- Locked title: `Locked Daily`
- Locked explanation: `Unlock this date to play or view results.`
- Confirmation reassurance: `No coins are spent until you confirm.`
- Calendar action: `UNLOCK FOR 60 COINS`
- Marketplace note: `Tools are available in Solo Practice.`
- Marketplace confirmation title: `Confirm purchase`
- Marketplace action: `CONFIRM PURCHASE`

## COMBAT

- Waiting: `Waiting for another player`
- Waiting support: `Both players get the same puzzle.`
- Turn: `Your turn`
- Other turn: `Opponent’s turn`
- Recovery token: `RECONNECTING`
- Recovery message:
  `Your match is safe. Checking for the latest turn…`
- Recovery action: `TRY AGAIN`
- Spectator label: `READ ONLY`
- Result actions: `REQUEST REMATCH`, `NEW OPPONENT`, `BACK TO COMBAT`

## Auth and account

- Auth tabs: `SIGN IN`, `CREATE ACCOUNT`
- Recovery action: `SEND RECOVERY LINK`
- Guest note: `Guest games stay separate.`
- Saved settings: `Settings saved.`
- Public profile fields: Player name, Bio, Public visibility, Accent color,
  Flair.
- Settings: Sound, Reduced effects, Notifications, Default Hard Mode.

## Word Explorer and support

- Eligibility: `Answer + guess` or `Guess`
- Actions: `COPY WORD`, `SEARCH DEFINITION`
- Feedback actions: `COPY PREVIEW`, `OPEN GITHUB ISSUE`
- Feedback note: `Nothing is submitted automatically.`
- Generated dictionary definitions are non-binding; use the implemented
  definition behavior.

## Exceptional states

- Loading: use route-specific skeletons and a concise live announcement.
- Empty: explain what will appear and the next action.
- Offline: `You’re offline. Some features aren’t available.`
- Reconnecting: `Reconnecting… This may take a moment.`
- Unavailable: `This feature is unavailable right now.`
- Unauthorized: `Sign in to access this feature.`

## Forbidden ordinary-player vocabulary

Do not use `authority`, `projection`, `namespace`, `idempotent`,
`server-authoritative`, `database-owned`, `Auth ID`, `raw identifier`,
`durable reread`, `capability boundary`, or `operator diagnostics` outside
strictly necessary authorized Admin detail.

Do not simulate `$` prompts, `sudo`, filesystem paths, or typed commands for
ordinary actions.
