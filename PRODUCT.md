# Amordle Product Direction

## Product

Amordle is a polished, competitive word-game platform for people who want more
depth, continuity, and social play than a single daily Wordle puzzle. It combines
OG and GO word puzzles, Daily and Practice play, multiplayer COMBAT, ratings,
profiles, history, statistics, discovery, progression, and community-facing
surfaces in one coherent application.

The long-term product analogy is **the Lichess of Wordle**: a fast, trustworthy,
free-feeling place where a player can arrive, immediately play the exact word-game
variant they want, find a rival, follow ongoing games, inspect meaningful results,
and build a durable public identity.

## Target users

- New players who need a clear path into OG, GO, Daily, and multiplayer play.
- Returning players who expect their sessions, history, preferences, and profile
  to restore reliably.
- Competitive players who want ranked matchmaking, ratings, leaderboards,
  rematches, statistics, and legible postgame analysis.
- Spectators and community participants who want safe, readable public game and
  profile views.
- Power users who value keyboard efficiency, high information density, and
  predictable state transitions.

## Primary purpose

The interface must make the next meaningful action obvious and keep the game
itself dominant. The application should feel dependable, intentional, dense
without being cramped, and professional without becoming generic.

## Personality

- Graphite, fire, and ice.
- Competitive, composed, and exact.
- Editorial rather than ornamental.
- Dense where information has value; quiet where focus matters.
- Human and direct in its language.
- Fast and tactile in gameplay.

## Product principles

1. **The game is the hero.** The board, active status, clock, and keyboard receive
   the strongest spatial priority during play.
2. **State must be honest.** Searching, waiting, saving, rejected, cancelled,
   active, and terminal states must never flicker, contradict one another, or hide
   durable backend outcomes.
3. **Technical authority stays backstage.** Privacy and authority guarantees are
   enforced by the implementation and explained in Help when useful, not repeated
   as developer-facing prose in normal gameplay.
4. **Competitive identity matters.** Sanctioned names, avatars, profile links,
   ratings, variant records, and recent activity should connect multiplayer,
   results, leaderboards, and profiles.
5. **Density must be useful.** Prefer compact, scannable tables, cards, and
   controls over large empty panels or tiny isolated numbers.
6. **Responsive means recomposed.** Mobile is not a squeezed desktop. Critical
   content remains visible, touchable, and ordered around the active task.
7. **Accessibility is structural.** Keyboard and touch parity, semantic controls,
   visible focus, announcements, reduced motion, forced colors, and 200% reflow
   are acceptance requirements.
8. **Privacy is non-negotiable.** Public projections never expose email, raw Auth
   identifiers, active answers, private sessions, seeds, or service secrets.

## Anti-references

Amordle must not feel like:

- an AI-generated dashboard assembled from interchangeable cards;
- a developer console containing words such as “projection,” “namespace,”
  “capability boundary,” or “authoritative command” in primary user flows;
- a decorative poster with excessive peripheral rails and a shrunken game;
- a sparse proof-of-concept that leaves leaderboards, profiles, results, or stats
  visually empty;
- a flashing polling interface whose buttons change state every second;
- a copy of Lichess, Wordle, Adobe Spectrum, or the accepted shell’s visual design.

## Design-system direction

Amordle will continue to use code-native boards, tiles, keyboards, atmospheric
backgrounds, and game-specific visualizations. React Spectrum 2 is a candidate
foundation for the later redesign of application chrome and data-heavy surfaces:
navigation, tabs, forms, dialogs, menus, tables, search, status, toasts, profile
metadata, and responsive disclosures.

Adoption must be incremental and measured against bundle, performance,
accessibility, and visual-fidelity budgets. Spectrum primitives should be themed
into Amordle’s graphite/fire/ice language rather than importing Adobe’s visual
identity wholesale. The existing React Aria component layer remains a valid
foundation for bespoke game controls.

## Current delivery sequence

1. **Part 1 — reliability and polish:** repair known functional defects, replace
   robotic wording, and correct gameplay/layout problems without undertaking the
   full redesign.
2. **Part 2 — Lichess-of-Wordle redesign:** establish the final information
   architecture and design tokens, prototype the main gameplay and community
   surfaces, then migrate route families behind explicit visual and functional
   acceptance gates.

The transition between parts requires a green, real-service-tested Part 1
checkpoint. Production release, merge, and the separate modular-keyboard project
remain independent approvals.
