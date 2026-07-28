# Stage 2 v3 Image Gen Prompts

- Generator: OpenAI built-in Image Gen
- Generated: 2026-07-28
- Inspection: native-size `view_image` review

## Exploration — planning concept

Reference:
`design/references/stage2/v2-terminal-workbench-2026-07-27/approval-board-home-solo.png`

```text
Use case: ui-mockup
Asset type: preview-only Stage 2 v3 visual-direction board for a responsive browser word game
Primary request: Redesign Amordle so it feels like a truly polished macOS-native terminal/TUI word game: a modern macOS Liquid Glass application shell wrapped around a dense, elegant Grok Build-inspired terminal workspace. Preserve the reference image's product information architecture (Home commands, Solo word board, evidence, keyboard, status, responsive mobile), but completely replace its flat ruled styling.
Visual thesis: macOS window and material shell outside; Grok-style fullscreen TUI logic inside. The interface should feel like a real premium Mac utility and a serious terminal game, not a generic dashboard and not a novelty fake shell.
Representative states on one coordinated board: (1) desktop dark Home inside a centered macOS window with subtle traffic lights, translucent title/toolbar, floating glass navigation/control capsules, a command-prompt-driven game launcher, active-session transcript rows, and compact status footer; (2) desktop dark Solo OG with a matte near-black terminal content plane, precise word grid, evidence markers, keyboard, timer/save status, and restrained Liquid Glass toolbar/action rail; (3) mobile dark Solo with a compact glass header and bottom command dock, full playable board and 44px controls; (4) a small light-mode material swatch/anatomy panel showing how the same system translates without becoming white SaaS.
Typography: macOS SF Pro for human-readable labels and SF Mono for all terminal/game/data text. Monospaced type should dominate. Use authentic compact terminal rhythm, clear prompt glyphs, quiet line numbering/status metadata, and tabular numerals. No oversized marketing headline.
Palette: near-black graphite terminal canvas, neutral charcoal, subtle cool-blue/teal system accent, semantic green/amber/slate evidence, soft white text. Liquid Glass is neutral and translucent, reflecting a very subtle blurred macOS-style wallpaper field behind the unified app window. Color is functional and restrained.
Materials: Apple-style regular Liquid Glass only for navigation, toolbar, titlebar, popovers, command dock, and transient controls; matte/standard material for content regions. Glass should have fine specular edge highlights, adaptive luminosity, blur, subtle inner reflection, and crisp readable foregrounds. Do not make every content panel glass.
Composition: one continuous application window and terminal workspace, not a grid of floating cards. Use spatial alignment, command prompts, transcript rows, split panes only where functional, clear active cursor/selection, inset terminal canvas, and edge-to-edge content behind glass chrome. Desktop 1440x1024 feel plus faithful 390x844 mobile inset.
Controls: code-native-looking macOS controls, restrained SF Symbols-like line icons, visible keyboard shortcuts, prompt chevrons, segmented controls only where useful, purposeful focus rings, selected states, and a single strong primary action. Do not simulate typed commands as the only way to play; buttons remain understandable to ordinary word-game players.
Exact visible copy samples where readable: "amordle", "HOME", "SOLO", "DAILY", "COMBAT", "DATA", "Choose a game", "Start Solo", "Play Daily", "Open Combat", "OG · 5 letters", "Ready for your guess", "Saved on this device", "Submit", "Delete", "Correct spot", "Present elsewhere", "Not in word".
Constraints: professional agency-quality product UI; polished, coherent, legible, practical to implement in Next.js/React/CSS; desktop and mobile; system light/dark; WCAG-minded contrast; 44px mobile targets; gameplay stays dominant.
Avoid: generic SaaS cards; flat wireframe panels; fake command spam; Matrix/code rain; scanlines; CRT distortion; cyberpunk neon; excessive glow; fire/ice; glass nesting; glass over the game board; giant rounded cards; overblown gradients; copying xAI logos, wording, or distinctive trade dress; copying Apple proprietary assets; illegible tiny text; decorative terminal cosplay.
```

## Approval board — Shell and Home

Reference: `explorations/planning-concept.png`

```text
Use case: ui-mockup
Asset type: Amordle Stage 2 v3 approval board — Shell and Home
Primary request: Create a coordinated agency-quality product UI approval board for Amordle showing the definitive macOS Liquid Terminal shell and Home experience. Preserve the visual language of the reference image but improve hierarchy, polish, readability, and authenticity.
Required states: (1) desktop dark Home at 1440×1024 scale inside one centered macOS-style application window; (2) desktop light Home using the same anatomy; (3) mobile dark Home at 390×844; (4) a readable shell anatomy strip for titlebar, navigation, context/status line, command row, utility button, popover, and bottom dock.
Desktop composition: original abstract blurred landscape/color field behind one unified application window; decorative traffic lights; translucent regular-glass titlebar with wordmark, centered HOME/SOLO/DAILY/COMBAT/DATA navigation selector, sound/share/alerts/settings utilities; matte near-black terminal content canvas; Home contains a strong "Choose a game" terminal launcher with exactly three clear command rows—"Start Solo", "Play Daily", "Open Combat"—plus real-looking active session transcript rows and a compact player/status footer. Use prompt chevrons, keyboard shortcuts, thin separators, aligned SF Mono data, and one cyan-teal selection highlight.
Mobile composition: edge-to-edge terminal canvas, compact glass topbar, command launcher first, active sessions below, glass bottom navigation dock with 44px targets. No traffic lights on mobile.
Typography: SF Pro for explanatory prose and SF Mono for navigation, prompts, data, shortcuts, and status; monospaced type dominates; compact but readable; no giant headline.
Materials: Apple-inspired regular Liquid Glass only for titlebar, navigation selector, popover, utility cluster, and mobile dock; matte standard material for content; subtle lens edge highlights, adaptive luminosity, soft blur, no glass nesting.
Palette: graphite/near-black, fog-white light mode, cool neutral blue-gray glass, cyan-teal focus, green saved state, amber attention. Restrained and high contrast.
Exact visible copy samples: "amordle", "HOME", "SOLO", "DAILY", "COMBAT", "DATA", "Choose a game", "Pick a mode and get to work.", "Start Solo", "Play Daily", "Open Combat", "ACTIVE SESSIONS", "Your turn", "Saved", "READY".
Constraints: complete responsive product screen, practical Next.js/React/CSS implementation, code-native controls, ordinary users can click/tap everything, no terminal knowledge required, no copying Apple or xAI logos or assets.
Avoid: generic card grid, flat wireframe, excessive empty space, glass content cards, neon/cyberpunk, Matrix effects, scanlines, fake code, giant rounded cards, tiny illegible labels, marketing hero, atmospheric spectacle.
```

## Approval board — Solo, Daily, Calendar, and Economy

Reference: `approval-board-shell-home.png`

```text
Use case: ui-mockup
Asset type: Amordle Stage 2 v3 approval board — Solo, Daily, Calendar, and Economy
Primary request: Create a coordinated professional UI approval board extending the exact macOS Liquid Terminal design system in the reference. Focus on gameplay and daily/economy states at readable scale.
Required states: (1) desktop dark Solo OG active game; (2) desktop light Solo GO showing seeded evidence and puzzle progress; (3) desktop light Daily Calendar with recent 35-day grid and selected-date inspector; (4) mobile dark purchase confirmation for unlocking a past Daily; (5) mobile dark Solo at 390×844 with complete board, keyboard, status, and glass dock.
Solo composition: one unified Mac window; translucent regular-glass titlebar and compact game action toolbar; matte terminal canvas; SF Mono numbered rows; active guess cursor; clear correct/present/absent glyph plus color treatment; compact status line for OG/GO, length, difficulty, puzzle count, attempt count, timer, save state; keyboard is tactile but not glossy; board and keyboard dominate; evidence legend is an inspector, not another glass card.
GO state: visibly label "SEED EVIDENCE" and "PUZZLE 3 / 5" without fake words being authoritative.
Calendar: dense chronological 35-day terminal grid with success/locked/today states, selected date inspector, local-date explanation, one primary action. Purchase confirmation uses a restrained glass sheet over matte content, explicit coin cost, cancel and unlock actions, no hidden spend.
Typography: SF Pro for plain explanations, SF Mono for game/data/navigation; compact fixed scale; tabular numerals.
Materials: liquid glass only titlebar, navigation selector, compact action rails, popovers, and confirmation sheet; content remains matte graphite or fog-white standard material.
Palette: graphite, fog white, cool blue-gray, cyan-teal focus, semantic green, amber, slate. Equal-quality system light and dark.
Exact visible copy samples: "SOLO", "OG · 5 LETTERS", "GO · PUZZLE 3 / 5", "SEED EVIDENCE", "Ready for your guess", "Saved on this device", "Submit", "Delete", "DAILY CALENDAR", "Recent 35 days", "Unlock past Daily?", "250 coins", "Cancel", "Unlock".
Constraints: implementation-ready Next.js/React/CSS product UI; code-native controls; 44px mobile targets; no horizontal overflow; ordinary word-game players understand every action.
Avoid: glass on tiles or board canvas, generic cards, Wordle clone styling, empty scaffolding, fake terminal command entry, tiny keyboard keys, cyberpunk, scanlines, excessive glow, giant rounded containers, copying Apple/xAI assets.
```

## Approval board — COMBAT

Reference: `approval-board-shell-home.png`

```text
Use case: ui-mockup
Asset type: Amordle Stage 2 v3 approval board — COMBAT multiplayer
Primary request: Create a coordinated agency-quality approval board for Amordle COMBAT using the exact macOS Liquid Terminal system from the reference. Make multiplayer feel tactical, readable, symmetric, and premium rather than like empty web scaffolding.
Required states: (1) desktop dark waiting for opponent; (2) desktop dark active match with symmetric YOU and OPPONENT terminal panes, shared clock/turn status, active playable board and compact opponent evidence; (3) mobile dark active match at 390×844 with opponent summary above dominant player board and complete keyboard; (4) desktop light result/rematch with outcome, rating/reward facts, and clear actions; (5) desktop dark privacy-safe spectator labeled READ ONLY with no mutation controls; (6) compact recovery/reconnecting state anatomy.
Window composition: one centered Mac-like app window over original low-contrast abstract backplate; decorative traffic lights; translucent titlebar/nav/utilities; matte terminal content; status line directly below chrome; split panes only where functional; compact bottom shortcut/status rail.
Interaction hierarchy: current turn and clock highest priority; next valid action unmistakable; waiting state includes human explanation and safe exit; recovery explains automatic retry; results show outcome before reward/settlement details; rematch is primary only when allowed; spectator visibly lacks Submit/Delete/Forfeit.
Typography: SF Pro for plain-language status, SF Mono for names, timers, moves, ratings, commands, boards, and shortcuts. Dense tabular alignment, readable at native size.
Materials: Liquid Glass for titlebar, navigation, status/action toolbar, confirmation/recovery sheet, and transient alerts only; participant boards and transcript content remain matte.
Palette: graphite dark, fog-white light, cyan-teal focus, green success, amber current-turn attention, slate neutral, red only for true destructive action.
Exact visible copy samples: "COMBAT", "Waiting for another player", "Both players get the same puzzle.", "YOU", "OPPONENT", "YOUR TURN", "00:28", "Submit", "Forfeit", "You won", "Request rematch", "Back to Combat", "READ ONLY", "Reconnecting", "Your game is safe. Retrying automatically.".
Constraints: real browser-game UI; ordinary users understand it; responsive; 44px mobile targets; privacy-safe spectator; no invented private data as authority; practical Next.js/React/CSS.
Avoid: giant empty panels, dashboard cards, fake chat console, esports neon, cyberpunk, excessive glow, glass boards, tiny mobile controls, duplicated participant actions, copied xAI/Apple marks or assets.
```

## Approval board — Account, Data, Word Explorer, and Support

Reference: `approval-board-shell-home.png`

```text
Use case: ui-mockup
Asset type: Amordle Stage 2 v3 approval board — Account, Data, Word Explorer, and Support
Primary request: Create a coordinated agency-quality product UI approval board extending the exact macOS Liquid Terminal system from the reference across dense account and data surfaces. Make these screens feel like a polished native Mac utility plus terminal inspector, not generic forms or SaaS cards.
Required states: (1) desktop light Profile editor with grouped inspector rows for player name, bio, visibility, accent, flair, and one Save Profile action; (2) desktop dark Settings with macOS-style grouped preferences, toggles/selects, status footer, and no giant form card; (3) desktop dark History/Stats/Leaderboard dense split-view with transcript table, compact summary, filters, sticky header, and selected row inspector; (4) desktop light Word Explorer with length/search controls, word list, selected definition inspector, and explicit actions; (5) mobile dark account/data view at 390×844 showing responsive key/value rows and glass bottom dock; (6) compact Help/Feedback/Admin exceptional-state anatomy for loading, empty, offline, unauthorized, error, and recovery.
Composition: one unified app window; decorative traffic lights on desktop; regular-glass titlebar, navigation selector, utility cluster, transient popovers and sheets; matte fog-white or graphite content plane; left source list/terminal transcript and right inspector where useful; open groups and thin separators rather than card grids.
Typography: SF Pro for explanations and form labels; SF Mono for navigation, field metadata, values, tables, filters, shortcuts, status, and timestamps. Compact fixed hierarchy and tabular numbers.
Controls: familiar Mac-like fields and toggles, clear focus, selected row highlight, source-list behavior, 44px mobile targets, one primary action per task, explicit unavailable/retry states.
Palette: equal-quality system light/dark, fog white, graphite, cool blue-gray glass, cyan-teal selection, green success, amber attention, red error only.
Exact visible copy samples: "PROFILE", "Player name", "Bio", "Public visibility", "Accent color", "Flair", "Save Profile", "SETTINGS", "Sound", "Hard Mode", "HISTORY", "STATS", "LEADERBOARDS", "WORD EXPLORER", "Length", "Search", "Definition", "Account summary unavailable", "Try again", "OFFLINE", "READ ONLY".
Constraints: real implementation-ready browser UI, dense but approachable, no fabricated player facts as authority, responsive, accessible, no horizontal document overflow.
Avoid: giant bordered form, repetitive cards, glass content panels, dashboard metrics template, marketing layout, tiny table text, cyberpunk, scanlines, excessive glow, copied Apple/xAI assets, terminal jargon that hides ordinary actions.
```

## Approval board — Mobile and Material Anatomy

Reference: `approval-board-shell-home.png`

```text
Use case: ui-mockup
Asset type: Amordle Stage 2 v3 approval board — Mobile translation and Liquid Glass material anatomy
Primary request: Create a rigorous UI system board showing how the macOS Liquid Terminal direction translates to mobile and how each code-native component should look. Match the reference's visual language exactly but make the examples highly legible and implementation-ready.
Required mobile states at 390×844 and 320×844: Home command launcher, Solo active game with complete keyboard, COMBAT active with opponent summary, Calendar/purchase sheet, Settings grouped rows, Word Explorer list/detail. Show system dark as primary and one light-mode slice.
Required material/component anatomy: desktop titlebar with decorative traffic lights; glass navigation selector; utility cluster; mobile glass topbar; mobile glass bottom dock; regular-glass popover; confirmation sheet; matte terminal pane; selected transcript row; prompt/command row; status line; buttons primary/secondary/danger; text input/select/toggle; tabs; table header/row; loading skeleton; focus ring; hover/pressed/disabled/error states; evidence tiles and keyboard states.
Material rules visualized: glass only on navigation, toolbar, dock, popover, sheet, and transient controls; board/content/table/form surfaces stay matte. Show fine 1px specular edge, subtle inner highlight, blur and luminosity, crisp foregrounds, opaque fallback sample for forced colors.
Typography: SF Pro labels and SF Mono data/navigation/prompts; fixed compact scale with sizes labeled 12/13/14/16/20/24; tabular numerals; no display headline.
Palette swatches: dark graphite, dark matte panel, light fog, light matte panel, cool glass tint, cyan-teal accent, correct green, present amber, absent slate, danger red. Include light/dark and forced-colors notes.
Exact visible copy samples: "HOME", "SOLO", "DAILY", "COMBAT", "DATA", "Start Solo", "Ready for your guess", "Submit", "Delete", "Your turn", "Saved", "Offline", "Try again", "Cancel", "Confirm", "READ ONLY".
Constraints: code-native UI, no copied Apple/xAI assets, 44px targets, mobile playfield protection, no horizontal document overflow, accessible focus and non-color evidence.
Avoid: tiny unreadable component catalog, glass nesting, glass boards, generic shadcn defaults, rounded SaaS cards, neon, scanlines, code rain, over-decoration.
```

## Background source — Dark

```text
Use case: stylized-concept
Asset type: Amordle responsive desktop background backplate — dark appearance
Primary request: Create an original, restrained abstract background for a premium macOS-inspired terminal word game. It must sit behind a large translucent application window and give Liquid Glass subtle color and depth to refract without competing with text or gameplay.
Scene/backdrop: a quiet, abstract coastal-night spatial field with soft graphite-blue depth, a distant low horizon, diffused cool mist, and one very subtle cyan-teal reflected area near the lower left. It should evoke calm macOS desktop polish without resembling or copying any Apple wallpaper.
Style/medium: refined high-resolution digital color-field artwork, softly photographic but fully abstract, minimal, elegant, no recognizable location.
Composition/framing: landscape 3:2, generous low-detail center for a large app window, slightly richer color only at outer edges, no focal object.
Lighting/mood: quiet night, subdued, precise, focused.
Color palette: near-black graphite, deep navy-gray, cool steel blue, faint cyan-teal; low saturation.
Constraints: no text, no logos, no UI, no watermark, no stars, no dramatic landscape, no visible grain, no bright highlights, no copyrighted wallpaper imitation; practical as a compressed web background; must preserve excellent contrast behind translucent glass.
```

## Background source — Light

```text
Use case: stylized-concept
Asset type: Amordle responsive desktop background backplate — light appearance
Primary request: Create an original, restrained abstract background for the light appearance of a premium macOS-inspired terminal word game. It must sit behind a large translucent application window and give Liquid Glass subtle color and depth to refract without competing with content.
Scene/backdrop: a quiet abstract daylight spatial field with fog-white center, pale cool blue-gray depth, soft diffused horizon, and one restrained cyan-teal reflection near a lower outer edge. It should evoke calm macOS desktop polish without resembling or copying any Apple wallpaper.
Style/medium: refined high-resolution digital color-field artwork, softly photographic but fully abstract, minimal, elegant, no recognizable location.
Composition/framing: landscape 3:2, generous low-detail center for a large app window, slightly richer cool color only at outer edges, no focal object.
Lighting/mood: soft overcast daylight, focused, clean, quiet.
Color palette: fog white, cool silver-gray, pale steel blue, faint cyan-teal; low saturation; no cream or beige.
Constraints: no text, no logos, no UI, no watermark, no sun, no dramatic landscape, no visible grain, no bright bloom, no copyrighted wallpaper imitation; practical as compressed web background; must preserve dark text contrast behind translucent glass.
Avoid: warm parchment, colorful gradient blobs, high saturation, mountain wallpaper imitation, decorative objects, strong texture.
```
