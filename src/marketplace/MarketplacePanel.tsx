import { useState } from 'react'
import { CONSUMABLE_COSTS, type ConsumableType } from '../progression'
import { Button, Panel } from '../ui'

const items: readonly { readonly type: ConsumableType; readonly label: string; readonly description: string }[] = [
  { type: 'revealOneLetter', label: 'Reveal One Letter', description: 'Reveal one position in the active Solo Practice puzzle.' },
  { type: 'removeIncorrectLetters', label: 'Remove Incorrect Letters', description: 'Disable answer-absent keyboard letters in one Solo Practice puzzle.' },
]

export interface MarketplacePanelProps {
  readonly coins: number
  readonly consumables: Readonly<Record<ConsumableType, number>>
  readonly onPurchase: (type: ConsumableType) => boolean | Promise<boolean>
}

export function MarketplacePanel({ coins, consumables, onPurchase }: MarketplacePanelProps) {
  const [pending, setPending] = useState<ConsumableType>()
  const [status, setStatus] = useState<string>('Purchases add inventory and never activate automatically.')
  const handlePurchase = (type: ConsumableType) => {
    setPending(type)
    void Promise.resolve(onPurchase(type)).then((ok) => {
      setStatus(ok ? 'Purchase complete.' : 'Purchase could not be completed. Check your balance or connection.')
    }).finally(() => setPending(undefined))
  }
  return (
    <section aria-labelledby="marketplace-title" className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase text-[var(--color-ice-200)]">Progression</p>
        <h2 className="text-3xl font-bold text-white" id="marketplace-title">Marketplace</h2>
        <p className="text-base text-slate-300">{coins} coins available. Consumables work only in Solo Practice.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item) => {
          const cost = CONSUMABLE_COSTS[item.type]
          return (
            <Panel className="space-y-3" key={item.type} tone="muted">
              <h3 className="text-lg font-bold text-white">{item.label}</h3>
              <p className="text-sm leading-6 text-slate-300">{item.description}</p>
              <p className="text-sm text-slate-200">Owned: {consumables[item.type]}</p>
              <Button disabled={coins < cost || Boolean(pending)} onClick={() => handlePurchase(item.type)} variant="primary">
                {pending === item.type ? 'Purchasing...' : `Buy for ${cost} coins`}
              </Button>
            </Panel>
          )
        })}
      </div>
      <p aria-live="polite" className="min-h-6 text-sm text-slate-300" role="status">
        {status}
      </p>
    </section>
  )
}
