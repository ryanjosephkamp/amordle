import { Button as AriaButton } from 'react-aria-components';
import { Icon } from '../Icon';
import type { TileState } from '../gameBoardData';
import styles from './Keyboard.module.css';
import type {
  KeyboardCommand,
  KeyboardKeyId,
  KeyboardKeySpec,
  KeyboardLayoutDefinition,
} from './keyboard-model';
import { qwertyLayout } from './keyboard-model';
import { keyboardThemes, type KeyboardThemeId } from './keyboard-theme';

export type KeyboardEffectName = 'press-glint';

export interface KeyboardVisualCue {
  readonly id: string;
  readonly effect: KeyboardEffectName;
  readonly targets: readonly KeyboardKeyId[];
  readonly sequenceIndex?: number;
}

export interface KeyboardProps {
  readonly layout?: KeyboardLayoutDefinition;
  readonly theme?: KeyboardThemeId;
  readonly evidence?: Readonly<Record<string, TileState>>;
  readonly pressedKeys?: ReadonlySet<KeyboardCommand>;
  readonly disabled?: boolean;
  readonly cues?: readonly KeyboardVisualCue[];
  readonly onCommand: (command: KeyboardCommand) => boolean;
}

const keyboardStatePriority: Readonly<Record<TileState, number>> = {
  empty: 0,
  draft: 0,
  absent: 1,
  present: 2,
  correct: 3,
  removed: 4,
};

function normalizeKeyboardEvidence(
  evidence: Readonly<Record<string, TileState>>,
): Readonly<Record<string, TileState>> {
  const normalized: Record<string, TileState> = {};
  for (const [rawLetter, state] of Object.entries(evidence)) {
    const letter = rawLetter.toUpperCase();
    const prior = normalized[letter] ?? 'empty';
    if (keyboardStatePriority[state] > keyboardStatePriority[prior]) normalized[letter] = state;
  }
  return normalized;
}

function Keycap({
  spec,
  state,
  keyboardDisabled,
  physicallyPressed,
  cue,
  onCommand,
}: {
  spec: KeyboardKeySpec;
  state: TileState;
  keyboardDisabled: boolean;
  physicallyPressed: boolean;
  cue?: KeyboardVisualCue;
  onCommand: (command: KeyboardCommand) => boolean;
}) {
  const disabled = keyboardDisabled || state === 'removed';
  const accessibleLabel = `${spec.accessibleLabel}${state !== 'empty' ? `, ${state}` : ''}`;

  return (
    <AriaButton
      className={`${styles.keycap} key key--${state} ${physicallyPressed ? 'is-pressed' : ''}`}
      style={{ '--key-width': spec.widthUnits } as React.CSSProperties}
      isDisabled={disabled}
      onPress={() => onCommand(spec.command)}
      aria-label={accessibleLabel}
      data-key={spec.command}
      data-key-id={spec.id}
      data-key-kind={spec.kind}
      data-state={state}
      data-pressed={physicallyPressed ? 'true' : undefined}
      data-physical-pressed={physicallyPressed ? 'true' : undefined}
      data-effect={cue?.effect}
      data-effect-sequence={cue?.sequenceIndex}
    >
      <span className={styles.underbody} aria-hidden="true" />
      <span className={styles.face} aria-hidden="true" />
      <span className={styles.legend} aria-hidden="true">
        {spec.kind === 'backspace' ? <Icon name="backspace" /> : spec.legend}
        {spec.tactileMarker === 'home' ? <span className={styles.tactileMarker} /> : null}
      </span>
      <span className={styles.effectSurface} aria-hidden="true" data-effect-surface="true" />
    </AriaButton>
  );
}

export function Keyboard({
  layout = qwertyLayout,
  theme = 'thermal-deck-v1',
  evidence = {},
  pressedKeys,
  disabled = false,
  cues = [],
  onCommand,
}: KeyboardProps) {
  const normalizedEvidence = normalizeKeyboardEvidence(evidence);
  const themeDefinition = keyboardThemes[theme];

  return (
    <div
      className={`keyboard ${styles.keyboard} ${themeDefinition.className}`}
      role="group"
      aria-label={`${layout.label} game keyboard`}
      data-keyboard-layout={layout.id}
      data-keyboard-theme={themeDefinition.id}
      data-motion-profile={themeDefinition.motionProfile}
    >
      {layout.rows.map((row) => (
        <div
          className={`keyboard__row ${styles.row}`}
          key={row.id}
          data-keyboard-row={row.id}
          style={{ '--row-offset': row.offsetUnits } as React.CSSProperties}
        >
          {row.keys.map((spec) => {
            const state =
              spec.kind === 'letter' ? (normalizedEvidence[spec.command] ?? 'empty') : 'empty';
            const cue = cues.find((candidate) => candidate.targets.includes(spec.id));
            return (
              <Keycap
                key={spec.id}
                spec={spec}
                state={state}
                keyboardDisabled={disabled}
                physicallyPressed={pressedKeys?.has(spec.command) ?? false}
                {...(cue ? { cue } : {})}
                onCommand={onCommand}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
