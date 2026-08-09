import { memo } from 'react';
import type { EvidenceState } from '@/domain/game';
import type { CalendarDay, FigureRow, FigureTile } from './scripts';

/*
 * Stateless drawing for the Help figures.
 *
 * These deliberately do NOT reuse `BoardRow`, `DraftRow`, `MoveBoards` or `GameKeyboard`.
 * Those carry table semantics, per-move aria text, scroll-follow behaviour and required
 * event handlers — everything a playable board needs and a decorative figure must not
 * have. What is shared is the thing that actually matters: the class names, so both are
 * painted by `board-surface.css` and cannot drift apart visually.
 *
 * The keyboard is built from <span>, not <button>. A figure is not a control: buttons here
 * would add 56 tab stops to /help and pull 56 nodes into the control contrast sweep.
 */

const EVIDENCE_CLASS: Record<string, string> = {
  correct: 'is-correct',
  present: 'is-present',
  absent: 'is-absent',
  removed: 'is-removed',
  unknown: 'is-unknown',
  draft: '',
};

const EVIDENCE_MARK: Record<string, string> = {
  correct: '✓',
  present: '~',
  absent: '×',
  removed: '−',
};

function FigureTileCell({ tile }: { tile: FigureTile }) {
  const className = ['tile', EVIDENCE_CLASS[tile.state] ?? '', tile.revealed ? 'is-revealed' : '']
    .filter(Boolean)
    .join(' ');
  if (!tile.letter) return <div className={className} />;
  const mark = EVIDENCE_MARK[tile.state];
  return (
    <div className={className}>
      <span className="tile-letter">{tile.letter.toUpperCase()}</span>
      {mark ? (
        <span className="tile-evidence" aria-hidden="true">
          {mark}
        </span>
      ) : null}
    </div>
  );
}

/*
 * Memoised on the row object. The frame builders share one immutable `FigureRow` across
 * every frame in which that row is unchanged, so a player typing five letters re-renders
 * the draft row alone instead of the whole board — which is what keeps a nine-row COMBAT
 * board with two keyboards from re-rendering roughly 150 nodes nine times a second.
 */
const FigureBoardRow = memo(function FigureBoardRow({ row }: { row: FigureRow }) {
  return (
    <div className="help-board-entry">
      <span className={row.seed ? 'help-row-meta is-seed' : 'help-row-meta'}>{row.meta ?? ''}</span>
      <div className={row.draft ? 'board-row is-draft' : 'board-row'}>
        {row.tiles.map((tile, position) => (
          <FigureTileCell tile={tile} key={position} />
        ))}
      </div>
    </div>
  );
});

export function FigureBoard({ rows }: { rows: readonly FigureRow[] }) {
  return (
    <div className="help-board">
      {rows.map((row, index) => (
        <FigureBoardRow row={row} key={`${row.meta ?? ''}:${index}`} />
      ))}
    </div>
  );
}

const KEYBOARD_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'] as const;

/*
 * Memoised for the same reason as the board row, and it matters more here: 26 keys x 2
 * keyboards, against an evidence object that only changes when a guess resolves.
 *
 * `pressed` is the letter (or `submit`) being struck on this frame, and it is passed only
 * to the side on move — so a player's own keys light as they type while the opponent's
 * stay still, which is what makes the two keyboards read as belonging to two people.
 *
 * The row structure mirrors `game-keyboard.tsx` exactly, SUBMIT first and DELETE last on
 * row three. Without them the figure's row three had seven keys where the real one has
 * nine, which made its letters WIDER than row one when the real ones are narrower — the
 * most visible part of "these do not look like the real keyboard".
 */
export const FigureKeyboard = memo(function FigureKeyboard({
  evidence,
  pressed,
}: {
  evidence: Record<string, EvidenceState>;
  pressed?: string | undefined;
}) {
  const wideKey = (label: string) => (
    <span
      className={
        pressed === label.toLowerCase()
          ? 'key is-wide is-unknown is-pressed'
          : 'key is-wide is-unknown'
      }
    >
      {label}
    </span>
  );
  return (
    <div className="keyboard">
      {KEYBOARD_ROWS.map((row, rowIndex) => (
        <div className="keyboard-row" key={row}>
          {rowIndex === 2 && wideKey('SUBMIT')}
          {[...row].map((letter) => {
            const state = evidence[letter] ?? 'unknown';
            const mark = EVIDENCE_MARK[state];
            const classes = ['key', EVIDENCE_CLASS[state] ?? 'is-unknown'];
            if (pressed === letter) classes.push('is-pressed');
            return (
              <span className={classes.filter(Boolean).join(' ')} key={letter}>
                {letter.toUpperCase()}
                {state === 'absent' || state === 'removed' ? (
                  <span className="key-evidence" aria-hidden="true">
                    {mark}
                  </span>
                ) : null}
              </span>
            );
          })}
          {rowIndex === 2 && wideKey('DELETE')}
        </div>
      ))}
    </div>
  );
});

export function FigureCalendar({ days }: { days: readonly CalendarDay[] }) {
  return (
    <div className="help-calendar">
      <div className="help-weekdays">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, index) => (
          <span key={`${label}${index}`}>{label}</span>
        ))}
      </div>
      <div className="help-calendar-grid">
        {days.map((day) => (
          <span
            className={[
              'help-day',
              day.future ? 'is-future' : '',
              day.target ? 'is-target' : '',
              day.selected ? 'is-selected' : '',
              day.unlocked ? 'is-unlocked' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            key={day.day}
          >
            <span>{day.day}</span>
            <small>{day.label}</small>
          </span>
        ))}
      </div>
    </div>
  );
}

export function FigureToolButton({ label, firing }: { label: string; firing: boolean }) {
  return (
    <div className="help-tool-bar">
      <span className={firing ? 'help-tool-button is-firing' : 'help-tool-button'}>{label}</span>
    </div>
  );
}
