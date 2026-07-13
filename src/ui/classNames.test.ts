import { describe, expect, it } from 'vitest'
import { classNames } from './classNames'

describe('classNames', () => {
  it('joins truthy class names and omits empty values', () => {
    expect(classNames('base', false, undefined, 'active', null, '')).toBe('base active')
  })
})
