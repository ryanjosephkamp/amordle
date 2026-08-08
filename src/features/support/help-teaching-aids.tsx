import { ECONOMY_PRICES } from '@/domain/economy';

/*
 * W5.1. Owner ruling: watching three colours appear teaches nothing, and replaying it is
 * cosmetic. Only the finished frame remains, statically.
 *
 * This is a clean subtraction rather than a rewrite, because of how the animation was
 * built: the sequence started at its final step and only wound back on a client that
 * could animate, so the resolved tiles below are exactly what a crawler, a reader with
 * reduced motion, or a browser with no JavaScript already saw. Losing the sequence also
 * moves the figure out of the client bundle entirely — this module is server-only.
 */
export function TileEvidenceAid() {
  const tiles = [
    { letter: 'C', state: 'correct', mark: '✓', label: 'correct spot' },
    { letter: 'R', state: 'present', mark: '~', label: 'present elsewhere' },
    { letter: 'A', state: 'absent', mark: '×', label: 'not in the word' },
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
                {tile.mark}
              </span>
            </span>
            <small>{tile.label}</small>
          </div>
        ))}
      </div>
    </figure>
  );
}

/*
 * W5.3. Owner ruling: the animation "just lights up some colours", and a good animation
 * for a side-by-side comparison is hard to justify, so none is forced.
 *
 * Unlike the tile figure this was NOT a clean subtraction. The accent rail down each lane
 * painted only through `data-reached`, an attribute that existed solely because the
 * sequence pre-set its own final step — so removing the sequence would have silently
 * removed the rail too. The honest fix is in the stylesheet, where the rail is now
 * unconditional; hard-coding `data-reached="true"` on a static figure to keep an
 * assertion green would have left a lie in the markup.
 */
export function PracticeDailyAid() {
  const lanes = [
    { key: 'practice', name: 'PRACTICE', facts: ['2–35 letters', 'OG or GO', 'Replay anytime'] },
    {
      key: 'daily',
      name: 'DAILY',
      facts: ['5 letters', 'OG or five-puzzle GO', 'One dated challenge'],
    },
  ] as const;
  return (
    <figure className="help-example help-lane-comparison">
      <figcaption>CHOOSE THE LANE THAT FITS</figcaption>
      {lanes.map((lane) => (
        <div key={lane.key}>
          <strong>{lane.name}</strong>
          {lane.facts.map((fact) => (
            <span key={fact}>{fact}</span>
          ))}
        </div>
      ))}
    </figure>
  );
}

export function CoinsToolsTeachingAid() {
  return (
    <figure className="help-example help-tools-aid">
      <figcaption>COINS BUY AUTHORITATIVE, IDEMPOTENT GAME ACTIONS</figcaption>
      <div className="help-tool-grid">
        <div>
          <strong>REVEAL</strong>
          <span>{ECONOMY_PRICES.reveal} coins</span>
          <small>Lock one position</small>
        </div>
        <div>
          <strong>REMOVE</strong>
          <span>{ECONOMY_PRICES.remove} coins</span>
          <small>Rule out impossible keys</small>
        </div>
        <div>
          <strong>PAST DAILY</strong>
          <span>{ECONOMY_PRICES.dailyUnlock} coins</span>
          <small>Unlock one date</small>
        </div>
        <div>
          <strong>CONTINUE</strong>
          <span>price varies</span>
          <small>Add one Practice attempt</small>
        </div>
      </div>
      <p>Buttons show inventory or price before confirmation. Safe retries never charge twice.</p>
    </figure>
  );
}

export function AccessTeachingAid() {
  return (
    <figure className="help-example help-keys-aid">
      <figcaption>THE SAME CONTROLS WORK WITHOUT A POINTER</figcaption>
      <div>
        <kbd>Tab</kbd>
        <span>next control</span>
      </div>
      <div>
        <kbd>Shift</kbd> + <kbd>Tab</kbd>
        <span>previous control</span>
      </div>
      <div>
        <kbd>Enter</kbd> / <kbd>Space</kbd>
        <span>activate</span>
      </div>
      <div>
        <kbd>Esc</kbd>
        <span>close a menu or dialog</span>
      </div>
      <p>
        During a game, open Menu and choose <strong>Enter Focus Mode</strong>. Account, alerts, and
        a guaranteed exit remain available.
      </p>
    </figure>
  );
}

export function PrivacyTeachingAid() {
  return (
    <figure className="help-example help-privacy-aid">
      <figcaption>PUBLIC PLAY NEVER OPENS PRIVATE ACCOUNT DATA</figcaption>
      <dl>
        <div>
          <dt>PUBLIC</dt>
          <dd>player identity and allowed COMBAT totals</dd>
        </div>
        <div>
          <dt>PRIVATE</dt>
          <dd>email, Solo History, settings, economy, answers, and seeds</dd>
        </div>
      </dl>
    </figure>
  );
}
