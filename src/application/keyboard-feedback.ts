'use client';

import { feedbackFrequencies } from '@/domain/feedback';
import type { KeyboardFeedbackEvent, KeyboardSoundProfile } from '@/domain/feedback';

let sharedContext: AudioContext | null = null;
let activeVoices = 0;
const maximumVoices = 5;

export async function playKeyboardSound(
  profile: KeyboardSoundProfile,
  event: KeyboardFeedbackEvent,
): Promise<boolean> {
  if (typeof AudioContext === 'undefined' || activeVoices >= maximumVoices) return false;
  try {
    const context = sharedContext ?? new AudioContext({ latencyHint: 'interactive' });
    sharedContext = context;
    if (context.state === 'suspended') await context.resume();
    if (context.state !== 'running') return false;
    const specification = feedbackFrequencies(profile, event);
    const startedAt = context.currentTime;
    activeVoices += 1;
    specification.frequencies.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = specification.wave;
      oscillator.frequency.setValueAtTime(frequency, startedAt);
      gain.gain.setValueAtTime(specification.gain / (index + 1), startedAt);
      gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + specification.duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(startedAt + index * 0.004);
      oscillator.stop(startedAt + specification.duration + index * 0.004);
      oscillator.addEventListener(
        'ended',
        () => {
          oscillator.disconnect();
          gain.disconnect();
          if (index === 0) activeVoices = Math.max(0, activeVoices - 1);
        },
        { once: true },
      );
    });
    return true;
  } catch {
    return false;
  }
}

export function playKeyboardHaptic(input: {
  enabled: boolean;
  pointerType: string;
  reducedEffects: boolean;
}): boolean {
  if (
    !input.enabled ||
    input.pointerType !== 'touch' ||
    input.reducedEffects ||
    typeof navigator === 'undefined' ||
    typeof navigator.vibrate !== 'function'
  ) {
    return false;
  }
  try {
    return navigator.vibrate(8);
  } catch {
    return false;
  }
}
