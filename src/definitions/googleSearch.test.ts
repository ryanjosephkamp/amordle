import { describe, expect, it } from 'vitest'
import { getGoogleDefinitionSearchLabel, getGoogleDefinitionSearchUrl } from './googleSearch'

describe('Google definition search helpers', () => {
  it('generates dynamic labels', () => {
    expect(getGoogleDefinitionSearchLabel('crane')).toBe('Search Google for ‘CRANE’')
  })

  it('generates safe define query URLs', () => {
    expect(getGoogleDefinitionSearchUrl('ice bird')).toBe('https://www.google.com/search?q=define+ice+bird')
  })
})
