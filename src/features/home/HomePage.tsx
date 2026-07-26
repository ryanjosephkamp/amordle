import { useMemo } from 'react';
import { ButtonLink } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { PageHeader, RuledList, SectionHeading, StatusDot } from '../../components/Surface';
import { useAuth } from '../../app/auth-context';
import { usePlayerState } from '../../app/player-state-context';
import { levelForXp } from '../../domain/progression';
import { readLocalSoloProjections } from '../supporting/local-solo-projections';

export function HomePage() {
  const { identity, status: authStatus } = useAuth();
  const { progression } = usePlayerState();
  const level = levelForXp(progression.xp);
  const activeSolo = useMemo(
    () =>
      authStatus === 'loading'
        ? []
        : readLocalSoloProjections(identity).filter((session) => session.status === 'playing'),
    [authStatus, identity],
  );
  const resume = activeSolo[0];
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
            {authStatus === 'loading' ? (
              <p className="support-state" role="status">
                Checking for saved games…
              </p>
            ) : resume ? (
              <div className="record-row record-row--resume">
                <span className="mode-mark">{resume.mode.toUpperCase()}</span>
                <div>
                  <strong>{resume.label}</strong>
                  <small>{resume.detail}</small>
                </div>
                <ButtonLink to={resume.route} tone="primary">
                  Resume {resume.mode.toUpperCase()}
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
            {authStatus === 'loading' ? (
              <p role="status">Loading account data…</p>
            ) : (
              <>
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
                <small>Saved for this player.</small>
              </>
            )}
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
