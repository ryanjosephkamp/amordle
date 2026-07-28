# Stage 2 v2 Image Generation Prompts

Tool: OpenAI built-in Image Gen
Use case: `ui-mockup`
Generated: 2026-07-27
Purpose: visual-direction references only; no generated bitmap is shipped.

## Exploration — Quiet Workbench

```text
Use case: ui-mockup
Asset type: Amordle Stage 2 exploratory direction board, landscape product UI reference
Primary request: Create a polished browser word-game interface direction called “Quiet Workbench”. It must feel unmistakably derived from a professional terminal/TUI workbench while remaining immediately understandable to ordinary word-game players.
Scene/backdrop: A coordinated landscape presentation board showing four frames: desktop Home, desktop Solo OG active game, mobile Home, mobile Solo GO active game.
Style/medium: High-fidelity product UI design mockup, crisp code-native interface, precise one-pixel rules, compact work regions, no illustration.
Composition/framing: 16:10 landscape board. Large desktop frames on top, two 390x844 mobile frames below. Workbench structure uses a compact command bar, path/context rail, titled ruled regions, command/action rail, persistent status line, and aligned character-grid data. Active game is dominant.
Typography: Geist Mono-like interface type for navigation, headings, status, tiles, tables and shortcuts; clean sans-serif only for longer explanatory prose. Fixed compact scale, highly legible.
Color palette: Equal-quality system light and dark examples. Cool near-white workstation surface and charcoal-blue dark surface. Sky-teal accent under 10 percent. Semantic green correct, amber present, cool slate absent, muted red removed. No pure black or green-on-black monoculture.
Required desktop Home content: brand “amordle”; navigation HOME, SOLO, DAILY, COMBAT, DATA; compact route line “amordle / home”; main heading “Choose your next game”; commands “START SOLO”, “PLAY DAILY”, “OPEN COMBAT”; a ruled “RIGHT NOW” region with one active match row labeled “Your turn”; compact status with level, XP, coins.
Required desktop Solo content: route “amordle / solo / practice / og”; status “OG · 5 LETTERS · STANDARD”; one-puzzle OG board with six rows; current draft row; evidence-aware keyboard; commands “SUBMIT”, “DELETE”, “SOUND ON”, “SHARE”, “FOCUS”; human status “Ready for your guess”.
Required mobile Home content: compact top context rail; clear next action; ruled activity region; bottom navigation HOME, SOLO, DAILY, COMBAT, MORE; 44px targets.
Required mobile Solo GO content: “GO · PUZZLE 3/5”; one labeled SEED evidence row distinct from guesses; board, compact status, keyboard, and bottom action rail all visible without horizontal document overflow.
Game evidence: correct tiles include a visible check mark and double lower rule, present tiles include a tilde and dashed lower rule, absent tiles include an x and neutral rule; color is not the only cue.
Emotional target: calm precision, tactical focus, purposeful density, approachable confidence.
Constraints: Browser product, not a literal terminal emulator. Use familiar buttons, links, menus, forms and game controls. Keep text labels plain-language. No fake shell commands or dollar prompts. No generic card grid, marketing hero, decorative dashboard metrics, glassmorphism, gradients, wide shadows, oversized rounded corners, pills everywhere, terminal traffic lights, scanlines, code rain, neon glow, cyberpunk, fire/ice, texture, theatrical 3D, or ornamental ASCII. OG must show exactly one puzzle. GO must show exactly five puzzles. No payment language. No private IDs, hidden answers, credentials, or implementation terminology.
Avoid: malformed text, illegible tiny labels, clipped controls, excessive empty space, copied product trade dress, watermarks.
```

## Exploration — Dense Match Console

```text
Use case: ui-mockup
Asset type: Amordle Stage 2 exploratory direction board, landscape product UI reference
Primary request: Create a second polished browser word-game direction called “Dense Match Console”. It must be a professional terminal/TUI workbench optimized for COMBAT, data density, and rapid scanning, while remaining understandable to general word-game players.
Scene/backdrop: Coordinated landscape board with desktop COMBAT active match, desktop COMBAT waiting state, mobile active match, desktop History plus Leaderboard, and a small read-only spectator state.
Style/medium: High-fidelity product UI mockup, crisp code-native browser interface, compact split panes, strong alignment, one-pixel rules, no illustration.
Composition/framing: 16:10 landscape design board. Use a compact top command bar HOME, SOLO, DAILY, COMBAT, DATA; route context rail; dense but breathable titled work regions; shared status line and action rail. Active match is the visual priority.
Typography: Geist Mono-like interface typography for headings, status, tables, board, timer, shortcuts and commands; clean sans-serif for explanations only. Fixed compact scale, tabular numerals.
Color palette: Dark charcoal-blue main console plus one light data example. Sky-teal accent under 10 percent. Semantic green correct, amber present, slate absent, muted red danger. High contrast without neon.
Desktop active match content: “COMBAT · PUBLIC PRACTICE”; “YOUR TURN”; timer “00:42”; two symmetrical player panes labeled YOU and OPPONENT; each has a five-letter board; shared evidence-aware keyboard; status line “Move 5 · Puzzle 1/1 · Saved”; actions “SUBMIT”, “DELETE”, “FORFEIT”. Use exactly one OG puzzle, not three.
Waiting content: “WAITING FOR ANOTHER PLAYER”; status token WAITING; settings “OG · 5 LETTERS · STANDARD”; plain-language notes “Unranked game” and “Both players get the same puzzle”; actions “CANCEL MATCH” and “HOW COMBAT WORKS”.
Mobile active match: top turn/timer rail, compact opponent board visible above playable board, full 44px keyboard, status and actions reachable, bottom navigation; no horizontal overflow.
History and Leaderboard: ruled data tables with stable columns, selected row, filters in a command rail, no metric cards. Player-facing copy only.
Spectator: prominent “READ ONLY”; two boards first; no submit/delete/forfeit controls; status “LIVE”.
Evidence: correct tiles use check plus double lower rule; present uses tilde plus dashed lower rule; absent uses x plus neutral rule, so color is not the only cue.
Emotional target: tactical, dependable, information-rich, calm under pressure.
Constraints: Browser application, not literal CLI. Familiar controls and plain-language labels. No fake commands, dollar prompts, terminal traffic lights, scanlines, code rain, neon glow, cyberpunk, fire/ice, glassmorphism, gradients, wide shadows, generic card grids, dashboard metric tiles, huge headings, oversized rounded corners, decorative ASCII, textures, theatrical 3D, or payment language. No private IDs, answers, credentials or implementation terminology.
Avoid: malformed text, cramped unreadable data, clipped mobile controls, excessive ornament, copied trade dress, watermarks.
```

## Exploration — Inline Command Desk

```text
Use case: ui-mockup
Asset type: Amordle Stage 2 exploratory direction board, landscape product UI reference
Primary request: Create a third polished browser word-game direction called “Inline Command Desk”. It should be a light, text-forward terminal/TUI workbench that feels professional and approachable, with fewer enclosing boxes than the other directions.
Scene/backdrop: Coordinated landscape board showing desktop Calendar with date inspector and purchase confirmation, desktop Profile plus Settings, desktop Stats plus History, and mobile Word Explorer.
Style/medium: High-fidelity code-native product UI mockup. Open ruled regions, terminal-like alignment, compact command lines, understated selection and focus. No illustration.
Composition/framing: 16:10 landscape reference board. Compact navigation HOME, SOLO, DAILY, COMBAT, DATA; route context rail; open sections divided by single rules; stable label columns; command/action lines. Avoid a card-grid composition.
Typography: Geist Mono-like UI type for headings, navigation, labels, data, tables, dates and commands; clean sans-serif for explanatory paragraphs. Fixed compact scale and tabular numerals.
Color palette: Predominantly cool near-white light workbench with one charcoal dark inset showing alternative theme. Sky-teal accent under 10 percent, semantic green/amber/slate/red only for real state.
Calendar content: month grid “MAY 2025” with played, won, lost and locked states using text/glyph plus color; selected “MAY 23”; adjacent inspector says “Locked Daily”; “Unlock this date to play or view results”; confirmation lists “Price 60 coins”, “Balance 1,084 coins”, “After unlock 1,024 coins”, and exact reassurance “No coins are spent until you confirm.” Actions “UNLOCK FOR 60 COINS” and “CANCEL”. No payment wording.
Profile and Settings: public preview, player name, bio, visibility, flair; ruled settings rows for Sound, Reduced effects, Notifications and Default Hard Mode; familiar toggles; no raw Auth identifiers.
Stats and History: aligned summaries for Level, XP, streak, games, wins and average guesses; compact bar visualization derived from history; ruled History table with date, game, result, progress and reward. No unsupported statistics or decorative metric cards.
Mobile Word Explorer: route title, length selector 2 through 35 with 5 selected, search input, sort select, result count, ruled word list with eligibility labels, selected word definition inspector, previous/next controls, bottom navigation; no horizontal overflow and 44px targets.
State treatment: use explicit labels and glyphs in addition to color. Show one inline success status and one inline unavailable state with a retry action.
Emotional target: quiet utility, deliberate rhythm, clarity, accessible confidence.
Constraints: Authentically terminal-derived through alignment, context, command/status and ruled regions, but not a literal CLI. Familiar controls. No fake shell syntax, dollar prompts, generic card grids, dashboard metric tiles, marketing hero, excessive white space, glassmorphism, gradients, wide shadows, rounded cards, pills everywhere, terminal traffic lights, scanlines, code rain, neon, cyberpunk, fire/ice, texture, theatrical 3D, implementation terminology, payment language, private IDs, answers or credentials.
Avoid: malformed text, tiny illegible labels, unclear controls, clipped mobile content, copied trade dress, watermarks.
```

## Approval board — Home and Solo

Reference image: `explorations/quiet-workbench.png`

```text
Use case: ui-mockup
Asset type: Binding-candidate Amordle Stage 2 approval board 1 of 4 — Home and Solo
Input images: Image 1 is the selected Quiet Workbench style and structural reference. Preserve its calm ruled workbench system, compact navigation, typography roles, light/dark theme parity, low-radius controls, command rails and status lines. Correct its ambiguous game details rather than copying them blindly.
Primary request: Produce a coordinated, high-fidelity landscape approval board for the exact Home, Solo OG, and Solo GO browser experience on desktop and mobile.
Composition: 16:10 landscape board with four clearly labeled frames: DESKTOP HOME LIGHT, DESKTOP SOLO OG DARK, MOBILE HOME LIGHT 390x844, MOBILE SOLO GO DARK 390x844. Add a narrow specification column for evidence states and shared anatomy.
Home frame exact content: brand “amordle”; commands HOME, SOLO, DAILY, COMBAT, DATA; context “amordle / home”; heading “Choose your next game”; explanatory line “Pick a mode and get to work.”; actions “START SOLO”, “PLAY DAILY”, “OPEN COMBAT”; ruled region “RIGHT NOW” with one row “COMBAT · OG · 5 LETTERS”, opponent “Rook42”, status “Your turn”, updated “1m ago”; bottom status “LEVEL 24 · XP 3,480 / 5,000 · COINS 1,250”. No word bank content.
Solo OG exact content: context “amordle / solo / practice / og”; status “OG · 5 LETTERS · STANDARD”; exactly one puzzle and six board rows; two accepted guesses plus one draft row; evidence-aware keyboard; human status “Ready for your guess.”; actions “SUBMIT”, “DELETE”, “SOUND ON”, “SHARE”, “FOCUS”; progress “PUZZLE 1/1”.
Mobile Home: compact top context rail, the same three actions, one activity row, authoritative progress status, bottom navigation HOME, SOLO, DAILY, COMBAT, MORE; 44px targets.
Mobile Solo GO: context “amordle / solo / practice / go”; status “GO · PUZZLE 3/5”; one clearly labeled SEED row distinct from two accepted guesses; playable board, keyboard, “SUBMIT” and “DELETE”; bottom game status “Saved on this device”; no global bottom navigation while active game is in focus.
Evidence system: correct cell uses check mark plus double lower rule; present uses tilde plus dashed lower rule; absent uses x plus neutral solid rule. Include a readable legend.
Typography: Geist Mono-like UI for commands, headings, board, keyboard, labels and data; sans-serif only for explanation. Fixed compact scale.
Palette: cool near-white light workbench and charcoal-blue dark workbench, sky-teal accent under 10 percent, semantic green/amber/slate, no pure black.
Constraints: Browser-native professional terminal workbench, not literal CLI. Familiar controls and plain-language labels. No generic cards, marketing hero, dashboard metric cards, glass, gradients, wide shadows, rounded panels, pills everywhere, traffic lights, fake prompts, scanlines, code rain, neon, cyberpunk, fire/ice, texture, decorative ASCII, payment wording, private IDs, credentials, hidden answers or implementation terminology. OG is exactly one puzzle. GO is exactly five puzzles. No malformed text, clipped controls, watermarks or copied trade dress.
```

## Approval board — COMBAT

Reference images: `explorations/quiet-workbench.png`,
`explorations/dense-match-console.png`

```text
Use case: ui-mockup
Asset type: Binding-candidate Amordle Stage 2 approval board 2 of 4 — COMBAT
Input images: Image 1 is the binding Quiet Workbench visual system. Image 2 is a structural reference only for symmetric match panes and dense tables; do not copy its all-dark intensity or cramped scale.
Primary request: Produce one coherent Quiet Workbench COMBAT approval board with desktop and mobile waiting, active, result/rematch, recovery, active-list, notification, and read-only spectator states.
Composition: 16:10 landscape board. Clearly labeled frames: DESKTOP WAITING LIGHT, DESKTOP ACTIVE DARK, MOBILE ACTIVE LIGHT 390x844, RESULT + REMATCH, ACTIVE GAMES + ALERTS, SPECTATOR READ ONLY. Maintain compact command bar, route context rail, titled ruled regions, status line, low-radius controls, sky-teal accent and equal light/dark quality.
Waiting exact content: “COMBAT · PUBLIC PRACTICE”; “WAITING FOR ANOTHER PLAYER”; “OG · 5 LETTERS · STANDARD”; notes “Unranked game” and “Both players get the same puzzle”; actions “CANCEL MATCH” and “HOW COMBAT WORKS”; status “Waiting · Checking every 5 seconds”.
Desktop active exact content: context “amordle / combat / match”; “PUBLIC PRACTICE · OG · 5 LETTERS”; status “YOUR TURN”; timer “00:42”; symmetrical panes YOU and OPPONENT; exactly one OG puzzle, six board rows each; two accepted moves total; evidence-aware keyboard; actions “SUBMIT”, “DELETE”, “FORFEIT”; footer “Move 3 · Puzzle 1/1 · Saved”.
Mobile active: top rail “YOUR TURN · 00:42”; compact opponent board visible first, then clearly dominant YOUR BOARD, keyboard and actions; no horizontal overflow; 44px targets; status “Saved”.
Result exact content: “YOU WON”; score “1–0”; “Finished in 2:14”; summary rows “Moves 5”, “Rating +8”, “Reward 12 coins”; actions “REQUEST REMATCH”, “NEW OPPONENT”, “BACK TO COMBAT”.
Recovery exact content: token “RECONNECTING”; message “Your match is safe. Checking for the latest turn…”; action “TRY AGAIN”.
Active games: ruled rows with match type, opponent, turn state, updated time and action “RESUME” or “RESULT”.
Alerts: compact accessible menu with “Your turn”, “Private match request”, “Match result”, timestamps, “MARK ALL READ”.
Spectator: boards first; prominent “READ ONLY”; “PUBLIC PRACTICE · LIVE”; no mutation controls; sanitized labels PLAYER ONE and PLAYER TWO; footer “Move 4 · Puzzle 1/1”.
Evidence: correct check plus double rule; present tilde plus dashed rule; absent x plus neutral rule.
Constraints: Familiar browser controls and plain-language labels. No server-authority, projection, database, idempotency, Auth ID, raw match ID, answer, credential or private-data copy. No fake CLI, generic cards, glass, gradients, wide shadows, excessive rounding, pills everywhere, scanlines, code rain, neon, cyberpunk, fire/ice, texture, decorative ASCII, disabled spectator controls, malformed text, watermarks or copied trade dress.
```

## Approval board — Daily, economy, account, and data

Reference images: `explorations/quiet-workbench.png`,
`explorations/inline-command-desk.png`

```text
Use case: ui-mockup
Asset type: Binding-candidate Amordle Stage 2 approval board 3 of 4 — Daily, economy, account, and data
Input images: Image 1 is the binding Quiet Workbench visual system. Image 2 is structural research for open ruled Calendar and data anatomy only. Keep one coherent Quiet Workbench system and omit unsupported fields shown in Image 2.
Primary request: Produce a high-fidelity landscape approval board for Calendar and unlock confirmation, Marketplace, Profile and Settings, History, Stats, Leaderboard, and Word Explorer.
Composition: 16:10 landscape board with clearly labeled frames: DESKTOP CALENDAR + CONFIRMATION LIGHT, MOBILE CALENDAR CONFIRMATION DARK 390x844, DESKTOP ACCOUNT + SETTINGS, DESKTOP STATS + HISTORY + LEADERBOARD, MOBILE WORD EXPLORER LIGHT 390x844. Use ruled work regions and stable columns, not cards.
Calendar exact content: month “MAY 2025”; local-date note; played, won, lost and locked states with glyphs plus color; selected “MAY 23”; inspector “Locked Daily”; “Unlock this date to play or view results.”; price “60 coins”; current balance “1,084 coins”; resulting balance “1,024 coins”; exact reassurance “No coins are spent until you confirm.”; actions “UNLOCK FOR 60 COINS” and “CANCEL”. Include OG/GO selector. No payment, secure, credit-card or checkout wording.
Marketplace exact content: status “Balance 1,084 coins”; two inventory rows “Reveal One Letter · Owned 2 · 25 coins” and “Remove Incorrect Letters · Owned 1 · 40 coins”; confirmation follows the same price/current/after structure.
Profile exact content: fields Player name, Bio, Public visibility, Accent color, Flair; public preview; no raw identifier. Settings rows only Sound, Reduced effects, Notifications, Default Hard Mode.
Stats exact content: Level, XP, Daily streak, Completed games, Wins, Average guesses. Any bars are derived only from those values or History. No invented win rate, country, total time, export, ratings distribution, payment, or unsupported account control.
History exact columns: Date, Game, Result, Progress, Reward. Leaderboard exact columns: Rank, Player, Rating, Record, Peak; tabs OG and GO; label provisional ratings.
Mobile Word Explorer exact content: context “amordle / data / words”; Length selector 2–35 with 5 selected; Search; Sort A–Z; result count; ruled word rows with “Answer + guess” or “Guess”; selected word definition inspector; actions “COPY WORD” and “SEARCH DEFINITION”; Previous and Next; 44px targets; no horizontal overflow.
States: include a compact loading skeleton, an honest empty state, and one unavailable state with “TRY AGAIN”.
Typography and palette: same Quiet Workbench Geist Mono-like interface, sans prose, cool light and charcoal-blue dark, sky-teal accent under 10 percent, semantic colors only for actual state.
Constraints: Familiar browser controls; terminal identity through context rails, stable alignment, titled rules, command/status lines and selection. No generic cards, metric-card grid, glass, gradients, wide shadows, excessive rounding, pills everywhere, fake CLI, scanlines, code rain, neon, cyberpunk, fire/ice, texture, decorative ASCII, implementation terminology, private IDs, hidden answers, credentials, malformed text, clipped content, watermarks or copied trade dress.
```

## Approval board — Mobile, Marketplace, support, and states

Reference image: `explorations/quiet-workbench.png`

```text
Use case: ui-mockup
Asset type: Binding-candidate Amordle Stage 2 approval board 4 of 4 — Mobile, marketplace, support, and exceptional states
Input images: Image 1 is the binding Quiet Workbench visual system. Preserve its typography, cool neutral themes, sky-teal restraint, context rails, ruled work regions, status lines and low-radius controls.
Primary request: Produce a coordinated high-fidelity landscape approval board showing responsive mobile translation and complete supporting/exceptional states.
Composition: 16:10 landscape board with eight clearly labeled frames: MOBILE MARKETPLACE LIGHT 390x844, MOBILE PURCHASE CONFIRMATION DARK 390x844, MOBILE AUTH LIGHT 390x844, MOBILE SETTINGS DARK 390x844, DESKTOP WORD EXPLORER, DESKTOP HELP + FEEDBACK, GLOBAL STATES, FOCUS MODE GAME RAIL. Include a compact shared mobile anatomy specification.
Marketplace exact content: context “amordle / marketplace”; status “Balance 1,084 coins”; ruled inventory rows “Reveal One Letter · Owned 2 · 25 coins” and “Remove Incorrect Letters · Owned 1 · 40 coins”; action “BUY”; plain-language note “Tools are available in Solo Practice.”
Purchase confirmation exact content: “Confirm purchase”; item “Reveal One Letter”; price “25 coins”; current balance “1,084 coins”; after purchase “1,059 coins”; exact reassurance “No coins are spent until you confirm.”; actions “CONFIRM PURCHASE” and “CANCEL”. No payment or checkout language.
Auth exact content: tabs “SIGN IN” and “CREATE ACCOUNT”; fields Email and Password; action “SIGN IN”; link “SEND RECOVERY LINK”; status text “Guest games stay separate.” No raw identifiers.
Settings exact content: Sound, Reduced effects, Notifications, Default Hard Mode; familiar switches with ON/OFF text; action status “Settings saved.”
Desktop Word Explorer: context rail; Length 2–35 with 5 selected; Search; Sort A–Z; result count; ruled word list; selected word definition inspector; actions COPY WORD and SEARCH DEFINITION; no card grid.
Help + Feedback: Help has a compact section index and readable prose; Feedback has Category, Short summary, What happened, sanitized issue preview, actions COPY PREVIEW and OPEN GITHUB ISSUE, note “Nothing is submitted automatically.”
Global states: six small ruled state examples labeled LOADING, EMPTY, OFFLINE, RECONNECTING, UNAVAILABLE, UNAUTHORIZED. Each has one human explanation and a valid action where applicable, such as TRY AGAIN or SIGN IN. No implementation terms.
Focus Mode: compact active-game top rail showing “OG · 5 LETTERS”, “Ready for your guess”, “SOUND ON”, “ALERTS”, “EXIT FOCUS”; board and keyboard remain visually dominant; no global navigation.
Mobile anatomy: top context rail, full-width ruled work regions, 44px controls, safe-area spacing, bottom navigation HOME, SOLO, DAILY, COMBAT, MORE when not in Focus Mode, no horizontal document overflow.
Typography and palette: Quiet Workbench Geist Mono-like UI, sans prose, equal-quality light/dark, sky-teal accent under 10 percent, semantic state colors plus labels/glyphs.
Constraints: Familiar browser controls; no fake CLI, generic cards, marketing hero, glass, gradients, wide shadows, excessive rounding, pills everywhere, traffic lights, scanlines, code rain, neon, cyberpunk, fire/ice, texture, decorative ASCII, payment wording, implementation terminology, private IDs, hidden answers, credentials, malformed text, tiny unreadable controls, clipped content, watermarks or copied trade dress.
```
