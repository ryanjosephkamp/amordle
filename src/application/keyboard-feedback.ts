'use client';

import { feedbackFrequencies } from '@/domain/feedback';
import type { KeyboardFeedbackEvent, KeyboardSoundProfile } from '@/domain/feedback';

let sharedContext: AudioContext | null = null;
let activeVoices = 0;
const maximumVoices = 5;

function audioContextConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const browserWindow = window as typeof window & {
    webkitAudioContext?: typeof AudioContext;
  };
  return browserWindow.AudioContext ?? browserWindow.webkitAudioContext ?? null;
}

export async function playKeyboardSound(
  profile: KeyboardSoundProfile,
  event: KeyboardFeedbackEvent,
): Promise<boolean> {
  const AudioContextConstructor = audioContextConstructor();
  if (!AudioContextConstructor || activeVoices >= maximumVoices) return false;
  try {
    const context = sharedContext ?? new AudioContextConstructor({ latencyHint: 'interactive' });
    sharedContext = context;
    if (context.state !== 'running') await context.resume();
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

export function eligibleHapticControl(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const control = target.closest<HTMLElement>(
    'button, [role="button"], [role="menuitem"], summary, a',
  );
  if (!control || control.matches(':disabled, [aria-disabled="true"]')) return null;
  if (control.matches('button, [role="button"], [role="menuitem"], summary')) return control;
  if (
    control.matches(
      'nav a, .menu-popover a, a.primary, a.secondary, a.button, a[class*="button"], .action-row a',
    )
  ) {
    return control;
  }
  return null;
}
