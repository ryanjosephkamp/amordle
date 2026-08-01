import { describe, expect, it } from 'vitest';
import {
  feedbackFrequencies,
  keyboardSoundProfileSchema,
  shouldUseHaptics,
} from '@/domain/feedback';

describe('keyboard feedback', () => {
  it('defines five bounded code-generated sound profiles', () => {
    for (const profile of ['terminal', 'soft-tap', 'mechanical', 'glass', 'low-thock']) {
      const parsed = keyboardSoundProfileSchema.parse(profile);
      const specification = feedbackFrequencies(parsed, 'input');
      expect(specification.frequencies.length).toBeGreaterThan(0);
      expect(specification.duration).toBeLessThanOrEqual(0.075);
      expect(specification.gain).toBeLessThanOrEqual(0.035);
    }
  });

  it('keeps success and rejection cues distinct without changing profile identity', () => {
    expect(feedbackFrequencies('terminal', 'success').frequencies).not.toEqual(
      feedbackFrequencies('terminal', 'reject').frequencies,
    );
  });

  it('allows haptics only for explicit touch input when effects are not reduced', () => {
    expect(
      shouldUseHaptics({
        enabled: true,
        pointerType: 'touch',
        reducedEffects: false,
        vibrationAvailable: true,
      }),
    ).toBe(true);
    for (const input of [
      { enabled: false, pointerType: 'touch', reducedEffects: false, vibrationAvailable: true },
      { enabled: true, pointerType: 'mouse', reducedEffects: false, vibrationAvailable: true },
      { enabled: true, pointerType: 'touch', reducedEffects: true, vibrationAvailable: true },
      { enabled: true, pointerType: 'touch', reducedEffects: false, vibrationAvailable: false },
    ]) {
      expect(shouldUseHaptics(input)).toBe(false);
    }
  });
});
