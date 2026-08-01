# Product

## Register

product

## Users

General browser word-game players using Amordle on desktop and mobile. They
want to start, resume, understand, and complete Solo or competitive games
quickly without needing terminal knowledge.

## Product Purpose

Amordle is a hosted Wordle-variant platform for Solo, Daily, OG, GO, and COMBAT
play, supported by profiles, progression, public activity, and deep statistics.
Success means every required rule and service transition is real, recoverable,
accessible, and understandable before deeper visual polish begins.

## Brand Personality

Precise, approachable, focused. The product should feel fast and deliberate
while explaining state and recovery in ordinary human language.

## Anti-references

Do not use cyberpunk, fire/ice framing, atmospheric texture, neon spectacle,
excessive glow, generic card grids, decorative glass nesting, theatrical 3D,
or implementation-facing language. Historical Amordle concepts and frontend
code are not design references.

## Design Principles

1. Put the active game and the next valid action first.
2. Make dense state scannable without simplifying away useful information.
3. Confirm actions only after the relevant persistence succeeds.
4. Use familiar controls and direct language so the interface disappears into
   play.
5. Treat responsive, accessible operation as core gameplay behavior.

## Community and identity

- Player profiles are public-facing game identities. Their sanctioned fields
  are player name, bio, HTTPS profile image URL, accent, flair, and public
  COMBAT record.
- Auth identifiers, email, settings, Solo History, progression, inventory,
  economy, private requests, blocks, and private match state remain private.
- A player name with a sanctioned public profile identifier is navigable to
  that profile. Opening one's own public identity resolves to the editable
  profile surface.
- Public discovery is bounded and paginated. It supports name-prefix and one
  ranked-COMBAT-lane filter at a time; it is not an account directory.
- Profile challenges reuse existing private-request preferences, blocks,
  uniqueness, expiry, and anti-spam authority.

## Definitions

- Definitions are optional, user-triggered reference content. They are not
  word-bank authority and never determine whether a guess is valid.
- The browser may consult bounded public dictionary sources only after the
  player asks for a definition. Successful and honest not-found results may be
  cached locally with revisioned expiry metadata.
- A definition failure never blocks gameplay, results, History, or word
  exploration. Copy and web-search fallbacks remain available.

## Accessibility & Inclusion

Meet WCAG 2.2 AA. Essential flows must work with keyboard, mouse, touch, and
assistive technology. Provide visible focus, semantic controls, reduced-motion
and forced-colors support, 44-pixel touch targets, non-color state labels, and
usable 200% reflow.
