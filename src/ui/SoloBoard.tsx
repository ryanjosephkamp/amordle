import { useEffect, useRef, type CSSProperties } from 'react'
import type { TileState } from '../game'
import { classNames } from './classNames'

export type SoloBoardTileState = TileState | 'empty' | 'current'

export interface SoloBoardTile {
  readonly id: string
  readonly isSubmitted: boolean
  readonly letter: string
  readonly state: SoloBoardTileState
}

export interface SoloBoardRow {
  readonly id: string
  readonly tiles: readonly SoloBoardTile[]
}

interface SoloBoardProps {
  readonly activeCell?: {
    readonly columnIndex: number
    readonly rowIndex: number
  }
  readonly ariaLabel: string
  readonly autoCenterAttribute?: Readonly<Record<string, string>>
  readonly rows: readonly SoloBoardRow[]
  readonly shakeRowIndex?: number
  readonly wordLength: number
}

const tileStateClasses: Record<SoloBoardTileState, string> = {
  absent: 'border-slate-700 bg-slate-950 text-slate-400',
  correct: 'border-emerald-300/70 bg-emerald-300/25 text-emerald-50',
  current: 'border-[var(--color-ice-200)] bg-[color-mix(in_srgb,var(--color-ice-300)_12%,transparent)] text-[var(--color-ice-100)]',
  empty: 'border-slate-700 bg-slate-950/60 text-slate-500',
  present: 'border-amber-300/70 bg-amber-300/20 text-amber-50',
}

const TILE_FLOOR_PX = 32
const TILE_GAP_PX = 6

export function SoloBoard({
  activeCell,
  ariaLabel,
  autoCenterAttribute,
  rows,
  shakeRowIndex,
  wordLength,
}: SoloBoardProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const activeCellRef = useRef<HTMLDivElement>(null)
  const minWidth = wordLength * TILE_FLOOR_PX + Math.max(0, wordLength - 1) * TILE_GAP_PX
  const boardStyle = {
    '--solo-board-columns': wordLength,
    '--solo-board-min-width': `${minWidth}px`,
  } as CSSProperties

  useEffect(() => {
    const viewport = viewportRef.current
    const cell = activeCellRef.current
    if (!viewport || !cell || viewport.scrollWidth <= viewport.clientWidth) {
      return
    }

    const viewportBounds = viewport.getBoundingClientRect()
    const cellBounds = cell.getBoundingClientRect()
    const leftEdge = cellBounds.left - viewportBounds.left + viewport.scrollLeft
    const rightEdge = cellBounds.right - viewportBounds.left + viewport.scrollLeft
    const targetLeft = cellBounds.left < viewportBounds.left
      ? leftEdge
      : cellBounds.right > viewportBounds.right
        ? rightEdge - viewport.clientWidth
        : viewport.scrollLeft

    if (targetLeft !== viewport.scrollLeft) {
      viewport.scrollTo({ behavior: 'auto', left: Math.max(0, targetLeft) })
    }
  }, [activeCell?.columnIndex, activeCell?.rowIndex, wordLength])

  return (
    <div
      className="brrrdle-solo-board-viewport"
      data-solo-board-viewport="true"
      data-word-length={wordLength}
      ref={viewportRef}
    >
      <div
        aria-label={ariaLabel}
        className="brrrdle-solo-board"
        role="grid"
        style={boardStyle}
        tabIndex={-1}
        {...autoCenterAttribute}
      >
        {rows.map((row, rowIndex) => (
          <div
            className="brrrdle-solo-board-row"
            data-shake={shakeRowIndex === rowIndex ? 'true' : undefined}
            key={row.id}
            role="row"
          >
            {row.tiles.map((tile, tileIndex) => {
              const isActiveCell = activeCell?.rowIndex === rowIndex && activeCell.columnIndex === tileIndex
              return (
                <div
                  aria-label={`Row ${rowIndex + 1}, tile ${tileIndex + 1}${tile.letter ? `, ${tile.letter}` : ''}`}
                  className={classNames(
                    'brrrdle-solo-board-tile @container',
                    tileStateClasses[tile.state],
                  )}
                  data-active-cell={isActiveCell ? 'true' : undefined}
                  data-state={tile.state}
                  data-submitted={tile.isSubmitted ? 'true' : undefined}
                  key={tile.id}
                  ref={isActiveCell ? activeCellRef : undefined}
                  role="gridcell"
                >
                  {tile.letter}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
