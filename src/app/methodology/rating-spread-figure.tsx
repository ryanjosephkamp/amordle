/*
 * An illustrative figure, not a measurement.
 *
 * The curve is a normal distribution centred on the seed rating with a 200-point
 * standard deviation — the shape a rating pool tends towards, drawn from the
 * formula rather than from anyone's games. The caption says so, because a chart
 * on a page about honesty must not be mistaken for data.
 *
 * Colours: strokes and fills inherit through `currentColor` and the shell's own
 * surface tokens, so forced-colors renders it as outlines and it carries no
 * accent-derived ink onto a semantic background.
 */

const WIDTH = 640;
const HEIGHT = 220;
/*
 * Wide enough for half of an outermost tick label.
 *
 * At 8 the first tick sat at x=8 and the last at x=632, and because the labels
 * are anchored at their middle, "600" and "1800" each hung half their width
 * outside the viewBox and were clipped. A four-digit label at this figure's
 * 13px monospace is roughly 34 units wide, so the gutter has to clear 17.
 */
const PAD_X = 26;
const BASE_Y = 176;
const PEAK = 132;

const MEAN = 1200;
const SIGMA = 200;
const MIN = 600;
const MAX = 1800;

const ticks = [600, 800, 1000, 1200, 1400, 1600, 1800] as const;

function x(rating: number): number {
  return PAD_X + ((rating - MIN) / (MAX - MIN)) * (WIDTH - PAD_X * 2);
}

function y(rating: number): number {
  const z = (rating - MEAN) / SIGMA;
  return BASE_Y - Math.exp(-0.5 * z * z) * PEAK;
}

const samples = Array.from({ length: 121 }, (_step, index) => MIN + (index * (MAX - MIN)) / 120);

const curve = samples
  .map(
    (rating, index) => `${index === 0 ? 'M' : 'L'}${x(rating).toFixed(1)} ${y(rating).toFixed(1)}`,
  )
  .join(' ');

const area = `${curve} L${x(MAX).toFixed(1)} ${BASE_Y} L${x(MIN).toFixed(1)} ${BASE_Y} Z`;

export function RatingSpreadFigure() {
  return (
    <figure className="rating-spread">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="An illustrative bell curve of ratings, centered on 1200. Most players sit between 1000 and 1400, with progressively fewer toward 600 and 1800."
        preserveAspectRatio="xMidYMid meet"
      >
        <path d={area} className="rating-spread-fill" />
        <path d={curve} className="rating-spread-curve" fill="none" />
        <line x1={x(MEAN)} y1={y(MEAN)} x2={x(MEAN)} y2={BASE_Y} className="rating-spread-mean" />
        <line
          x1={PAD_X}
          y1={BASE_Y}
          x2={WIDTH - PAD_X}
          y2={BASE_Y}
          className="rating-spread-axis"
        />
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={x(tick)}
              y1={BASE_Y}
              x2={x(tick)}
              y2={BASE_Y + 6}
              className="rating-spread-axis"
            />
            <text x={x(tick)} y={BASE_Y + 22} className="rating-spread-label" textAnchor="middle">
              {tick}
            </text>
          </g>
        ))}
        <text x={x(MEAN)} y={y(MEAN) - 10} className="rating-spread-label" textAnchor="middle">
          start
        </text>
      </svg>
      <figcaption>
        Where ratings tend to settle. Everyone begins at 1200 and spreads out from there — winning
        against the prediction moves you right, losing to it moves you left. This curve is drawn
        from the shape the math produces, not from real games.
      </figcaption>
    </figure>
  );
}
