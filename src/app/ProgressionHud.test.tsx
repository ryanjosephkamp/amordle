import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createDefaultGuestProgress, type GuestProgressionState } from '../account/storageSchema'
import { ProgressionHud } from './ProgressionHud'
import { createProgressionHudViewModel } from './progressionHudViewModel'

function progression(overrides: Partial<GuestProgressionState>): GuestProgressionState {
  return {
    ...createDefaultGuestProgress().progression,
    ...overrides,
  }
}

describe('ProgressionHud', () => {
  it('derives level and compact XP progress from existing progression math', () => {
    const viewModel = createProgressionHudViewModel(progression({ coins: 42, level: 99, xp: 150 }))

    expect(viewModel.level).toBe(2)
    expect(viewModel.levelLabel).toBe('Level 2')
    expect(viewModel.coinBalance).toBe(42)
    expect(viewModel.coinLabel).toBe('42 coins')
    expect(viewModel.xpIntoLevel).toBe(50)
    expect(viewModel.xpForLevel).toBe(200)
    expect(viewModel.progressPercent).toBe(25)
    expect(viewModel.xpSummary).toBe('50 / 200 XP')
    expect(viewModel.xpToNextLevelLabel).toBe('150 XP to level 3')
  })

  it('does not mutate the active progression object while creating display values', () => {
    const activeProgression = progression({ coins: 7, xp: 90 })
    const before = JSON.stringify(activeProgression)

    createProgressionHudViewModel(activeProgression)

    expect(JSON.stringify(activeProgression)).toBe(before)
  })

  it('renders only display-only level coins and XP values', () => {
    const html = renderToStaticMarkup(<ProgressionHud progression={progression({ coins: 42, level: 99, xp: 150 })} />)

    expect(html).toContain('aria-label="Current progression"')
    expect(html).toContain('<dt>Level</dt>')
    expect(html).toContain('<dd>2</dd>')
    expect(html).toContain('<dt>Coins</dt>')
    expect(html).toContain('<dd>42</dd>')
    expect(html).toContain('<dt>XP</dt>')
    expect(html).toContain('<dd>25%</dd>')
    expect(html).toContain('role="progressbar"')
    expect(html).toContain('aria-valuenow="50"')
    expect(html).toContain('50 / 200 XP - 150 XP to level 3')
    expect(html).not.toContain('Open Stats')
    expect(html).not.toContain('reveal')
    expect(html).not.toContain('continue')
    expect(html).not.toContain('removeIncorrectLetters')
  })

  it('renders a focused Stats navigation action only when the handler is supplied', () => {
    const html = renderToStaticMarkup(
      <ProgressionHud onOpenStats={() => undefined} progression={progression({ coins: 42, level: 99, xp: 150 })} />,
    )

    expect(html).toContain('aria-label="Current progression"')
    expect(html).toContain('role="progressbar"')
    expect(html).toContain('aria-label="Open Stats for progression details"')
    expect(html).toContain('type="button"')
    expect(html).toContain('Open Stats')
    expect(html).toContain('50 / 200 XP - 150 XP to level 3')
  })

  it('renders whatever active-scope progression is passed without retaining stale account values', () => {
    const guestHtml = renderToStaticMarkup(<ProgressionHud progression={progression({ coins: 9, xp: 90 })} />)
    const accountHtml = renderToStaticMarkup(<ProgressionHud progression={progression({ coins: 77, xp: 300 })} />)

    expect(guestHtml).toContain('<dd>9</dd>')
    expect(guestHtml).toContain('90 / 100 XP - 10 XP to level 2')
    expect(accountHtml).toContain('<dd>77</dd>')
    expect(accountHtml).toContain('0 / 300 XP - 300 XP to level 4')
    expect(accountHtml).not.toContain('<dd>9</dd>')
    expect(accountHtml).not.toContain('90 / 100 XP')
  })
})
