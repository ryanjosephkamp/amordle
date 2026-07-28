# Amordle Stage 2 v4 Manual Review Checklist

Application commit:
`813bbe13711349feafd5d7c170f4f814d71f1994`

Protected Preview: pending credential rotation and v4 deployment. The existing
`dpl_3jyBWjwVzFJLFU9rxHyuZhbgcbzV` deployment is the superseded v2 candidate
and must not be reviewed as v4.

Never copy credentials into a URL, chat, screenshot, browser extension, issue,
or commit.

## Alt-Screen TUI authority

- [ ] The application reads immediately as one fullscreen terminal program,
      not a generic web dashboard with a monospace font.
- [ ] The titlebar, route path, textual navigation, main buffer, ruled regions,
      prompt markers, and status line form one coherent shell.
- [ ] Current routes and selected actions use clear inverse-video treatment.
- [ ] Data and transcript rows align cleanly without decorative card nesting.
- [ ] Terminal grammar supports comprehension; typed commands are never
      required.
- [ ] Light and dark modes both feel deliberate and Mac Terminal-derived.
- [ ] There is no Matrix effect, scanline, CRT distortion, neon spectacle,
      code rain, fake command spam, nested glass, or generic SaaS-card grid.

## Home and navigation

- [ ] Home presents Solo, Daily, COMBAT, and supporting routes as a compact
      terminal launcher with ordinary-language descriptions.
- [ ] Desktop and mobile navigation make the current route unmistakable.
- [ ] `MORE` opens and closes predictably with pointer, keyboard, and Escape.
- [ ] Focus Mode removes global chrome without creating a second game session.
- [ ] Home makes no word-bank request.

## Solo, Daily, and economy

- [ ] Solo OG and GO keep the numbered board, cursor, evidence, status, tools,
      and keyboard visually dominant.
- [ ] Physical input and on-screen input remain synchronized.
- [ ] The 320px and 390px playfields show complete Submit/Delete controls
      without document overflow or keyboard obstruction.
- [ ] Evidence glyphs, board, and keyboard remain understandable without color,
      in forced colors, and at 200% zoom.
- [ ] Calendar makes local Solo date versus UTC COMBAT date understandable.
- [ ] Past-Daily and Marketplace confirmation show that no coins are spent
      before confirmation.

## COMBAT

- [ ] Waiting reads as a terminal transcript with a clear next state rather
      than an empty scaffold.
- [ ] Participant panes, shared clock/turn state, and the playable board have
      an unmistakable hierarchy.
- [ ] Mobile presents the opponent summary without duplicating or obstructing
      the viewer’s controls.
- [ ] Recovery, outcome, settlement, and rematch states are clear.
- [ ] Active, Lobby, Live, and notifications use player-facing
      alternating-turn language.
- [ ] Spectator mode is visibly read-only and exposes no mutation control,
      private identifier, seed, or unsolved answer.

## Account, data, and support

- [ ] Auth clearly separates Sign in and Create account and explains that guest
      games remain separate.
- [ ] Profile and Settings use aligned terminal form rows rather than a giant
      generic web form.
- [ ] History, Stats, and Leaderboards retain readable desktop density and
      translate into legible mobile rows.
- [ ] Word Explorer loads one selected length, never identifies an active
      answer, and preserves the definition fallback.
- [ ] Help, Feedback, About, Admin, and exceptional states share the same
      terminal hierarchy and editorial tone.
- [ ] Loading, empty, offline, reconnecting, unavailable, unauthorized, and
      recovery states are complete and understandable.

## Accessibility and responsiveness

- [ ] Keyboard focus is always visible and logical.
- [ ] Controls remain usable at 320, 360, 390, 412, 768, 960, 1440, and 1920
      pixels.
- [ ] 200% zoom creates no horizontal document overflow.
- [ ] Reduced motion removes non-essential animation and cursor blinking.
- [ ] Forced colors uses opaque system colors and preserves hierarchy,
      evidence, and actions.
- [ ] Touch targets remain at least 44px on mobile.
- [ ] Screen-reader labels and live status announcements are useful and do not
      duplicate confusing information.

## Hosted evidence and cleanup

- [ ] The reviewed URL resolves to the exact v4 application commit above.
- [ ] The candidate is protected by Vercel Deployment Protection.
- [ ] Hosted `pnpm test:e2e:services` and `pnpm test:acceptance` are green.
- [ ] Real disposable users prove sign-in, COMBAT turns, refresh recovery,
      results/rematch, and privacy-safe spectation.
- [ ] Every disposable resource is registered and the cleanup receipt proves
      zero database, Auth, Storage, and Blob residue.
- [ ] Production, the default branch, migrations, real accounts, and the locked
      shell are unchanged.

## Review boundary

- [ ] Exactly three HTTP interfaces remain.
- [ ] This review requests no merge, Production release, schema change,
      default-branch change, branch deletion, stash inspection, or real-account
      deletion.

Record any issue with route, viewport, account state, expected behavior, actual
behavior, and a screenshot containing no secret or unrelated player data.
