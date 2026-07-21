import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, ButtonLink } from '../../components/Button';
import { Disclosure } from '../../components/Disclosure';
import { PageHeader, RuledList, SectionHeading } from '../../components/Surface';

export function PlayPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'og' | 'go'>('og');
  const [length, setLength] = useState(5);
  const [difficulty, setDifficulty] = useState('expert');
  const [hard, setHard] = useState(false);
  const [count, setCount] = useState(5);
  return (
    <div className="page page--play-overview">
      <PageHeader title="Play" eyebrow="Solo · 2 active" />
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
        <a href="#active">Active 2</a>
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
      <RuledList>
        <div className="record-row">
          <span className="mode-mark">GO</span>
          <div>
            <strong>Practice Solo · GO · 5L</strong>
            <small>Puzzle 2/3 · draft 2/5 · one prior answer carried</small>
          </div>
          <ButtonLink to="/play/practice/go" tone="primary">
            Resume GO
          </ButtonLink>
        </div>
        <div className="record-row">
          <span className="mode-mark">OG</span>
          <div>
            <strong>Daily Solo · OG · 5L</strong>
            <small>1/6 guesses · ready for the next guess</small>
          </div>
          <ButtonLink to="/play/daily/og" tone="primary">
            Resume OG
          </ButtonLink>
        </div>
      </RuledList>
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
