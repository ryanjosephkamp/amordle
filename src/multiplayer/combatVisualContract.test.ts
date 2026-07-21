import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')
const gameSurface = readFileSync(
  resolve(process.cwd(), 'src/multiplayer/MultiplayerGameSurface.tsx'),
  'utf8',
)

describe('Wave 04 COMBAT visual contract', () => {
  it('contains long shared boards inside one board-local scroller with a 32px tile floor', () => {
    expect(css).toMatch(/\.combat-board-scroll\s*\{[^}]*overflow-x:\s*auto;/su)
    expect(gameSurface).toContain('minmax(2rem, 1fr)')
    expect(gameSurface).toContain('data-combat-shared-board="true"')
    expect(css).not.toMatch(/\.combat-board-scroll\s*\{[^}]*position:\s*fixed;/su)
  })

  it('keeps the optional Live evidence rail behind the accepted 1360px threshold', () => {
    expect(css).toMatch(/@media\s+\(width\s*>=\s*1360px\)[\s\S]*?\.combat-command-grid\s*\{[^}]*grid-template-areas:/su)
    expect(css).toMatch(/\.combat-live-rail\s*\{[^}]*grid-area:\s*live;/su)
  })

  it('uses restrained edge atmosphere and removes all motion under reduced motion', () => {
    expect(css).toMatch(/\.combat-workspace::before\s*\{[\s\S]*?var\(--color-ember-atmosphere\)[\s\S]*?var\(--color-frost-atmosphere\)/su)
    expect(css).toMatch(/@media\s+\(prefers-reduced-motion:\s*reduce\)[\s\S]*?transition-duration:\s*0\.001ms\s*!important;/su)
  })
})
