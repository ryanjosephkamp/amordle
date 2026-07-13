import { describe, expect, it } from 'vitest'
import { getGuessResult, getTileStates } from './tileStates'

describe('getTileStates', () => {
  it('marks all correct letters green', () => {
    expect(getTileStates('crane', 'crane')).toEqual([
      'correct',
      'correct',
      'correct',
      'correct',
      'correct',
    ])
  })

  it('marks all missing letters absent', () => {
    expect(getTileStates('fjord', 'backs')).toEqual([
      'absent',
      'absent',
      'absent',
      'absent',
      'absent',
    ])
  })

  it('marks mixed present and correct states', () => {
    expect(getTileStates('cater', 'trace')).toEqual([
      'present',
      'present',
      'present',
      'present',
      'present',
    ])
  })

  it('handles repeated guess letters beyond answer count', () => {
    expect(getTileStates('allee', 'apple')).toEqual([
      'correct',
      'present',
      'absent',
      'absent',
      'correct',
    ])
  })

  it('handles repeated answer letters', () => {
    expect(getTileStates('cacao', 'allay')).toEqual([
      'absent',
      'present',
      'absent',
      'correct',
      'absent',
    ])
  })

  it('supports two-letter puzzles', () => {
    expect(getTileStates('am', 'ma')).toEqual(['present', 'present'])
  })

  it('supports thirty-five-letter puzzles', () => {
    const answer = 'abcdefghijklmnopqrstuvwxyzabcdefghi'
    const guess = 'abcdefghijklmnopqrstuvwxyzabcdefghj'
    expect(getTileStates(guess, answer).at(-1)).toBe('absent')
    expect(getTileStates(guess, answer).slice(0, -1).every((state) => state === 'correct')).toBe(true)
  })

  it('throws when guess and answer lengths differ', () => {
    expect(() => getTileStates('cat', 'cats')).toThrow('same length')
  })
})

describe('getGuessResult', () => {
  it('returns normalized guess letters with states', () => {
    expect(getGuessResult(' Crane ', 'cared')).toEqual({
      guess: 'crane',
      tiles: [
        { letter: 'c', state: 'correct' },
        { letter: 'r', state: 'present' },
        { letter: 'a', state: 'present' },
        { letter: 'n', state: 'absent' },
        { letter: 'e', state: 'present' },
      ],
    })
  })
})
