import type { CoinTrendPointDatum } from '../statsSelectors'

interface TrendSparklineProps {
  readonly caption: string
  readonly data: readonly CoinTrendPointDatum[]
  readonly emptyMessage: string
}

/**
 * Phase 19.1 — accessible cumulative coin-earning sparkline. Renders a small
 * inline SVG polyline (decorative, `aria-hidden`) plus a visually-hidden table
 * and a summary line for assistive tech.
 */
export function TrendSparkline({ caption, data, emptyMessage }: TrendSparklineProps) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-400">{emptyMessage}</p>
  }

  const width = 240
  const height = 48
  const maxCumulative = Math.max(...data.map((point) => point.cumulative), 1)
  const lastPoint = data[data.length - 1]!
  const points = data
    .map((point, index) => {
      const x = data.length === 1 ? width : (index / (data.length - 1)) * width
      const y = height - (point.cumulative / maxCumulative) * height
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <figure className="space-y-2">
      <figcaption className="text-sm font-semibold text-cyan-100">{caption}</figcaption>
      <svg
        aria-hidden="true"
        className="h-12 w-full max-w-xs text-[var(--color-ice-300)]"
        preserveAspectRatio="none"
        viewBox={`0 0 ${width} ${height}`}
      >
        <polyline fill="none" points={points} stroke="currentColor" strokeWidth={2} />
      </svg>
      <p className="text-xs text-slate-400">{lastPoint.cumulative} coins earned across the last {data.length} games.</p>
      <table className="brrrdle-visually-hidden">
        <caption>{caption}</caption>
        <thead>
          <tr><th scope="col">Completed at</th><th scope="col">Coins earned</th><th scope="col">Cumulative</th></tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.completedAt}>
              <th scope="row">{point.completedAt}</th>
              <td>{point.coinAward}</td>
              <td>{point.cumulative}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
