import { RouteHeader } from '@/components/route-states';
import {
  directNavigationShortcuts,
  keyboardInteractionPatterns,
  keyboardShortcutRules,
} from '@/application/keyboard-shortcuts';
import {
  AccessTeachingAid,
  CoinsToolsTeachingAid,
  GoChainTeachingAid,
  HardModeTeachingAid,
  PracticeDailyTeachingAid,
  PrivacyTeachingAid,
} from '@/features/support/help-teaching-aids';

const sections = [
  [
    'OG and scoring',
    'OG has one answer. Each accepted guess receives a tile for every letter. Green means correct position, yellow means the letter occurs elsewhere, and a dark tile marked × means no unmatched copy remains. Repeated letters are scored exact positions first, then by remaining multiplicity.',
  ],
  [
    'GO chains',
    'GO links 5, 7, or 10 Practice puzzles; Daily GO always has five. A solved answer stays visible for two seconds, then becomes labeled evidence against the next answer. Those seeded rows inform Hard Mode but do not count as new guesses or points.',
  ],
  [
    'Practice and Daily',
    'Practice supports 2–35 letters, three nested difficulties, and optional Hard Mode. Solo Daily follows your local date and always uses five letters. COMBAT Daily follows UTC.',
  ],
  [
    'Hard Mode',
    'Keep green letters fixed, reuse every proven positive letter at least as many times as evidence shows, and avoid letters shown only as absent. Yellow letters do not create an invented position ban.',
  ],
  [
    'COMBAT',
    'Players alternate accepted turns. Refreshing never spends a turn, and rejected guesses change nothing. Public Live views are read-only and keep private player details hidden.',
  ],
  [
    'Coins and tools',
    'Reveal One Letter costs 25 coins and Remove Incorrect Letters costs 40. A locked past Daily costs 60. Continuations add exactly one Practice attempt and become more expensive as they are used. Retrying a confirmed purchase never charges twice.',
  ],
  [
    'Access and navigation',
    'Use Tab and Shift+Tab to move, Enter or Space to activate controls, and Escape to close menus or dialogs. During a game, Focus Mode removes surrounding navigation while retaining Account, alerts, and an explicit exit. Tile meaning is announced and never relies on color alone.',
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
            <p>{content}</p>
            {title === 'OG and scoring' && <TileEvidenceExample />}
            {title === 'GO chains' && <GoChainTeachingAid />}
            {title === 'Practice and Daily' && <PracticeDailyTeachingAid />}
            {title === 'Hard Mode' && <HardModeTeachingAid />}
            {title === 'COMBAT' && <CombatTurnExample />}
            {title === 'Coins and tools' && <CoinsToolsTeachingAid />}
            {title === 'Access and navigation' && <AccessTeachingAid />}
            {title === 'Privacy' && <PrivacyTeachingAid />}
          </section>
        ))}
        <details className="help-advanced" id="keyboard-navigation">
          <summary>Mouse-free mode — for keyboard diehards</summary>
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
    </div>
  );
}

function TileEvidenceExample() {
  const tiles = [
    { letter: 'C', state: 'correct', label: 'correct spot' },
    { letter: 'R', state: 'present', label: 'present elsewhere' },
    { letter: 'A', state: 'absent', label: 'not in the word' },
  ] as const;
  return (
    <figure className="help-example">
      <figcaption>READ ONE ROW</figcaption>
      <div className="help-tile-row">
        {tiles.map((tile) => (
          <div key={tile.letter}>
            <span className={`tile is-${tile.state}`} aria-label={`${tile.letter}, ${tile.label}`}>
              <span className="tile-letter">{tile.letter}</span>
              <span className="tile-evidence" aria-hidden="true">
                {tile.state === 'correct' ? '✓' : tile.state === 'present' ? '~' : '×'}
              </span>
            </span>
            <small>{tile.label}</small>
          </div>
        ))}
      </div>
    </figure>
  );
}

function CombatTurnExample() {
  return (
    <figure className="help-example">
      <figcaption>FOLLOW THE SHARED BOARD</figcaption>
      <div className="help-combat-row">
        <span>01</span>
        <strong>YOU</strong>
        <span>CRANE</span>
      </div>
      <div className="help-combat-row is-current">
        <span>02</span>
        <strong>RIVAL</strong>
        <span>SLATE · accepted</span>
      </div>
      <p>Next turn: you</p>
    </figure>
  );
}
