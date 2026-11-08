import type { ReactNode } from 'react';
import Link from 'next/link';
import { CreditRow } from '@/components/credit-row';
import { RouteHeader } from '@/components/route-states';
import {
  directNavigationShortcuts,
  keyboardInteractionPatterns,
  keyboardShortcutRules,
} from '@/application/keyboard-shortcuts';
import {
  AccessTeachingAid,
  CoinsToolsTeachingAid,
  PracticeDailyAid,
  PrivacyTeachingAid,
  TileEvidenceAid,
} from '@/features/support/help-teaching-aids';
import { HardModeAid } from '@/features/support/help-live-aids';
import {
  CombatBoardFigure,
  ContinueToolFigure,
  GoChainFigure,
  PastDailyToolFigure,
  RemoveToolFigure,
  RevealToolFigure,
} from '@/features/support/help-figures/figures';
import '@/features/board/board-surface.css';
import './help-figures.css';

/*
 * The second element is a ReactNode rather than a string because several of these
 * sections are genuinely lists, and a `<ul>` cannot live inside the `<p>` the map used
 * to wrap every entry in.
 */
const sections: ReadonlyArray<readonly [string, ReactNode]> = [
  [
    'OG and scoring',
    <>
      <p>OG ≈ Wordle (but better!):</p>
      <ul>
        <li>One puzzle, one answer.</li>
        <li>One colored tile per valid guess letter.</li>
        <li>Green (✓) = letter in word AND in correct position.</li>
        <li>Yellow (~) = letter in word BUT in wrong position.</li>
        <li>Dark (×) = letter not in word.</li>
        <li>
          NOTE: If a guess has more copies of a letter than the answer contains, extras are marked
          dark.
        </li>
      </ul>
      <p>
        Reading one row: in the sample row, C is green (correct spot), R is yellow (present
        elsewhere), and A is dark (not in the word).
      </p>
    </>,
  ],
  [
    'GO chains',
    <>
      <p>GO ≈ Hurdle (but better!):</p>
      <ul>
        <li>OG/Wordle, but in a multi-puzzle chain.</li>
        <li>5, 7, or 10 puzzles (always 5 for Daily).</li>
        <li>Each solved answer carries forward as a guess in the next puzzle.</li>
      </ul>
    </>,
  ],
  [
    'Practice and Daily',
    <>
      <p>Practice:</p>
      <ul>
        <li>2–35 letters.</li>
        <li>3 nested difficulties.</li>
        <li>Optional Hard Mode.</li>
      </ul>
      <p>Daily:</p>
      <ul>
        <li>Solo Daily: 5 letters, rolls over at your local midnight.</li>
        <li>
          COMBAT Daily: 5 letters, rolls over at midnight UTC (Coordinated Universal Time), so a
          ranked match is the same puzzle everywhere.
        </li>
      </ul>
    </>,
  ],
  [
    'Hard Mode',
    <>
      <p>Same as Wordle and Hurdle:</p>
      <ul>
        <li>Green letters (✓): must stay fixed.</li>
        <li>
          Yellow letters (~): must appear in later guesses at least as many times as the evidence
          shows.
        </li>
        <li>Dark letters (×): must be avoided if completely absent.</li>
      </ul>
    </>,
  ],
  [
    'COMBAT',
    'COMBAT needs an account. Players alternate accepted turns. Refreshing never spends a turn, and rejected guesses change nothing. Public Live views are read-only and keep private player details hidden.',
  ],
  [
    'Coins and tools',
    'Reveal One Letter costs 25 coins and Remove Incorrect Letters costs 40. A locked past Daily costs 60. Continuations add exactly one Practice attempt and become more expensive as they are used. Retrying a confirmed purchase never charges twice.',
  ],
  [
    'Daily streak',
    <>
      <p>
        Your streak counts consecutive days on which you finished a Daily, OG or GO. Finishing
        counts, not winning, so a Daily you lose keeps it. Miss a day and it starts over at one.
        Unlocking a past Daily can&rsquo;t repair a streak.{' '}
        <Link href="/methodology">The methodology page</Link> has the exact rules.
      </p>
    </>,
  ],
  [
    'Access and navigation',
    'Use Tab and Shift+Tab to move, Enter or Space to activate controls, and Escape to close menus or dialogs. During a game, Focus Mode removes surrounding navigation while retaining Account, alerts, and an explicit exit.',
  ],
  [
    'Privacy',
    'Public player links never reveal private account details. Spectators cannot see private requests, hidden answers, or controls that change a match. Guest progress stays separate when you sign in.',
  ],
] as const;

export default function HelpPage() {
  return (
    <div className="route-frame is-narrow">
      <RouteHeader title="Help">
        <p>Rules, evidence, controls, access, and privacy in one place.</p>
      </RouteHeader>
      <div className="prose-sections">
        {sections.map(([title, content]) => (
          <section key={title}>
            <h2>{title}</h2>
            {typeof content === 'string' ? <p>{content}</p> : content}
            {title === 'OG and scoring' && <TileEvidenceAid />}
            {title === 'GO chains' && <GoChainFigure />}
            {title === 'Practice and Daily' && <PracticeDailyAid />}
            {title === 'Hard Mode' && <HardModeAid />}
            {title === 'COMBAT' && <CombatBoardFigure />}
            {title === 'Coins and tools' && (
              <>
                <CoinsToolsTeachingAid />
                <RevealToolFigure />
                <RemoveToolFigure />
                <PastDailyToolFigure />
                <ContinueToolFigure />
              </>
            )}
            {title === 'Access and navigation' && <AccessTeachingAid />}
            {title === 'Privacy' && <PrivacyTeachingAid />}
          </section>
        ))}
        <details className="help-advanced" id="keyboard-navigation">
          <summary>Mouse-free mode – for keyboard diehards</summary>
          <div>
            <p>
              The entire interface remains clickable and touch-friendly. On desktop, these shortcuts
              provide a faster optional route through the shell.
            </p>
            <div className="table-scroll">
              <table className="responsive-table keyboard-shortcut-table">
                <thead>
                  <tr>
                    <th>Keys</th>
                    <th>Action</th>
                    <th>Behavior</th>
                  </tr>
                </thead>
                <tbody>
                  {[...directNavigationShortcuts, ...keyboardInteractionPatterns].map(
                    (shortcut) => (
                      <tr key={shortcut.id}>
                        <td data-label="Keys">
                          <kbd>{shortcut.keys}</kbd>
                        </td>
                        <td data-label="Action">{shortcut.label}</td>
                        <td data-label="Behavior">{shortcut.description}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
            <ul>
              {keyboardShortcutRules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </div>
        </details>
      </div>
      <CreditRow />
    </div>
  );
}
