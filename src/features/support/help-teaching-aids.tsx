import { ECONOMY_PRICES } from '@/domain/economy';

export function GoChainTeachingAid() {
  return (
    <figure className="help-example help-chain" aria-labelledby="help-go-caption">
      <figcaption id="help-go-caption">
        ONE ANSWER BECOMES THE NEXT PUZZLE&apos;S EVIDENCE
      </figcaption>
      <ol>
        <li>
          <span>PUZZLE 1</span>
          <strong>CRANE</strong>
          <small>Solved</small>
        </li>
        <li aria-label="Answer carries forward as seeded evidence">
          <span aria-hidden="true">→</span>
          <strong>SEED EVIDENCE</strong>
          <span aria-hidden="true">→</span>
        </li>
        <li>
          <span>PUZZLE 2</span>
          <strong>CRANE</strong>
          <small>Does not spend an attempt</small>
        </li>
      </ol>
    </figure>
  );
}

export function PracticeDailyTeachingAid() {
  return (
    <figure className="help-example help-lane-comparison">
      <figcaption>CHOOSE THE LANE THAT FITS</figcaption>
      <div>
        <strong>PRACTICE</strong>
        <span>2–35 letters</span>
        <span>OG or GO</span>
        <span>Replay anytime</span>
      </div>
      <div>
        <strong>DAILY</strong>
        <span>5 letters</span>
        <span>OG or five-puzzle GO</span>
        <span>One dated challenge</span>
      </div>
    </figure>
  );
}

export function HardModeTeachingAid() {
  return (
    <figure className="help-example help-hard-mode">
      <figcaption>BUILD A COMPATIBLE HARD MODE GUESS</figcaption>
      <div
        className="help-hard-evidence"
        aria-label="Constraints: S is correct in position 5, E is present elsewhere twice, and G is absent"
      >
        <span className="tile" aria-hidden="true">
          ·
        </span>
        <span className="tile" aria-hidden="true">
          ·
        </span>
        <span className="tile" aria-hidden="true">
          ·
        </span>
        <span className="tile" aria-hidden="true">
          ·
        </span>
        <span className="tile is-correct">
          S<span aria-hidden="true">✓</span>
        </span>
      </div>
      <div className="help-hard-facts" aria-hidden="true">
        <span className="is-present">E × 2 · proven present</span>
        <span className="is-absent">G × · absent</span>
      </div>
      <ul>
        <li>
          <strong>REJECT</strong> missing a proven E
        </li>
        <li>
          <strong>REJECT</strong> moving the fixed S
        </li>
        <li>
          <strong>REJECT</strong> reusing G, known only as absent
        </li>
        <li className="is-accepted">
          <strong>ACCEPT</strong> keeps S fixed and includes both proven E copies
        </li>
      </ul>
      <p>Yellow evidence proves the letter and its multiplicity—not a permanent position ban.</p>
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
