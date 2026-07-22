import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../app/auth-context';
import { Button, ButtonLink } from '../../components/Button';
import { Disclosure } from '../../components/Disclosure';
import { PageHeader, RuledList, SectionHeading } from '../../components/Surface';
import { readLocalSoloProjections } from '../supporting/local-solo-projections';

export function PlayPage() {
  const navigate = useNavigate();
  const { identity, status: authStatus } = useAuth();
  const [mode, setMode] = useState<'og' | 'go'>('og');
  const [length, setLength] = useState(5);
  const [difficulty, setDifficulty] = useState('expert');
  const [hard, setHard] = useState(false);
  const [count, setCount] = useState(5);
  const activeSolo = useMemo(
    () =>
      authStatus === 'loading'
        ? []
        : readLocalSoloProjections(identity).filter((session) => session.status === 'playing'),
    [authStatus, identity],
  );
  return (
    <div className="page page--play-overview">
      <PageHeader
        title="Play"
        eyebrow={
          authStatus === 'loading'
            ? 'Solo · checking identity'
            : `Solo · ${activeSolo.length} active`
        }
      />
      <nav className="subnav" aria-label="Solo">
        <a aria-current="page" href="#formats">
          Overview
        </a>
        <ButtonLink to="/play/daily/og" tone="quiet">
          Daily
        </ButtonLink>
        <ButtonLink to="/play/practice/og" tone="quiet">
          Practice
        </ButtonLink>
        <a href="#active">
          Active
          <span
            className="subnav-badge"
            aria-label={`${activeSolo.length} active Solo ${activeSolo.length === 1 ? 'session' : 'sessions'}`}
          >
            {activeSolo.length}
          </span>
        </a>
      </nav>
      <SectionHeading title="Choose a format" />
      <div className="format-grid" id="formats">
        <section>
          <strong className="display-mark">OG</strong>
          <p>One word · one board</p>
          <ButtonLink to="/play/daily/og" tone="primary">
            Daily OG
          </ButtonLink>
          <ButtonLink to="/play/practice/og">Practice OG</ButtonLink>
        </section>
        <section>
          <strong className="display-mark">GO</strong>
          <p>Linked word chain</p>
          <ButtonLink to="/play/daily/go">Daily GO</ButtonLink>
          <ButtonLink to="/play/practice/go">Practice GO</ButtonLink>
        </section>
      </div>
      <SectionHeading title="Configure Practice" />
      <form
        className="practice-form"
        onSubmit={(event) => {
          event.preventDefault();
          const search = new URLSearchParams({
            length: String(length),
            difficulty,
            ...(hard ? { hard: '1' } : {}),
            ...(mode === 'go' ? { count: String(count) } : {}),
          });
          navigate(`/play/practice/${mode}?${search}`);
        }}
      >
        <label>
          Format
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value === 'go' ? 'go' : 'og')}
          >
            <option value="og">OG · one puzzle</option>
            <option value="go">GO · linked chain</option>
          </select>
        </label>
        <label>
          Word length · 2–35
          <input
            type="number"
            min="2"
            max="35"
            value={length}
            onChange={(event) =>
              setLength(Math.min(35, Math.max(2, event.target.valueAsNumber || 5)))
            }
          />
        </label>
        <label>
          Difficulty
          <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
            <option value="casual">Casual</option>
            <option value="standard">Standard</option>
            <option value="expert">Expert</option>
          </select>
        </label>
        {mode === 'go' ? (
          <label>
            Chain count
            <select value={count} onChange={(event) => setCount(Number(event.target.value))}>
              <option value="5">5 puzzles</option>
              <option value="7">7 puzzles</option>
              <option value="10">10 puzzles</option>
            </select>
          </label>
        ) : null}
        <label className="check-control">
          <input
            type="checkbox"
            checked={hard}
            onChange={(event) => setHard(event.target.checked)}
          />{' '}
          Hard Mode
        </label>
        <Button type="submit" tone="primary">
          Start configured Practice
        </Button>
      </form>
      <SectionHeading title="Active Solo" />
      <div id="active">
        <RuledList>
          {authStatus === 'loading' ? (
            <p className="support-state" role="status">
              Checking the identity namespace before reading active sessions…
            </p>
          ) : null}
          {authStatus !== 'loading'
            ? activeSolo.map((session) => (
                <div className="record-row" key={session.id}>
                  <span className="mode-mark">{session.mode.toUpperCase()}</span>
                  <div>
                    <strong>{session.label}</strong>
                    <small>{session.detail}</small>
                  </div>
                  <ButtonLink to={session.route} tone="primary">
                    Resume {session.mode.toUpperCase()}
                  </ButtonLink>
                </div>
              ))
            : null}
          {authStatus !== 'loading' && activeSolo.length === 0 ? (
            <p className="empty-state">
              No resumable Solo sessions exist in this identity namespace. Start a Daily or Practice
              game above.
            </p>
          ) : null}
        </RuledList>
      </div>
      <Disclosure label="Recent Solo results" meta="Newest first">
        <p>
          Your completed local results remain in History. Active answers never appear in overview
          rows.
        </p>
        <ButtonLink to="/history">Open Solo History</ButtonLink>
      </Disclosure>
    </div>
  );
}
