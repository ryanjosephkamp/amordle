import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SoloResultHandoff } from './SoloResultHandoff'

describe('SoloResultHandoff', () => {
  it('renders a factual OG verdict and source-derived summary without invented rewards', () => {
    const html = renderToStaticMarkup(
      <SoloResultHandoff
        attemptsUsed={4}
        mode="og"
        scope="daily"
        status="won"
        wordLength={5}
      >
        <button type="button">Share result</button>
      </SoloResultHandoff>,
    )

    expect(html).toContain('DAILY · OG · 5L')
    expect(html).toContain('PUZZLE SOLVED')
    expect(html).toContain('Solved in 4 guesses')
    expect(html).toContain('Share result')
    expect(html).not.toContain('coins')
    expect(html).not.toContain('XP')
  })

  it('reports GO chain completion from the actual puzzle counts', () => {
    const html = renderToStaticMarkup(
      <SoloResultHandoff
        attemptsUsed={13}
        mode="go"
        puzzleCount={7}
        scope="practice"
        solvedPuzzleCount={7}
        status="won"
        wordLength={8}
      >
        <button type="button">New chain</button>
      </SoloResultHandoff>,
    )

    expect(html).toContain('PRACTICE · GO · 8L')
    expect(html).toContain('CHAIN COMPLETE')
    expect(html).toContain('7 of 7 puzzles solved')
    expect(html).toContain('13 total guesses')
  })
})
