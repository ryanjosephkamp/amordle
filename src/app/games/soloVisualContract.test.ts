import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8')

describe('Wave 03 Solo visual contract', () => {
  it('contains long boards inside one board-local scroller with a 32px tile floor', () => {
    expect(css).toMatch(/\.brrrdle-solo-board-viewport\s*\{[^}]*overflow-x:\s*auto;/su)
    expect(css).toMatch(/\.brrrdle-solo-board\s*\{[^}]*min-width:\s*var\(--solo-board-min-width\);/su)
    expect(css).toMatch(/\.brrrdle-solo-board-row\s*\{[^}]*grid-template-columns:\s*repeat\(var\(--solo-board-columns\),\s*minmax\(32px,\s*1fr\)\);/su)
  })

  it('removes setup chrome in Focus Mode while keeping chain evidence and tools in flow', () => {
    expect(css).toMatch(/\.brrrdle-lunar-shell\.is-focus-mode\s+\.brrrdle-solo-setup-controls\s*\{\s*display:\s*none;\s*\}/su)
    expect(css).toMatch(/\.brrrdle-lunar-shell\.is-focus-mode\s+\.brrrdle-solo-game-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/su)
    expect(css).toContain('.brrrdle-solo-tools-disclosure')
    expect(css).toContain('.brrrdle-go-chain-spine')
  })

  it('uses a desktop core-and-rail layout without forcing that density onto mobile', () => {
    expect(css).toMatch(/@media\s+\(width\s*>=\s*1200px\)[\s\S]*?\.brrrdle-solo-game-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(15rem,\s*18rem\);/su)
  })
})
