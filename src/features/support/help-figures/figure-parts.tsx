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

/* Memoised for the same reason, and it matters more here: 26 keys x 2 keyboards, against
   an evidence object that only changes when a guess resolves. */
export const FigureKeyboard = memo(function FigureKeyboard({
  evidence,
}: {
  evidence: Record<string, EvidenceState>;
}) {
  return (
    <div className="keyboard">
      {KEYBOARD_ROWS.map((row) => (
        <div className="keyboard-row" key={row}>
          {[...row].map((letter) => {
            const state = evidence[letter] ?? 'unknown';
            const mark = EVIDENCE_MARK[state];
            return (
              <span className={`key ${EVIDENCE_CLASS[state] ?? 'is-unknown'}`} key={letter}>
                {letter.toUpperCase()}
                {state === 'absent' || state === 'removed' ? (
                  <span className="key-evidence">{mark}</span>
                ) : null}
              </span>
            );
          })}
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
