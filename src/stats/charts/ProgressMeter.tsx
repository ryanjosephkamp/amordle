import type { XpProgressDatum } from '../statsSelectors'

interface ProgressMeterProps {
  readonly progress: XpProgressDatum
}

/**
 * Phase 19.1 — accessible XP-progress meter using a native ARIA progressbar so
 * the level and remaining XP are announced correctly.
 */
export function ProgressMeter({ progress }: ProgressMeterProps) {
  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-semibold text-cyan-100">XP progress</figcaption>
      <div className="flex items-baseline justify-between text-xs text-slate-300">
        <span>Level {progress.level}</span>
        <span className="tabular-nums">{progress.xpIntoLevel} / {progress.xpForLevel} XP</span>
      </div>
      <div
        aria-label={`Level ${progress.level}: ${progress.xpIntoLevel} of ${progress.xpForLevel} XP toward the next level`}
        aria-valuemax={progress.xpForLevel}
        aria-valuemin={0}
        aria-valuenow={progress.xpIntoLevel}
        className="h-3 overflow-hidden rounded-full bg-slate-800"
        role="progressbar"
      >
        <span className="block h-full rounded-full bg-[var(--color-ice-300)]" style={{ width: `${progress.progressPercent}%` }} />
      </div>
      <p className="text-xs text-slate-400">{progress.xpToNextLevel} XP to level {progress.level + 1} · {progress.xp} XP total.</p>
    </figure>
  )
}
