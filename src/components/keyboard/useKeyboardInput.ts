import { useEffect, useEffectEvent, useState } from 'react';
import type { KeyboardCommand } from './keyboard-model';
import { isUppercaseLetter } from './keyboard-model';

const emptyPressedKeys: ReadonlySet<KeyboardCommand> = new Set();

export function keyboardCommandFromKey(key: string): KeyboardCommand | undefined {
  if (key === 'Enter') return 'ENTER';
  if (key === 'Backspace' || key === 'Delete') return 'BACKSPACE';
  const letter = key.toUpperCase();
  return key.length === 1 && isUppercaseLetter(letter) ? letter : undefined;
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function useKeyboardInput({
  disabled = false,
  onCommand,
}: {
  disabled?: boolean;
  onCommand: (command: KeyboardCommand) => boolean;
}): ReadonlySet<KeyboardCommand> {
  const [pressedKeys, setPressedKeys] = useState<ReadonlySet<KeyboardCommand>>(emptyPressedKeys);
  const dispatchCommand = useEffectEvent(onCommand);

  useEffect(() => {
    if (!disabled) return;
    queueMicrotask(() => setPressedKeys(emptyPressedKeys));
  }, [disabled]);

  useEffect(() => {
    const press = (event: KeyboardEvent) => {
      if (
        disabled ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isEditableTarget(event.target)
      )
        return;
      const command = keyboardCommandFromKey(event.key);
      if (!command) return;
      event.preventDefault();
      if (!dispatchCommand(command)) return;
      setPressedKeys((current) => {
        if (current.has(command)) return current;
        const next = new Set(current);
        next.add(command);
        return next;
      });
    };
    const release = (event: KeyboardEvent) => {
      const command = keyboardCommandFromKey(event.key);
      if (!command) return;
      setPressedKeys((current) => {
        if (!current.has(command)) return current;
        const next = new Set(current);
        next.delete(command);
        return next.size === 0 ? emptyPressedKeys : next;
      });
    };
    const clear = () => setPressedKeys(emptyPressedKeys);

    window.addEventListener('keydown', press);
    window.addEventListener('keyup', release);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', press);
      window.removeEventListener('keyup', release);
      window.removeEventListener('blur', clear);
    };
  }, [disabled]);

  return disabled ? emptyPressedKeys : pressedKeys;
}
