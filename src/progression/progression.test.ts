import { describe, expect, it } from 'vitest'
import { calculateCoinAward } from './coins'
import { removeIncorrectLetters, revealOneLetter, spendConsumable } from './consumables'
import { calculateXpAward, getLevelForXp } from './experience'
import { calculatePayToContinueCost } from './payToContinue'

describe('progression and economy', () => {
  it('awards XP and levels from performance', () => {
    expect(calculateXpAward({ attemptsUsed: 2, maxAttempts: 6, mode: 'og', status: 'won', wordLength: 5 })).toBe(70)
    expect(calculateXpAward({ attemptsUsed: 6, maxAttempts: 6, mode: 'go', puzzleCount: 5, status: 'won', wordLength: 5 })).toBe(275)
    expect(getLevelForXp(0)).toBe(1)
    expect(getLevelForXp(100)).toBe(2)
  })

  it('awards coins for wins and small consolation coins for losses', () => {
    expect(calculateCoinAward({ attemptsUsed: 3, maxAttempts: 6, mode: 'og', scope: 'daily', status: 'won', wordLength: 5 })).toBe(16)
    expect(calculateCoinAward({ attemptsUsed: 6, maxAttempts: 6, mode: 'go', scope: 'practice', status: 'lost', wordLength: 5 })).toBe(1)
  })

  it('handles consumable spending and effects', () => {
    expect(spendConsumable(10, 'revealOneLetter')).toEqual({ ok: false, reason: 'insufficient-coins', requiredCoins: 25 })
    expect(spendConsumable(25, 'revealOneLetter')).toEqual({ ok: true, remainingCoins: 0 })
    expect(revealOneLetter('crane', [0, 1])).toEqual({ ok: true, index: 2, letter: 'a' })
    expect(revealOneLetter('aa', [0, 1])).toEqual({ ok: false, reason: 'fully-revealed' })
    expect(removeIncorrectLetters('ace', 'abcde')).toEqual(['b', 'd'])
  })

  it('scales pay-to-continue by word length, progress, and repeat use', () => {
    expect(calculatePayToContinueCost({ completionPercentage: 0, continuationCount: 0, wordLength: 5 })).toBe(6)
    expect(calculatePayToContinueCost({ completionPercentage: 100, continuationCount: 1, wordLength: 5 })).toBe(6)
    expect(calculatePayToContinueCost({ completionPercentage: 50, continuationCount: 2, wordLength: 35 })).toBe(36)
  })
})
