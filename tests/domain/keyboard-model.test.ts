import { describe, expect, it } from 'vitest';
import {
  defineKeyboardLayout,
  qwertyLayout,
  uppercaseLetters,
  validateKeyboardLayout,
} from '../../src/components/keyboard/keyboard-model';

describe('keyboard layout model', () => {
  it('defines one stable key object for every required command', () => {
    const keys = qwertyLayout.rows.flatMap((row) => row.keys);
    expect(validateKeyboardLayout(qwertyLayout)).toEqual([]);
    expect(keys.map((key) => key.command).toSorted()).toEqual(
      [...uppercaseLetters, 'ENTER', 'BACKSPACE'].toSorted(),
    );
    expect(new Set(keys.map((key) => key.id)).size).toBe(keys.length);
  });

  it('rejects missing commands and duplicate stable ids', () => {
    const firstRow = qwertyLayout.rows[0]!;
    const invalid = {
      ...qwertyLayout,
      id: 'invalid-test-v1',
      rows: [
        { ...firstRow, keys: firstRow.keys.slice(1) },
        {
          ...qwertyLayout.rows[1]!,
          keys: qwertyLayout.rows[1]!.keys.map((key, index) =>
            index === 0 ? { ...key, id: firstRow.keys[1]!.id } : key,
          ),
        },
        qwertyLayout.rows[2]!,
      ],
    };

    expect(validateKeyboardLayout(invalid)).toEqual(
      expect.arrayContaining(['Missing command: Q.', `Duplicate key id: ${firstRow.keys[1]!.id}.`]),
    );
    expect(() => defineKeyboardLayout(invalid)).toThrow('Invalid keyboard layout');
  });
});
