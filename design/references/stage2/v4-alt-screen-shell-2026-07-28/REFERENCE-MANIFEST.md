# Alt-Screen TUI Shell v4

Status: implemented functional-shell authority.

The user replaced the pending v3 visual-approval workflow on 2026-07-28 with
an autonomous instruction to deliver a TUI-looking, fully functional shell and
defer other design options. This package records that narrower authority. It
does not claim that v4 is Amordle's permanent final art direction.

## Direction

Amordle is presented as one fullscreen, alternate-screen terminal application:

- a Mac Terminal-like titlebar, route path, textual navigation row, terminal
  buffer, and pinned status line;
- SF Mono-compatible system typography throughout visible product UI;
- inverse-video selection, aligned data rows, box-drawing rules, prompt
  markers, numbered game rows, a visible cursor, and rectangular terminal
  keys;
- one optional translucent root material, with no nested glass cards;
- code-native, semantic, mouse-, touch-, keyboard-, and assistive-technology
  operation. Typed commands are never required.

The detailed binding rules are in `DESIGN.md`.

## Concept provenance

The directional planning concept remains outside the repository because it was
generated before the implementation checkpoint:

| Field      | Value                                                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Path       | `/Users/noir/.codex/generated_images/019fa428-4efe-7e50-9314-cc34fd5e910b/call_eseSA1Asdu1GcfqBEQilO5Uq.png`                             |
| SHA-256    | `6a451804bd8371e8cab7b4695c0347bdd5c6f3e6de1b1b7b421623ced96280e4`                                                                       |
| Dimensions | 1536 × 1024                                                                                                                              |
| Provenance | OpenAI Image Gen planning concept, 2026-07-28                                                                                            |
| Role       | Directional authority for shell grammar, typography, selection, board numbering, cursor, keyboard, mobile translation, and anti-patterns |

The concept's example words, statistics, dates, and account state are not
product data and are not implementation authority.

## Retained behavior

The v4 work changes presentation only. It does not change game rules,
controllers, persistence envelopes, word selection, Auth, Supabase, Realtime,
Blob publication, APIs, routes, migrations, or service authority.

## Evidence

- `pnpm test:visual` captures the shell at 320, 360, 390, 412, 768, 960, 1440,
  and 1920 widths.
- The professional matrix adds system light/dark, reduced motion, forced
  colors, 200% zoom, Home, Solo, Daily, COMBAT, account/data, Word Explorer,
  support, and exceptional states.
- The v4 structural test proves the titlebar, path rail, inverse command row,
  ruled regions, numbered game rows, mobile game menu, unobstructed keyboard,
  and status line.
- `fidelity-ledger.json` records the concept-to-browser comparison and
  intentional deviations.
