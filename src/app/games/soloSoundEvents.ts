import type { KeyboardInput } from '../../game'
import type { SoundEvent } from '../../sound'

export function getSoloInputSoundEvents(input: KeyboardInput): readonly SoundEvent[] {
  return input.type === 'submit' ? [] : ['keyboard-click']
}

export function getSoloSubmitSoundEvents({
  solved,
  validationFailed,
}: {
  readonly solved: boolean
  readonly validationFailed: boolean
}): readonly SoundEvent[] {
  if (validationFailed) {
    return ['invalid-guess']
  }

  return solved ? ['tile-flip', 'correct-guess'] : ['tile-flip']
}
