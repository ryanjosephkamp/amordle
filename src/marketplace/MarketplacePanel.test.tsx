import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MarketplacePanel } from './MarketplacePanel'

describe('MarketplacePanel', () => {
  it('shows fixed prices, balance, inventory, and purchase commands', () => {
    const html = renderToStaticMarkup(<MarketplacePanel
      coins={65}
      consumables={{ removeIncorrectLetters: 2, revealOneLetter: 1 }}
      onPurchase={() => true}
    />)
    expect(html).toContain('Marketplace')
    expect(html).toContain('65 coins')
    expect(html).toContain('Reveal One Letter')
    expect(html).toContain('25 coins')
    expect(html).toContain('Remove Incorrect Letters')
    expect(html).toContain('40 coins')
    expect(html).toContain('Owned: 1')
    expect(html).toContain('Owned: 2')
  })
})
