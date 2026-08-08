import { ECONOMY_PRICES } from '@/domain/economy';

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
