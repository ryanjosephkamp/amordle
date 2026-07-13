import { classNames } from '../../ui/classNames'
import type { CalendarDayDatum } from '../statsSelectors'

interface CalendarHeatmapProps {
  readonly caption: string
  readonly data: readonly CalendarDayDatum[]
}

function intensityClass(played: number): string {
  if (played <= 0) {
    return 'bg-slate-800'
  }
  if (played === 1) {
    return 'bg-[var(--color-ice-300)]/30'
  }
  if (played <= 3) {
    return 'bg-[var(--color-ice-300)]/60'
  }
  return 'bg-[var(--color-ice-300)]'
}

/**
 * Phase 19.1 — accessible activity heatmap of recent days. Each cell exposes a
 * descriptive `title`/`aria-label`; the same data is mirrored in a
 * visually-hidden table for assistive tech.
 */
export function CalendarHeatmap({ caption, data }: CalendarHeatmapProps) {
  const activeDays = data.filter((day) => day.played > 0).length

  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-semibold text-cyan-100">{caption}</figcaption>
      <p className="text-xs text-slate-400">{activeDays} active {activeDays === 1 ? 'day' : 'days'} in the last {data.length} days.</p>
      <div className="flex flex-wrap gap-1" aria-hidden="true">
        {data.map((day) => (
          <span
            className={classNames('h-4 w-4 rounded-sm', intensityClass(day.played))}
            key={day.date}
            title={`${day.date}: ${day.played} played, ${day.won} won`}
          />
        ))}
      </div>
      <table className="brrrdle-visually-hidden">
        <caption>{caption}</caption>
        <thead>
          <tr><th scope="col">Date</th><th scope="col">Played</th><th scope="col">Won</th></tr>
        </thead>
        <tbody>
          {data.map((day) => (
            <tr key={day.date}>
              <th scope="row">{day.date}</th>
              <td>{day.played}</td>
              <td>{day.won}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
