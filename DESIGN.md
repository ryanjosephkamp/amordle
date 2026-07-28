# Amordle Alt-Screen TUI Shell

Status: the user authorized the literal Alt-Screen TUI shell on 2026-07-28 as
the active presentation authority. It supersedes Quiet Workbench v2 and the
unapproved macOS Liquid Terminal v3 proposal. Those packages remain immutable
provenance under `design/references/stage2/`; neither remains binding.

This authority is intentionally a fully functional shell, not a final promise
about Amordle's eventual visual identity. Future design exploration may replace
it without changing the working game or service architecture.

## Scene and thesis

A player opens Amordle in a browser and immediately reads it as a polished,
fullscreen terminal application. The interface uses the spatial grammar of a
modern alternate-screen TUI—path lines, inverse-video selection, aligned rows,
rules, prompts, and pinned status—while every action remains clickable,
touchable, screen-reader legible, and understandable without terminal
experience.

The browser contains one Mac Terminal-like window. The window may use subtle
translucency and blur; its content does not use nested glass. Hierarchy comes
from alignment and selection, not cards, capsules, or decorative panels.

## Typography and palette

- Use `ui-monospace`, `SFMono-Regular`, `"SF Mono"`, Menlo, Monaco, Consolas,
  and the bundled Geist Mono as the fallback sequence. Do not redistribute
  Apple font files.
- Use the monospace stack throughout visible product UI, including controls,
  prose, forms, boards, tables, prompts, and status.
- Follow the system light/dark preference. Dark mode is a restrained graphite
  terminal; light mode is an opaque, high-contrast Terminal Basic translation.
- Cyan marks focus and the current prompt. Green, amber, slate, and red retain
  their semantic game and error roles. Color never carries meaning alone.

## Shell grammar

- Desktop: one Terminal-like window with a thin titlebar, decorative traffic
  lights, route path, textual navigation row, terminal buffer, and status line.
- Mobile: an edge-to-edge terminal viewport. Non-game routes use a compact
  textual route rail; active games keep only the menu and status line so the
  board and keyboard remain unobstructed.
- Current selection uses inverse video. Hover and keyboard focus use the same
  component vocabulary.
- Work regions use box-drawing corners and rules. Forms, lists, tables, game
  panes, empty states, errors, and dialogs remain part of the same buffer
  instead of becoming detached cards.
- Prompts and shortcut notation are visual and informational. Typed commands
  are never required.

## Gameplay grammar

- Solo and COMBAT use numbered rows, contiguous fixed-width cells, a visible
  active cursor, a compact evidence line, rectangular terminal keys, and terse
  status facts.
- Board state remains readable by symbol and text as well as color.
- The game controller, physical keyboard input, on-screen keyboard, Focus Mode,
  persistence, sound, sharing, definitions, timers, polling, Realtime
  invalidation, and recovery behavior remain unchanged.

## Component rules

- Controls have default, hover, focus, active, disabled, loading, error, and
  selected states where applicable.
- Use square or two-pixel corners. Full pills and segmented capsules are not
  part of this shell.
- Use 44-pixel minimum touch targets even when controls visually resemble TUI
  rows or keys.
- Use standard semantic HTML underneath the visual grammar. Box-drawing glyphs
  are decorative and hidden from assistive technology where appropriate.
- Forced colors removes translucency, background effects, and decorative
  traffic lights. Reduced motion disables the cursor blink.

## Prohibited presentation

Do not add generic SaaS cards, glossy glass widgets, app-style segmented
navigation, floating inspectors, giant marketing headings, cyberpunk effects,
Matrix imagery, scanlines, CRT distortion, code rain, excessive glow, fake
command output, or terminal-only interaction.

## Behavioral boundary

This authority is presentation-only. The 237 requirements, route URLs, three
HTTP interfaces, domain rules, persistence envelopes, Supabase adapters and
RPCs, word-list loading boundaries, 45 migrations, and immutable bootstrap
baseline remain unchanged.
