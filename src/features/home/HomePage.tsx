import { ButtonLink } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { PageHeader, RuledList, SectionHeading, StatusDot } from '../../components/Surface';
import { useAuth } from '../../app/auth-context';
import { usePlayerState } from '../../app/player-state-context';
import { levelForXp } from '../../domain/progression';

export function HomePage() {
  const { status: authStatus } = useAuth();
  const { progression } = usePlayerState();
  const level = levelForXp(progression.xp);
  return (
    <div className="page page--home">
      <PageHeader title="Home" eyebrow="Local launch" />
      <div className="home-ledger">
        <div className="home-ledger__primary">
          <SectionHeading title="Choose your path" />
          <div className="launch-grid">
            <section className="launch-gate">
              <Icon name="user" />
              <h2>Play Solo</h2>
              <p>Daily or Practice · OG or GO</p>
              <ButtonLink to="/play" tone="primary">
                Open Play
              </ButtonLink>
            </section>
            <section className="launch-gate">
              <Icon name="combat" />
              <h2>Enter Combat</h2>
              <p>Daily or Practice · Lobby · Active</p>
              <ButtonLink to="/combat">Open Combat</ButtonLink>
            </section>
          </div>

          <SectionHeading title="Local resume" />
          <RuledList>
            {import.meta.env.DEV ? (
              <div className="record-row record-row--resume">
                <span className="mode-mark">GO</span>
                <div>
                  <strong>Practice Solo · GO · 5L</strong>
                  <small>Puzzle 2/3 · 0/6 guesses · 1 prior answer carried</small>
                </div>
                <ButtonLink to="/play/practice/go" tone="primary">
                  Resume GO
                </ButtonLink>
              </div>
            ) : (
              <p className="empty-state">
                Open Play to create or restore an identity-scoped Solo session.
              </p>
            )}
          </RuledList>

          <SectionHeading title="Today / Routes" />
          <RuledList>
            <div className="route-row">
              <Icon name="daily" />
              <div>
                <strong>Daily Solo</strong>
                <small>Ready now · play Daily</small>
              </div>
              <ButtonLink to="/calendar">Open Daily</ButtonLink>
            </div>
            <div className="route-row">
              <Icon name="combat" />
              <div>
                <strong>Daily Combat</strong>
                <small>Authentication required</small>
              </div>
              <ButtonLink to="/combat/daily">Open Daily</ButtonLink>
            </div>
            <div className="route-row">
              <Icon name="combat" />
              <div>
                <strong>Lobby</strong>
                <small>Browse Practice lobbies</small>
              </div>
              <ButtonLink to="/combat/lobby">Open Lobby</ButtonLink>
            </div>
            <div className="route-row">
              <Icon name="history" />
              <div>
                <strong>History</strong>
                <small>Local Solo results</small>
              </div>
              <ButtonLink to="/history">Open History</ButtonLink>
            </div>
          </RuledList>
          <p className="microcopy">
            Practice-only Live is available from COMBAT; Daily spectator access is excluded.
          </p>
        </div>
        <aside className="home-ledger__context" aria-label="Local guest context">
          <section className="progress-block">
            <h2>Local progress</h2>
            <strong>Level {level.level}</strong>
            <progress
              max={level.nextLevelCost}
              value={level.currentLevelXp}
              aria-label={`${level.currentLevelXp} of ${level.nextLevelCost} XP`}
            />
            <p>
              {level.currentLevelXp} / {level.nextLevelCost} XP
            </p>
            <p>{progression.coins} coins</p>
            <small>Saved on this device.</small>
          </section>
          <div className="privacy-note">
            <Icon name="info" />
            <div>
              <StatusDot tone="ice">
                {authStatus === 'authenticated'
                  ? 'Signed in'
                  : authStatus === 'loading'
                    ? 'Checking account'
                    : 'Signed out'}
              </StatusDot>
              <p>
                {authStatus === 'authenticated'
                  ? 'Account-scoped services are available; public identity remains separately controlled.'
                  : 'Account-owned COMBAT activity is hidden. Guest Solo remains available.'}
              </p>
              {authStatus === 'authenticated' ? (
                <ButtonLink to="/profile">Open profile</ButtonLink>
              ) : (
                <ButtonLink to="/auth">Sign in to sync</ButtonLink>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
