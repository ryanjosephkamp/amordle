# Amordle Terminal Product Brief

Status: direction for implementation planning, not a pixel-locked design spec

## Product

Amordle is a hosted Wordle-variant platform combining Solo games, Daily games,
competitive and cooperative multiplayer, public activity, profiles,
progression, and deep statistics.

The first delivery goal is complete, proven shell functionality on a coherent
terminal foundation. A second delivery stage deepens visual and editorial
polish without changing the rules or service contracts.

## Experience

The application should feel like a polished terminal tool without requiring
terminal knowledge:

- monospace-led, text-forward hierarchy;
- precise panels, prompts, status lines, tables, menus, and shortcuts;
- restrained color and subtle glass depth;
- fast, direct feedback;
- limited ornament;
- no cyberpunk atmosphere, neon spectacle, decorative texture, excessive
  gradients, heavy shadows, or theatrical 3D effects.

Use macOS Terminal and Grok Build as mood references. Use Lichess as an
information-architecture reference, not a visual template.

## Information architecture

- Desktop uses top navigation and clear menus for Play, Daily, COMBAT,
  Community/data, and account tools.
- Mobile uses an ergonomic bottom navigation when it improves reachability.
- The active game is always the visual and interaction priority.
- Contextual information may surround gameplay but may not push the board or
  keyboard out of the usable viewport.
- Long boards, long words, GO evidence, tables, and histories scroll inside
  controlled regions.
- Leaderboards, Stats, History, profiles, results, and match metadata should be
  information-rich and easy to scan.

## Interaction

- Every important action has accessible keyboard, mouse, and touch operation.
- Keyboard shortcuts are discoverable and never replace ordinary controls.
- The on-screen keyboard remains lightweight, responsive, evidence-aware,
  sound-aware, and modular for later layouts and themes.
- One visible focus model, clear status announcements, 44-pixel touch targets,
  reduced motion, forced colors, and 200% reflow are required.

## Voice

Write like a thoughtful human:

- explain what happened;
- say what the player can do next;
- avoid blame;
- avoid legalistic or implementation-facing terms;
- keep useful detail while making sentences natural and concise.

Words such as namespace, projection, authority, capability boundary, durable
reread, sanctioned identity, and fallback required do not belong in normal UI.

## Technical planning baseline

Reverify official stable versions before implementation. The preparation
snapshot is:

- Node 24 LTS and pnpm 11;
- Next.js 16.2 App Router;
- React 19.2 and strict TypeScript;
- shadcn/ui source components and Tailwind CSS;
- Supabase JS, generated database types, TanStack Query, and Zod;
- Vitest Browser Mode with Playwright, fast-check, Playwright E2E, and axe.

Use Impeccable during visual planning and review. Prefer familiar interaction
patterns, strong hierarchy, purposeful density, restrained materials, complete
loading/empty/error states, and accessible tables over generic dashboard
decoration.

## Delivery stages

### Stage 1: functional terminal foundation

- Implement every functional-contract item.
- Establish pure domains, typed service adapters, real authentication,
  persistence, matchmaking, multiplayer, test authority, and cleanup.
- Deliver an acceptable responsive terminal interface.
- Prove functionality through protected hosted E2E.

### Stage 2: visual and editorial polish

- Refine typography, navigation, terminal materials, data visualization,
  motion, copy, responsive composition, and accessibility.
- Compare recurring screenshots against the approved reference manifest.
- Preserve all Stage 1 behavior and test evidence.
