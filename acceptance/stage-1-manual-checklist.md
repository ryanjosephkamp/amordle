# Amordle Stage 1 Manual Checklist

Candidate:
`https://amordle-p1qp5fpnk-ryanjosephkamps-projects.vercel.app`

Use Vercel team authentication. Do not copy automation credentials into a URL,
chat, screenshot, or browser extension.

## Public and Solo

- [ ] Home makes the next Solo, Daily, and active COMBAT actions immediately
      understandable.
- [ ] Home does not request a word bank.
- [ ] Solo OG works with physical and on-screen input, reload, result, share,
      sound, and Focus Mode.
- [ ] Solo GO labels retained evidence and holds a solved answer for two
      seconds before advancing.
- [ ] Lengths 2, 5, 7, 10, and 35 remain usable without horizontal document
      overflow.
- [ ] A previously visited Solo route restores offline; Auth, API, and COMBAT
      responses do not appear in Cache Storage.

## Account and economy

- [ ] Register, sign in, sign out, and recovery language are clear.
- [ ] Switching accounts never exposes the prior account’s local or remote
      state.
- [ ] Profile, Settings, History, Calendar, Marketplace, Stats, public player,
      and Leaderboard routes have meaningful loading, empty, error, and content
      states.
- [ ] A past Daily shows its 60-coin price and new balance before confirmation
      and does not charge on selection or cancel.

## COMBAT

- [ ] Public unranked Practice can be created and joined from separate signed-in
      browser contexts.
- [ ] Accepted turns alternate; rejected input does not spend a turn.
- [ ] Refresh restores the authoritative match without a second accepted move.
- [ ] Ranked Practice, Daily, private request, rematch, Active, Lobby, Live,
      result, cancel/forfeit, and reconnect language is understandable.
- [ ] Live spectator state has no keyboard or mutation action and exposes no
      answer or private identifier.

## Accessibility and responsive behavior

- [ ] Keyboard focus is always visible.
- [ ] Controls remain usable at 320, 360, 390, 412, 768, 960, 1440, and 1920
      pixels.
- [ ] 200% zoom, reduced motion, forced colors, and system dark mode preserve
      operation and meaning.
- [ ] Correct/present/absent/removed meaning is not communicated by color alone.
- [ ] A screen reader announces status, errors, turns, boards, and form labels
      in a useful order.

## Operational boundaries

- [ ] Preview is protected and Production is not part of review.
- [ ] Exactly three HTTP interfaces remain visible.
- [ ] Admin word refresh exposes bounded metadata only.
- [ ] No merge or Production release should be requested from this checklist.

Record any issue with route, viewport, account state, expected behavior, actual
behavior, and a screenshot that contains no secret or unrelated player data.
