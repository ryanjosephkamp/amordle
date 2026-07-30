# Amordle physical keyboard navigation

Schema version: 1

Last reviewed: 2026-07-29

Authority: `src/config/keyboard-shortcuts.json`

Amordle remains fully usable with touch and pointer controls. This guide documents the optional physical-keyboard path for players who prefer to stay on the keys.

## Global navigation

Global navigation uses Shift chords so ordinary numbers and gameplay letters keep their normal meaning.

| Keys | Action | Behavior |
| --- | --- | --- |
| `Shift + 1` | Home | Open the Home route. |
| `Shift + 2` | Solo | Open Solo setup. |
| `Shift + 3` | Daily | Open the Daily calendar. |
| `Shift + 4` | COMBAT | Open COMBAT. |
| `Shift + 5` | Data | Open account History and data. |
| `Shift + M` | Menu | Open or close the main navigation menu. |

## Standard interaction

| Keys | Action | Behavior |
| --- | --- | --- |
| `Tab / Shift + Tab` | Move focus | Move forward or backward through available controls. |
| `Enter / Space` | Activate | Activate the focused button, link, tab, or menu item. |
| `Escape` | Close | Close the topmost menu or dialog and return focus to its trigger. |
| `A–Z` | Enter a letter | Type into the active game. Shift + M is reserved for the global Menu shortcut. |
| `Backspace / Delete` | Delete | Remove the final letter from the current guess. |
| `Enter` | Submit | Submit a complete current guess. |
| `Arrow keys` | Move within a control | Move through tabs, radio groups, menus, listboxes, and supported grids. |

## Operating rules

- Global Shift shortcuts do not run while typing in a text field, textarea, select, editable region, or modal dialog.
- Plain letters and numbers keep their ordinary meaning.
- Touch and pointer controls remain fully supported; physical-keyboard navigation is optional.

## Active-game behavior

- Letter keys enter the corresponding letter into the current guess.
- Backspace or Delete removes the final letter.
- Enter submits a complete guess.
- The on-screen keyboard and physical keyboard always share the same current-puzzle evidence.
- In GO, keyboard evidence resets at a puzzle transition and is rebuilt from the current board and any seeded rows rescored for that puzzle.
- `Shift + M` opens Menu instead of entering an uppercase M. A normal lowercase `m` continues to enter M.

## Menus, dialogs, and forms

- Tab and Shift+Tab move through interactive controls.
- Enter and Space activate focused controls.
- Arrow keys operate composite controls such as menus, tabs, radio groups, and listboxes.
- Escape closes the topmost transient surface and restores focus to its trigger.
- Global route shortcuts pause while a text field, textarea, select, editable region, or modal dialog owns focus.

## Maintenance contract

Update `src/config/keyboard-shortcuts.json` whenever a direct shortcut or documented keyboard pattern changes. Then run:

```sh
pnpm generate:keyboard-manual
pnpm verify:keyboard-manual
```

The application Help surface and both committed manuals consume the same registry. `pnpm check` fails if either manual drifts.
