import type { ConsumableEffects, ConsumableType } from '../progression'
import { Button, Panel } from '../ui'

export interface PracticeConsumableControlsProps {
  readonly consumables: Readonly<Record<ConsumableType, number>>
  readonly disabled?: boolean
  readonly effects: ConsumableEffects
  readonly onUse: (type: ConsumableType) => void
}

export function PracticeConsumableControls({ consumables, disabled = false, effects, onUse }: PracticeConsumableControlsProps) {
  return (
    <Panel className="space-y-3" tone="muted">
      <div>
        <h3 className="font-bold text-white">Solo Practice tools</h3>
        <p className="text-sm text-slate-300">Inventory is consumed only when a tool can affect this puzzle.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={disabled || consumables.revealOneLetter < 1} onClick={() => onUse('revealOneLetter')} variant="secondary">
          Reveal letter ({consumables.revealOneLetter})
        </Button>
        <Button disabled={disabled || consumables.removeIncorrectLetters < 1} onClick={() => onUse('removeIncorrectLetters')} variant="secondary">
          Remove incorrect letters ({consumables.removeIncorrectLetters})
        </Button>
      </div>
      {effects.revealedHints.length > 0 ? (
        <p className="text-sm text-cyan-100">
          Revealed: {effects.revealedHints.map((hint) => `${hint.index + 1}: ${hint.letter.toLocaleUpperCase('en-US')}`).join(', ')}
        </p>
      ) : null}
    </Panel>
  )
}
