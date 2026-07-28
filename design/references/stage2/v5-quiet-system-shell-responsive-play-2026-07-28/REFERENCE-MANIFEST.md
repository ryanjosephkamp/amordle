# v5 Quiet System Shell and Responsive Play

Status: active implementation authority.

This package records the user-directed correction to Alt-Screen v4. It is a
code-native refinement package, not an Image Gen concept set. The existing v1,
v2, v3, and v4 packages remain unchanged as provenance.

## Binding decisions

1. Remove the decorative macOS window reconstruction: traffic lights, faux
   titlebar, outer window border, drop shadow, and wallpaper.
2. Preserve the approved SF Mono stack, semantic palette, prompt markers,
   inverse selection, aligned terminal rows, and restrained TUI density.
3. Use one 48-pixel desktop toolbar. Mobile non-game routes use a 44-pixel
   toolbar plus a compact 40-pixel route rail. Active games use only the
   44-pixel toolbar.
4. Active games are contained `100dvh` surfaces. Board history scrolls
   internally; the document and keyboard do not.
5. The supported entry-fit floor is 320×568 portrait and 568×320 landscape.
6. COMBAT uses one chronological actor-labelled transcript with six initial
   rows and internal growth.
7. Calendar uses a horizontal 35-day rail and progressive disclosure.
8. Ordinary content uses open sections; bordered panes are reserved for real
   containment.

## Representative states

- Home and the shared adaptive shell.
- Solo OG and GO with empty, active, continued, and terminal histories.
- COMBAT waiting, playing, recovery, terminal, and read-only projections.
- Daily Calendar selection, locked purchase confirmation, and completion.
- Dense account/data/support routes through the shared open-section grammar.

## Responsive evidence matrix

Portrait: 320×568, 360×640, 390×667, 390×844, 412×915, and 768×1024.

Landscape: 568×320, 667×390, and 844×390.

Extended checks: 960, 1440, and 1920 widths; 200% zoom; system light/dark;
reduced motion; forced colors; keyboard, pointer, and touch.

## Anti-references

Faux macOS window chrome, decorative traffic lights, framed desktop mockups,
fixed mobile bottom navigation during play, generic card grids, nested glass,
scanlines, CRT effects, neon spectacle, code rain, and fake command spam.
