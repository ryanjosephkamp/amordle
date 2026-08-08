'use client';

import { useMemo } from 'react';
import { ECONOMY_PRICES } from '@/domain/economy';
import { FigureBoard, FigureCalendar, FigureKeyboard, FigureToolButton } from './figure-parts';
import { ReplayButton, useFrameSequence } from './figure-runtime';
import {
  buildCombatFrames,
  buildContinueFrames,
  buildDailyFrames,
  buildGoFrames,
  buildRemoveFrames,
  buildRevealFrames,
  continueFigurePrice,
  COMBAT_NAMES,
} from './scripts';

/*
 * The six Help figures.
 *
 * Every one of them animates a subtree marked `aria-hidden`, with the teaching stated in
 * the figcaption and the live note beside it. That is a deliberate change from v7.2, where
 * the whole explanation stayed in the accessibility tree throughout: these sequences run to
 * roughly 120 frames, and narrating a full eight-row match frame by frame would be hostile
 * rather than helpful. The caption carries the lesson; the animation illustrates it.
 */

function FigureNote({ note }: { note: string }) {
  return (
    <p className="help-note" aria-live="off">
      {note}
    </p>
  );
}

/** W5.2. A real solo GO playthrough — gameplay area only, no keyboard. */
export function GoChainFigure() {
  const frames = useMemo(() => buildGoFrames(), []);
  const { ref, frame, play } = useFrameSequence(frames);
  return (
    <figure
      className="help-example help-figure"
      aria-labelledby="help-go-caption"
      ref={ref as React.Ref<HTMLElement>}
    >
      <figcaption id="help-go-caption">
        ONE ANSWER BECOMES THE NEXT PUZZLE&apos;S EVIDENCE
      </figcaption>
      <div className="help-stage" aria-hidden="true">
        <FigureBoard rows={frame.rows} />
        <FigureNote note={frame.note} />
      </div>
      <ReplayButton onClick={play} label="the GO chain playthrough" />
    </figure>
  );
}

/** W5.4. Two keyboards, one shared board, and a match that runs past row six. */
export function CombatBoardFigure() {
  const frames = useMemo(() => buildCombatFrames(), []);
  const { ref, frame, play } = useFrameSequence(frames);
  const evidence = frame.evidence ?? {};
  return (
    <figure className="help-example help-figure" ref={ref as React.Ref<HTMLElement>}>
      <figcaption>BOTH PLAYERS READ ONE BOARD</figcaption>
      <div className="help-stage" aria-hidden="true">
        <div className="help-combat">
          {/*
           * One evidence object, rendered twice. Two keyboards reading from a single
           * source cannot disagree, which states the shared-evidence lesson in code
           * rather than only in the caption.
           */}
          <div
            className={frame.seat === 0 ? 'help-combat-side is-active' : 'help-combat-side'}
            data-accent="violet"
          >
            <div className="help-combat-name">{COMBAT_NAMES[0]}</div>
            <FigureKeyboard evidence={evidence} />
          </div>
          <div className="help-combat-board">
            <FigureBoard rows={frame.rows} />
          </div>
          <div
            className={frame.seat === 1 ? 'help-combat-side is-active' : 'help-combat-side'}
            data-accent="amber"
          >
            <div className="help-combat-name">{COMBAT_NAMES[1]}</div>
            <FigureKeyboard evidence={evidence} />
          </div>
        </div>
        <FigureNote note={frame.note} />
      </div>
      <ReplayButton onClick={play} label="the COMBAT match" />
    </figure>
  );
}

/** W5.5. Reveal — the bought letter lands in the draft row, outlined, not coloured. */
export function RevealToolFigure() {
  const frames = useMemo(() => buildRevealFrames(), []);
  const { ref, frame, play } = useFrameSequence(frames);
  return (
    <figure className="help-example help-figure" ref={ref as React.Ref<HTMLElement>}>
      <figcaption>REVEAL ONE LETTER</figcaption>
      <div className="help-stage" aria-hidden="true">
        <FigureToolButton
          label={`Reveal one letter · ${ECONOMY_PRICES.reveal} coins`}
          firing={Boolean(frame.firing)}
        />
        <FigureBoard rows={frame.rows} />
        <FigureNote note={frame.note} />
      </div>
      <ReplayButton onClick={play} label="the reveal tool" />
    </figure>
  );
}

/** W5.5. Remove — five letters, which is what the tool actually does. */
export function RemoveToolFigure() {
  const frames = useMemo(() => buildRemoveFrames(), []);
  const { ref, frame, play } = useFrameSequence(frames);
  return (
    <figure className="help-example help-figure" ref={ref as React.Ref<HTMLElement>}>
      <figcaption>REMOVE FIVE WRONG LETTERS</figcaption>
      <div className="help-stage" aria-hidden="true">
        <FigureToolButton
          label={`Remove wrong letters · ${ECONOMY_PRICES.remove} coins`}
          firing={Boolean(frame.firing)}
        />
        <FigureKeyboard evidence={frame.evidence ?? {}} />
        <FigureNote note={frame.note} />
      </div>
      <ReplayButton onClick={play} label="the remove tool" />
    </figure>
  );
}

/** W5.5. Past Daily — a locked date on the calendar, unlocked. */
export function PastDailyToolFigure() {
  const frames = useMemo(() => buildDailyFrames(), []);
  const { ref, frame, play } = useFrameSequence(frames);
  const days = (frame as { days?: Parameters<typeof FigureCalendar>[0]['days'] }).days ?? [];
  return (
    <figure className="help-example help-figure" ref={ref as React.Ref<HTMLElement>}>
      <figcaption>UNLOCK A PAST DAILY</figcaption>
      <div className="help-stage" aria-hidden="true">
        <FigureCalendar days={days} />
        <FigureToolButton
          label={`Unlock · ${ECONOMY_PRICES.dailyUnlock} coins`}
          firing={Boolean(frame.firing)}
        />
        <FigureNote note={frame.note} />
      </div>
      <ReplayButton onClick={play} label="unlocking a past Daily" />
    </figure>
  );
}

/** W5.5. Continue — a seventh row past the sixth, at a computed price. */
export function ContinueToolFigure() {
  const frames = useMemo(() => buildContinueFrames(), []);
  const price = useMemo(() => continueFigurePrice(), []);
  const { ref, frame, play } = useFrameSequence(frames);
  return (
    <figure className="help-example help-figure" ref={ref as React.Ref<HTMLElement>}>
      <figcaption>CONTINUE PAST THE LAST ROW</figcaption>
      <div className="help-stage" aria-hidden="true">
        <FigureBoard rows={frame.rows} />
        {frame.result ? <div className="help-result">{frame.result}</div> : null}
        <FigureToolButton
          label={`Open another row · ${price} coins`}
          firing={Boolean(frame.firing)}
        />
        <FigureNote note={frame.note} />
      </div>
      <ReplayButton onClick={play} label="continuing past the last row" />
    </figure>
  );
}
