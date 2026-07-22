import styles from './Keyboard.module.css';

export type KeyboardThemeId = 'thermal-deck-v1';

export interface KeyboardThemeDefinition {
  readonly id: KeyboardThemeId;
  readonly className: string;
  readonly motionProfile: 'restrained';
}

export const keyboardThemes: Readonly<Record<KeyboardThemeId, KeyboardThemeDefinition>> = {
  'thermal-deck-v1': {
    id: 'thermal-deck-v1',
    className: styles.thermalDeck!,
    motionProfile: 'restrained',
  },
};
