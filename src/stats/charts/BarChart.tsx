import type { WinRateDatum } from '../statsSelectors'

interface BarChartProps {
  readonly caption: string
  readonly data: readonly WinRateDatum[]
  readonly emptyMessage: string
}

/**
 * Phase 19.1 — accessible horizontal bar chart for win-rate breakdowns. Built
 * from CSS only (no SVG, no dependency). The visible bars are `aria-hidden`
 * and a visually-hidden table provides the same data for screen readers.
 */
export function BarChart({ caption, data, emptyMessage }: BarChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-400">{emptyMessage}</p>
  }

  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-semibold text-cyan-100">{caption}</figcaption>
      <ul className="space-y-2" aria-hidden="true">
        {data.map((item) => (
          <li className="grid grid-cols-[7rem_1fr_auto] items-center gap-2 text-xs text-slate-300" key={item.key}>
            <span className="truncate">{item.label}</span>
            <span className="h-3 overflow-hidden rounded-full bg-slate-800">
              <span
                className="block h-full rounded-full bg-[var(--color-ice-300)]"
                style={{ width: `${item.winRate}%` }}
              />
            </span>
            <span className="tabular-nums text-cyan-100">{item.winRate}%</span>
          </li>
        ))}
      </ul>
      <table className="brrrdle-visually-hidden">
        <caption>{caption}</caption>
        <thead>
          <tr><th scope="col">Group</th><th scope="col">Win rate</th><th scope="col">Played</th><th scope="col">Won</th></tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.key}>
              <th scope="row">{item.label}</th>
              <td>{item.winRate}%</td>
              <td>{item.played}</td>
              <td>{item.won}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
