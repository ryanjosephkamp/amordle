import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SoloBoard, type SoloBoardRow } from './SoloBoard'

function createRows(wordLength: number, count: number): SoloBoardRow[] {
  return Array.from({ length: count }, (_, rowIndex) => ({
    id: `row-${rowIndex}`,
    tiles: Array.from({ length: wordLength }, (_, tileIndex) => ({
      id: `tile-${rowIndex}-${tileIndex}`,
      isSubmitted: rowIndex === 0,
      letter: rowIndex === 0 && tileIndex === 0 ? 'a' : '',
      state: rowIndex === 0 && tileIndex === 0 ? 'correct' : 'empty',
    })),
  }))
}

describe('SoloBoard', () => {
  it.each([
    [2, 70],
    [3, 108],
    [5, 184],
    [8, 298],
    [35, 1324],
  ])('keeps a 32px tile floor for a %i-letter board', (wordLength, minWidth) => {
    const html = renderToStaticMarkup(
      <SoloBoard
        ariaLabel={`${wordLength}-letter board`}
        rows={createRows(wordLength, 6)}
        wordLength={wordLength}
      />,
    )

    expect(html).toContain(`--solo-board-min-width:${minWidth}px`)
    expect(html).toContain(`data-word-length="${wordLength}"`)
  })

  it('keeps every attempt row in one board-local horizontal coordinate system', () => {
    const html = renderToStaticMarkup(
      <SoloBoard
        ariaLabel="Long practice board"
        rows={createRows(35, 8)}
        wordLength={35}
      />,
    )

    expect(html.match(/data-solo-board-viewport="true"/gu)).toHaveLength(1)
    expect(html.match(/role="row"/gu)).toHaveLength(8)
    expect(html).toContain('--solo-board-min-width:1324px')
    expect(html).toContain('data-word-length="35"')
    expect(html).not.toContain('overflow-x-auto mx-auto grid')
  })

  it('exposes stable tile semantics and an active-cell target without replay keys', () => {
    const rows = createRows(5, 6)
    const html = renderToStaticMarkup(
      <SoloBoard
        activeCell={{ columnIndex: 1, rowIndex: 1 }}
        ariaLabel="Guess grid"
        rows={rows}
        shakeRowIndex={1}
        wordLength={5}
      />,
    )

    expect(html).toContain('aria-label="Guess grid"')
    expect(html).toContain('data-state="correct"')
    expect(html).toContain('data-submitted="true"')
    expect(html).toContain('data-active-cell="true"')
    expect(html).toContain('data-shake="true"')
  })
})
