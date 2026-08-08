'use client';

import { useState } from 'react';
import { hardModeViolationForEvidence } from '@/domain/game';
import type { Tile } from '@/domain/game';

/*
 * Hard Mode is the one Help figure the owner asked to leave exactly as it is, and it is
 * the only thing left in this module.
 *
 * The terminal-sequence machinery that used to live here — the beat timer, the reduced-
 * motion check, the replay button — moved to `help-figures/figure-runtime.tsx` when the
 * other three aids were removed or replaced in v7.3. This aid never used it: it is
 * interactive rather than animated, judged by the real rule function on every click.
 */
/*
 * The evidence this aid teaches from, as real tiles. Deriving the verdicts from
 * `hardModeViolationForEvidence` rather than writing them out means the page cannot
 * drift from the rule the game enforces — if Hard Mode ever changes, this changes with
 * it or the test below it fails.
 */
const HARD_MODE_EVIDENCE: ReadonlyArray<{ tiles: Tile[] }> = [
  {
    tiles: [
      { letter: 'g', state: 'absent' },
      { letter: 'e', state: 'present' },
      { letter: 'n', state: 'absent' },
      { letter: 'e', state: 'present' },
      { letter: 's', state: 'correct' },
    ],
  },
];

const HARD_MODE_CANDIDATES = ['meets', 'mates', 'glees', 'melee'] as const;

export function HardModeAid() {
  const [picked, setPicked] = useState<string | null>(null);
  const violation =
    picked === null
      ? null
      : hardModeViolationForEvidence({
          rows: HARD_MODE_EVIDENCE,
          enabled: true,
          guess: picked,
        });
  const evidence = HARD_MODE_EVIDENCE[0]!.tiles;
  return (
    <figure className="help-example help-hard-mode">
      <figcaption>BUILD A COMPATIBLE HARD MODE GUESS</figcaption>
      <div
        className="help-hard-evidence"
        aria-label="Evidence so far: G absent, E present, N absent, E present, S correct in position 5"
      >
        {evidence.map((tile, index) => (
          <span key={`${tile.letter}-${index}`} className={`tile is-${tile.state}`}>
            <span className="tile-letter">{tile.letter.toUpperCase()}</span>
            <span className="tile-evidence" aria-hidden="true">
              {tile.state === 'correct' ? '✓' : tile.state === 'present' ? '~' : '×'}
            </span>
          </span>
        ))}
      </div>
      <p className="help-hard-prompt" id="help-hard-prompt">
        Try a guess. Hard Mode judges each one with the same rule the game uses.
      </p>
      <div className="help-hard-candidates" role="group" aria-labelledby="help-hard-prompt">
        {HARD_MODE_CANDIDATES.map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={picked === candidate}
            onClick={() => setPicked(candidate)}
          >
            {candidate.toUpperCase()}
          </button>
        ))}
      </div>
      <p className="help-hard-verdict" role="status" data-verdict={picked ? 'shown' : 'idle'}>
        {picked === null ? (
          'No guess tried yet.'
        ) : violation === null ? (
          <span className="is-accepted">
            <strong>ACCEPTED</strong> {picked.toUpperCase()} keeps every proven letter.
          </span>
        ) : (
          <span className="is-refused">
            <strong>REFUSED</strong> {violation}
          </span>
        )}
      </p>
      <p>Yellow evidence proves the letter and its multiplicity—not a permanent position ban.</p>
    </figure>
  );
}
