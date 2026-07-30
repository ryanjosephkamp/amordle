import shortcutRegistry from '@/config/keyboard-shortcuts.json';

export type DirectNavigationShortcut = (typeof shortcutRegistry.direct)[number];

export const directNavigationShortcuts = shortcutRegistry.direct;
export const keyboardInteractionPatterns = shortcutRegistry.patterns;
export const keyboardShortcutRules = shortcutRegistry.rules;

export function matchDirectNavigationShortcut(event: {
  code: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  repeat: boolean;
}): DirectNavigationShortcut | null {
  if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || event.repeat) {
    return null;
  }
  return directNavigationShortcuts.find((shortcut) => shortcut.code === event.code) ?? null;
}

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]',
    ),
  );
}

export function hasActiveModal(): boolean {
  return Boolean(document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]'));
}
