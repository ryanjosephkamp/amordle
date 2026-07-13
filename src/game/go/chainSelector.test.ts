import { describe, expect, it } from 'vitest'
import {
  GO_CHAIN_V2_DAILY_CUTOFF_DATE_KEY,
  selectDeterministicGoAnswerSequence,
} from './chainSelector'

function candidates(count = 100) {
  return Array.from({ length: count }, (_, index) => ({ word: `word${String(index).padStart(3, '0')}` }))
}

function fixedLengthCandidates(length: number, count = 100) {
  return Array.from({ length: count }, (_, index) => {
    let value = index
    const letters = Array.from({ length }, () => {
      const letter = String.fromCharCode(97 + (value % 26))
      value = Math.floor(value / 26)
      return letter
    })
    return { word: letters.reverse().join('') }
  })
}

describe('deterministic go chain selector', () => {
  it('is deterministic and independent of candidate input order', () => {
    const input = candidates()
    const options = { puzzleCount: 10, streamKey: 'practice:go:5:expert:account-seed-42' }

    const selected = selectDeterministicGoAnswerSequence(input, options)
    const repeated = selectDeterministicGoAnswerSequence(input, options)
    const reversed = selectDeterministicGoAnswerSequence([...input].reverse(), options)

    expect(repeated).toEqual(selected)
    expect(reversed).toEqual(selected)
    expect(new Set(selected).size).toBe(10)
    expect(selected.every((answer) => input.some((candidate) => candidate.word === answer))).toBe(true)
  })

  it('does not turn consecutive practice game identities into shifted windows', () => {
    const input = candidates()
    const first = selectDeterministicGoAnswerSequence(input, {
      puzzleCount: 5,
      streamKey: 'practice:go:5:expert:account-seed-100',
    })
    const second = selectDeterministicGoAnswerSequence(input, {
      puzzleCount: 5,
      streamKey: 'practice:go:5:expert:account-seed-101',
    })
    const overlap = second.filter((answer) => first.includes(answer))

    expect(second.slice(0, -1)).not.toEqual(first.slice(1))
    expect(overlap.length).toBeLessThan(4)
  })

  it('can exclude a parallel daily lane without changing determinism', () => {
    const input = candidates()
    const unranked = selectDeterministicGoAnswerSequence(input, {
      puzzleCount: 10,
      streamKey: 'daily-multiplayer:go:unranked:2026-08-01',
    })
    const ranked = selectDeterministicGoAnswerSequence(input, {
      excludedWords: new Set(unranked),
      puzzleCount: 10,
      streamKey: 'daily-multiplayer:go:ranked:2026-08-01',
    })

    expect(ranked).toEqual(selectDeterministicGoAnswerSequence(input, {
      excludedWords: new Set(unranked),
      puzzleCount: 10,
      streamKey: 'daily-multiplayer:go:ranked:2026-08-01',
    }))
    expect(ranked.some((answer) => unranked.includes(answer))).toBe(false)
  })

  it('uses an explicit future UTC Daily activation boundary', () => {
    expect(GO_CHAIN_V2_DAILY_CUTOFF_DATE_KEY).toMatch(/^2026-\d{2}-\d{2}$/u)
    expect(GO_CHAIN_V2_DAILY_CUTOFF_DATE_KEY > '2026-07-12').toBe(true)
  })

  it('supports every configured word length and GO puzzle count without replacement', () => {
    for (let length = 2; length <= 35; length += 1) {
      const input = fixedLengthCandidates(length)
      for (const puzzleCount of [5, 7, 10] as const) {
        const selected = selectDeterministicGoAnswerSequence(input, {
          puzzleCount,
          streamKey: `practice:go:${length}:expert:seed-42:${puzzleCount}`,
        })
        expect(selected).toHaveLength(puzzleCount)
        expect(new Set(selected).size).toBe(puzzleCount)
        expect(selected.every((word) => word.length === length)).toBe(true)
      }
    }
  })

  it('remains reproducible across one thousand fixed game identities', () => {
    const input = fixedLengthCandidates(5, 200)
    for (let seed = 0; seed < 1_000; seed += 1) {
      const options = { puzzleCount: 10, streamKey: `practice:go:5:expert:${seed}` }
      const selected = selectDeterministicGoAnswerSequence(input, options)
      expect(selectDeterministicGoAnswerSequence(input, options)).toEqual(selected)
      expect(new Set(selected).size).toBe(10)
    }
  })

  it('keeps consecutive identities near random-sampling overlap instead of shifted windows', () => {
    const input = fixedLengthCandidates(5, 400)
    let overlapTotal = 0
    let maximumOverlap = 0
    for (let seed = 0; seed < 500; seed += 1) {
      const first = selectDeterministicGoAnswerSequence(input, {
        puzzleCount: 10,
        streamKey: `practice:go:5:expert:${seed}`,
      })
      const second = selectDeterministicGoAnswerSequence(input, {
        puzzleCount: 10,
        streamKey: `practice:go:5:expert:${seed + 1}`,
      })
      const overlap = second.filter((word) => first.includes(word)).length
      overlapTotal += overlap
      maximumOverlap = Math.max(maximumOverlap, overlap)
      expect(second.slice(0, -1)).not.toEqual(first.slice(1))
    }

    expect(overlapTotal / 500).toBeLessThan(1)
    expect(maximumOverlap).toBeLessThan(5)
  })
})
