import { z } from 'zod';

export const keyboardSoundProfileSchema = z.enum([
  'terminal',
  'soft-tap',
  'mechanical',
  'glass',
  'low-thock',
]);

export type KeyboardSoundProfile = z.infer<typeof keyboardSoundProfileSchema>;
export type KeyboardFeedbackEvent = 'input' | 'delete' | 'submit' | 'success' | 'reject';

export const keyboardSoundProfiles: ReadonlyArray<{
  id: KeyboardSoundProfile;
  label: string;
  description: string;
}> = [
  { id: 'terminal', label: 'Terminal', description: 'Short, clear electronic tick.' },
  { id: 'soft-tap', label: 'Soft tap', description: 'Quiet rounded tap.' },
  { id: 'mechanical', label: 'Mechanical', description: 'Crisp two-part key click.' },
  { id: 'glass', label: 'Glass', description: 'Light, bright glassy note.' },
  { id: 'low-thock', label: 'Low thock', description: 'Muted low-frequency key press.' },
];

export function feedbackFrequencies(
  profile: KeyboardSoundProfile,
  event: KeyboardFeedbackEvent,
): { frequencies: number[]; duration: number; wave: OscillatorType; gain: number } {
  const eventScale =
    event === 'success' ? 1.5 : event === 'reject' ? 0.63 : event === 'submit' ? 1.18 : 1;
  const profiles = {
    terminal: { frequencies: [300], duration: 0.055, wave: 'square', gain: 0.026 },
    'soft-tap': { frequencies: [215], duration: 0.045, wave: 'sine', gain: 0.035 },
    mechanical: { frequencies: [185, 420], duration: 0.04, wave: 'square', gain: 0.018 },
    glass: { frequencies: [620, 930], duration: 0.075, wave: 'sine', gain: 0.018 },
    'low-thock': { frequencies: [105, 155], duration: 0.065, wave: 'triangle', gain: 0.03 },
  } satisfies Record<
    KeyboardSoundProfile,
    { frequencies: number[]; duration: number; wave: OscillatorType; gain: number }
  >;
  const selected = profiles[profile];
  return {
    ...selected,
    frequencies: selected.frequencies.map((frequency) => frequency * eventScale),
  };
}

export function shouldUseHaptics(input: {
  enabled: boolean;
  pointerType: string;
  reducedEffects: boolean;
  vibrationAvailable: boolean;
}): boolean {
  return (
    input.enabled &&
    input.pointerType === 'touch' &&
    !input.reducedEffects &&
    input.vibrationAvailable
  );
}

export function isGuessRuleRejection(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';
  const message = error.message.toLowerCase();
  if (
    ['42501', '401', '403', 'UNAVAILABLE', 'NETWORK', 'INVALID_RESPONSE'].includes(code) ||
    /network|offline|authentication|sign in|permission|expected version|stale/.test(message)
  ) {
    return false;
  }
  return (
    ['22023', '23514', 'INVALID_GUESS', 'RULE_REJECTED'].includes(code) ||
    /invalid (?:guess|word)|not (?:an )?accepted word|must contain|hard mode|letter word|word length|cannot use|ruled out/.test(
      message,
    )
  );
}
