export const uppercaseLetters = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z',
] as const;

export type UppercaseLetter = (typeof uppercaseLetters)[number];
export type KeyboardCommand = UppercaseLetter | 'ENTER' | 'BACKSPACE';
export type KeyboardKeyKind = 'letter' | 'enter' | 'backspace';
export type KeyboardKeyId = string;

export interface KeyboardKeySpec {
  readonly id: KeyboardKeyId;
  readonly command: KeyboardCommand;
  readonly kind: KeyboardKeyKind;
  readonly legend: string;
  readonly accessibleLabel: string;
  readonly widthUnits: number;
  readonly tactileMarker?: 'home';
}

export interface KeyboardRowSpec {
  readonly id: string;
  readonly offsetUnits: number;
  readonly keys: readonly KeyboardKeySpec[];
}

export interface KeyboardLayoutDefinition {
  readonly id: string;
  readonly version: 1;
  readonly label: string;
  readonly rows: readonly KeyboardRowSpec[];
}

const letterSet = new Set<string>(uppercaseLetters);
const requiredCommands = new Set<KeyboardCommand>([...uppercaseLetters, 'ENTER', 'BACKSPACE']);

export function isUppercaseLetter(value: string): value is UppercaseLetter {
  return letterSet.has(value);
}

export function validateKeyboardLayout(layout: KeyboardLayoutDefinition): readonly string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const rowIds = new Set<string>();
  const commands = new Set<KeyboardCommand>();

  if (!layout.id.trim()) errors.push('Layout id is required.');
  if (!layout.label.trim()) errors.push('Layout label is required.');
  if (layout.version !== 1) errors.push('Layout version must be 1.');
  if (layout.rows.length < 1 || layout.rows.length > 6)
    errors.push('Layout must contain between 1 and 6 rows.');

  for (const row of layout.rows) {
    if (!row.id.trim()) errors.push('Every row needs a stable id.');
    if (rowIds.has(row.id)) errors.push(`Duplicate row id: ${row.id}.`);
    rowIds.add(row.id);
    if (!Number.isFinite(row.offsetUnits) || row.offsetUnits < -3 || row.offsetUnits > 3) {
      errors.push(`Row ${row.id} offset must be between -3 and 3 units.`);
    }
    if (row.keys.length < 1 || row.keys.length > 16)
      errors.push(`Row ${row.id} must contain between 1 and 16 keys.`);

    for (const key of row.keys) {
      if (!key.id.trim()) errors.push('Every key needs a stable id.');
      if (ids.has(key.id)) errors.push(`Duplicate key id: ${key.id}.`);
      ids.add(key.id);
      if (commands.has(key.command)) errors.push(`Duplicate command: ${key.command}.`);
      commands.add(key.command);
      if (!Number.isFinite(key.widthUnits) || key.widthUnits < 0.75 || key.widthUnits > 3) {
        errors.push(`Key ${key.id} width must be between 0.75 and 3 units.`);
      }
      if (key.kind === 'letter' && !isUppercaseLetter(key.command)) {
        errors.push(`Letter key ${key.id} must use an A-Z command.`);
      }
      if (key.kind === 'enter' && key.command !== 'ENTER') {
        errors.push(`Enter key ${key.id} must use the ENTER command.`);
      }
      if (key.kind === 'backspace' && key.command !== 'BACKSPACE') {
        errors.push(`Backspace key ${key.id} must use the BACKSPACE command.`);
      }
    }
  }

  for (const command of requiredCommands) {
    if (!commands.has(command)) errors.push(`Missing command: ${command}.`);
  }
  for (const command of commands) {
    if (!requiredCommands.has(command)) errors.push(`Unsupported command: ${command}.`);
  }

  return errors;
}

export function defineKeyboardLayout(layout: KeyboardLayoutDefinition): KeyboardLayoutDefinition {
  const errors = validateKeyboardLayout(layout);
  if (errors.length > 0) throw new Error(`Invalid keyboard layout: ${errors.join(' ')}`);
  return layout;
}

function letterKey(letter: UppercaseLetter): KeyboardKeySpec {
  return {
    id: `letter-${letter.toLowerCase()}`,
    command: letter,
    kind: 'letter',
    legend: letter,
    accessibleLabel: letter,
    widthUnits: 1,
    ...(letter === 'F' || letter === 'J' ? { tactileMarker: 'home' as const } : {}),
  };
}

function letterRow(id: string, letters: string, offsetUnits: number): KeyboardRowSpec {
  return {
    id,
    offsetUnits,
    keys: [...letters].map((letter) => letterKey(letter as UppercaseLetter)),
  };
}

export const qwertyLayout = defineKeyboardLayout({
  id: 'qwerty-v1',
  version: 1,
  label: 'QWERTY',
  rows: [
    letterRow('top', 'QWERTYUIOP', 0),
    letterRow('home', 'ASDFGHJKL', 0.42),
    {
      id: 'bottom',
      offsetUnits: 0,
      keys: [
        {
          id: 'action-enter',
          command: 'ENTER',
          kind: 'enter',
          legend: 'Enter',
          accessibleLabel: 'Enter',
          widthUnits: 1.55,
        },
        ...[...'ZXCVBNM'].map((letter) => letterKey(letter as UppercaseLetter)),
        {
          id: 'action-backspace',
          command: 'BACKSPACE',
          kind: 'backspace',
          legend: 'Backspace',
          accessibleLabel: 'Backspace',
          widthUnits: 1.55,
        },
      ],
    },
  ],
});
