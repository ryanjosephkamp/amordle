'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { hardModeViolationForEvidence } from '@/domain/game';
import type { Tile } from '@/domain/game';

/*
 * V7.2-04. The Help figures describe the game rather than showing it. These four run a
 * short terminal-style sequence — one beat per step, no easing — the first time they
 * scroll into view, then rest.
 *
 * Two properties make that safe rather than clever:
 *
 * The finished state is the INITIAL state. Every aid renders fully resolved on the
 * server, and the sequence only starts if a client with motion enabled scrolls it into
 * view. So no JavaScript, no IntersectionObserver, reduced motion, or a crawler all get
 * the complete figure — never a blank box waiting for an animation that will not run.
 * The global reduced-motion block only stops CSS animation; a JS timer would sail
 * straight through it, so the check is made here explicitly.
 *
 * Nothing is animated by fading text. Letters and labels stay at full opacity
 * throughout; what advances is which tile has resolved its evidence, and where the
 * cursor sits. That keeps every word legible at every instant, keeps the whole
 * explanation in the accessibility tree the entire time, and keeps the contrast sweep
 * measuring real colours instead of half-faded ones.
 */
const BEAT_MS = 320;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function useTerminalSequence(total: number) {
  const ref = useRef<HTMLElement | null>(null);
  const timers = useRef<number[]>([]);
  // Starts finished. Only a client that can animate ever winds it back.
  const [step, setStep] = useState(total);

  const clear = useCallback(() => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  }, []);

  const play = useCallback(() => {
    clear();
    if (prefersReducedMotion()) {
      setStep(total);
      return;
    }
    setStep(0);
    for (let index = 1; index <= total; index += 1) {
      timers.current.push(window.setTimeout(() => setStep(index), BEAT_MS * index));
    }
  }, [clear, total]);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        play();
      },
      { threshold: 0.35 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      clear();
    };
  }, [clear, play]);

  return { ref, step, play };
}

function ReplayButton({ onClick, label }: { onClick(): void; label: string }) {
  return (
    <button type="button" className="help-replay" onClick={onClick}>
      <span aria-hidden="true">↻</span> replay
      <span className="sr-only"> {label}</span>
    </button>
  );
}

export function TileEvidenceAid() {
  const tiles = [
    { letter: 'C', state: 'correct', mark: '✓', label: 'correct spot' },
    { letter: 'R', state: 'present', mark: '~', label: 'present elsewhere' },
    { letter: 'A', state: 'absent', mark: '×', label: 'not in the word' },
  ] as const;
  const { ref, step, play } = useTerminalSequence(tiles.length);
  return (
    <figure className="help-example help-sequence" ref={ref as React.Ref<HTMLElement>}>
      <figcaption>READ ONE ROW</figcaption>
      <div className="help-tile-row">
        {tiles.map((tile, index) => {
          const resolved = index < step;
          return (
            <div key={tile.letter}>
              <span
                className={`tile ${resolved ? `is-${tile.state}` : 'is-pending'}`}
                data-cursor={index === step ? 'true' : undefined}
                aria-label={`${tile.letter}, ${tile.label}`}
              >
                <span className="tile-letter">{tile.letter}</span>
                <span className="tile-evidence" aria-hidden="true">
                  {resolved ? tile.mark : ''}
                </span>
              </span>
              <small>{tile.label}</small>
            </div>
          );
        })}
      </div>
      <ReplayButton onClick={play} label="the tile evidence example" />
    </figure>
  );
}

export function GoChainAid() {
  const stages = [
    { key: 'one', head: 'PUZZLE 1', body: 'CRANE', note: 'Solved' },
    { key: 'carry', head: '→', body: 'SEED EVIDENCE', note: 'Carried forward' },
    { key: 'two', head: 'PUZZLE 2', body: 'CRANE', note: 'Does not spend an attempt' },
  ] as const;
  const { ref, step, play } = useTerminalSequence(stages.length);
  return (
    <figure
      className="help-example help-chain help-sequence"
      aria-labelledby="help-go-caption"
      ref={ref as React.Ref<HTMLElement>}
    >
      <figcaption id="help-go-caption">
        ONE ANSWER BECOMES THE NEXT PUZZLE&apos;S EVIDENCE
      </figcaption>
      <ol>
        {stages.map((stage, index) => (
          <li key={stage.key} data-reached={index < step ? 'true' : undefined}>
            <span aria-hidden={stage.key === 'carry' ? 'true' : undefined}>{stage.head}</span>
            <strong>{stage.body}</strong>
            <small>{stage.note}</small>
          </li>
        ))}
      </ol>
      <ReplayButton onClick={play} label="the GO chain example" />
    </figure>
  );
}

export function PracticeDailyAid() {
  const lanes = [
    { key: 'practice', name: 'PRACTICE', facts: ['2–35 letters', 'OG or GO', 'Replay anytime'] },
    {
      key: 'daily',
      name: 'DAILY',
      facts: ['5 letters', 'OG or five-puzzle GO', 'One dated challenge'],
    },
  ] as const;
  const { ref, step, play } = useTerminalSequence(lanes.length);
  return (
    <figure
      className="help-example help-lane-comparison help-sequence"
      ref={ref as React.Ref<HTMLElement>}
    >
      <figcaption>CHOOSE THE LANE THAT FITS</figcaption>
      {lanes.map((lane, index) => (
        <div key={lane.key} data-reached={index < step ? 'true' : undefined}>
          <strong>{lane.name}</strong>
          {lane.facts.map((fact) => (
            <span key={fact}>{fact}</span>
          ))}
        </div>
      ))}
      <ReplayButton onClick={play} label="the lane comparison" />
    </figure>
  );
}

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
