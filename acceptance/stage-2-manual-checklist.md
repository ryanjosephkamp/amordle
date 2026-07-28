# Amordle Stage 2 Manual Review Checklist

Candidate:
`https://amordle-f88bigwdu-ryanjosephkamps-projects.vercel.app`

Application commit:
`ef8407216afde5bc4639411b210678b731090dee`

Use Vercel team authentication. Do not copy automation credentials into a URL,
chat, screenshot, browser extension, or issue.

## Terminal/TUI design authority

- [ ] The app feels like a calm word-game workbench derived from terminal
      structure, not a themed SaaS dashboard or fake shell.
- [ ] Command bar, context rail, titled work regions, status language, and
      action hierarchy feel coherent across routes.
- [ ] Typography is compact and exact without making longer explanations hard
      to read.
- [ ] Light and dark modes feel equally intentional.
- [ ] Semantic correct/present/absent/removed states remain understandable
      without color alone.
- [ ] There is no cyberpunk spectacle, fire/ice styling, glass, excessive glow,
      scanline, code-rain, atmospheric texture, or decorative card nesting.

## Home and navigation

- [ ] Home immediately explains the next Solo, Daily, and COMBAT actions.
- [ ] Desktop and mobile navigation make the current route clear.
- [ ] `MORE` opens and closes predictably with pointer, keyboard, and Escape.
- [ ] Focus Mode removes global chrome without creating a second game session.
- [ ] Home makes no word-bank request.

## Solo, Daily, and economy

- [ ] Solo OG and GO keep the board, status, evidence, tools, and keyboard
      visually dominant.
- [ ] Physical input and on-screen input remain synchronized.
- [ ] The 320px and 390px playfields show complete Submit/Delete controls
      without document overflow.
- [ ] Evidence legend, board, and keyboard remain meaningful in forced colors
      and at 200% zoom.
- [ ] Calendar makes local Solo date versus UTC COMBAT date understandable.
- [ ] Past-Daily and Marketplace confirmation clearly show that no coins are
      spent until confirmation.

## COMBAT

- [ ] Waiting state clearly explains that both players receive the same puzzle.
- [ ] Desktop participant boards feel symmetric; mobile puts the opponent board
      before the viewer board while preserving the next action.
- [ ] Turn state, recovery, result, and rematch controls are unmistakable.
- [ ] Active, Lobby, Live, notifications, and public/private/ranked lanes use
      player-facing alternating-turn language.
- [ ] Spectator mode is clearly read-only and exposes no input control, private
      identifier, seed, or unsolved answer.

## Account, data, and support

- [ ] Auth clearly separates Sign in and Create account and says guest games
      stay separate.
- [ ] Profile and Settings feel like workbench surfaces rather than generic
      forms.
- [ ] History, Stats, and Leaderboards have readable density on desktop and
      translate into legible mobile rows.
- [ ] Word Explorer loads one selected length, never identifies an active
      answer, and uses the implemented definition fallback.
- [ ] Help, Feedback, About, and Admin match the same hierarchy and editorial
      tone.
- [ ] Loading, empty, offline, reconnecting, unavailable, unauthorized, and
      recovery states feel complete and understandable.

## Accessibility and responsiveness

- [ ] Keyboard focus is always visible and logical.
- [ ] Controls remain usable at 320, 360, 390, 412, 768, 960, 1440, and 1920
      pixels.
- [ ] 200% zoom creates no horizontal document overflow.
- [ ] Reduced motion removes non-essential animation.
- [ ] Forced colors preserves hierarchy, evidence, and actions.
- [ ] Touch targets remain at least 44px on mobile.
- [ ] Screen-reader labels and live status announcements are useful and do not
      duplicate confusing information.

## Review boundary

- [ ] The candidate is protected and Production is not part of this review.
- [ ] Exactly three HTTP interfaces remain.
- [ ] No merge, Production release, schema change, default-branch change, or
      real-account deletion is requested by this checklist.

Record any issue with route, viewport, account state, expected behavior, actual
behavior, and a screenshot containing no secret or unrelated player data.
