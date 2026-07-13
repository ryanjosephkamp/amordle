import { useId } from 'react'
import { Button, Tooltip } from '../../ui'
import { DIFFICULTY_TIERS, getDifficultyTierMeta, isDifficultyTier, type DifficultyTier } from '../../data'
import { GO_PUZZLE_COUNTS, isGoPuzzleCount, type GoPuzzleCount } from '../../game/constants'

interface CustomizeMenuProps {
  /** Difficulty currently applied to this game's puzzle. */
  readonly difficulty: DifficultyTier
  /** The player's saved global default, used to enable "Save as default". */
  readonly defaultDifficulty: DifficultyTier
  /**
   * When true the difficulty control is locked because the current puzzle has
   * already started (a guess was submitted). Changing difficulty starts a new
   * puzzle, so it is only allowed before the first guess.
   */
  readonly locked: boolean
  readonly onDifficultyChange: (tier: DifficultyTier) => void
  readonly onSaveDefault: () => void
  /**
   * Phase 19.2 — optional go-chain length control. Only rendered when a value
   * is provided (go games), so the shared menu stays unchanged for og games.
   */
  readonly goPuzzleCount?: GoPuzzleCount
  readonly defaultGoPuzzleCount?: GoPuzzleCount
  readonly onGoPuzzleCountChange?: (count: GoPuzzleCount) => void
  readonly onSaveGoPuzzleCountDefault?: () => void
}

/**
 * Phase 18.4 — per-game "Customize" quick menu. Lets the player pick a
 * difficulty tier for the current puzzle (initialized from their global
 * default) and optionally save that choice as the new default. The tier is
 * locked once the puzzle has started so difficulty cannot be changed mid-game.
 * Difficulty only affects which answers are selectable, never which guesses are
 * valid.
 *
 * Phase 19.2 — for go games, also exposes a 5/7/10 chain-length selector with
 * the same lock-on-start semantics.
 */
export function CustomizeMenu({
  difficulty,
  defaultDifficulty,
  locked,
  onDifficultyChange,
  onSaveDefault,
  goPuzzleCount,
  defaultGoPuzzleCount,
  onGoPuzzleCountChange,
  onSaveGoPuzzleCountDefault,
}: CustomizeMenuProps) {
  const selectId = useId()
  const goCountId = useId()
  const canSaveDefault = difficulty !== defaultDifficulty
  const showGoCount = goPuzzleCount !== undefined && onGoPuzzleCountChange !== undefined
  const canSaveGoCountDefault = showGoCount && goPuzzleCount !== defaultGoPuzzleCount

  return (
    <details className="brrrdle-customize-details group rounded-lg border border-slate-700 bg-slate-950 p-4 text-sm text-slate-300">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]">
        <span className="text-base font-bold text-white">Customize</span>
        <span className="rounded-full border border-slate-600 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-100">
          <span className="group-open:hidden">Expand</span>
          <span className="hidden group-open:inline">Collapse</span>
        </span>
      </summary>
      <div className="mt-3 space-y-3 border-t border-slate-700/60 pt-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-white">Puzzle options</h3>
          <Tooltip label="More information about Customize">
            Pick a difficulty for this puzzle. Difficulty only changes which answers can appear — every valid guess stays allowed at every difficulty. You can change it until your first guess; after that, start a new puzzle to switch.
          </Tooltip>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm font-semibold text-cyan-100" htmlFor={selectId}>
            Difficulty
            <select
              className="rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={locked}
              id={selectId}
              onChange={(event) => { if (isDifficultyTier(event.target.value)) onDifficultyChange(event.target.value) }}
              value={difficulty}
            >
              {DIFFICULTY_TIERS.map((tier) => (
                <option key={tier} value={tier}>{getDifficultyTierMeta(tier).label}</option>
              ))}
            </select>
          </label>
          <Button disabled={!canSaveDefault} onClick={onSaveDefault} variant="secondary">Save as default</Button>
        </div>
        <p className="text-xs text-slate-400">{getDifficultyTierMeta(difficulty).description}</p>
        {showGoCount ? (
          <div className="flex flex-wrap items-end gap-3 border-t border-slate-700/60 pt-3">
            <label className="grid gap-1 text-sm font-semibold text-cyan-100" htmlFor={goCountId}>
              Go chain length
              <select
                className="rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={locked}
                id={goCountId}
                onChange={(event) => { const next = Number(event.target.value); if (isGoPuzzleCount(next)) onGoPuzzleCountChange?.(next) }}
                value={goPuzzleCount}
              >
                {GO_PUZZLE_COUNTS.map((count) => (
                  <option key={count} value={count}>{count} puzzles</option>
                ))}
              </select>
            </label>
            {onSaveGoPuzzleCountDefault ? (
              <Button disabled={!canSaveGoCountDefault} onClick={onSaveGoPuzzleCountDefault} variant="secondary">Save as default</Button>
            ) : null}
            <p className="text-xs text-slate-400">Number of linked puzzles in the chain. Each puzzle keeps its word length.</p>
          </div>
        ) : null}
        {locked ? (
          <p className="text-xs text-amber-100">Difficulty{showGoCount ? ' and chain length are' : ' is'} locked because this puzzle has started. Start a new puzzle to change {showGoCount ? 'them' : 'it'}.</p>
        ) : null}
      </div>
    </details>
  )
}
