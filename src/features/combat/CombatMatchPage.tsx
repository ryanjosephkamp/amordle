import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Button, ButtonLink } from '../../components/Button';
import { Disclosure } from '../../components/Disclosure';
import { GameBoard, Keyboard, TileLegend, type TileState } from '../../components/GameBoard';
import { emptyRow, tiles } from '../../components/gameBoardData';
import { Icon } from '../../components/Icon';
import { Metric, StatusDot } from '../../components/Surface';

const defaultSharedRows = [
  tiles('CRANE', ['absent', 'present', 'absent', 'correct', 'correct']),
  tiles('MIGHT', ['correct', 'absent', 'present', 'correct', 'absent']),
  tiles('PLANT', ['correct', 'correct', 'present', 'correct', 'correct']),
  tiles('GLOOM', ['present', 'correct', 'present', 'present', 'absent']),
  emptyRow(5),
  emptyRow(5),
];

function stressRows(length: number) {
  const words =
    length === 8
      ? ['FURNACES', 'NOTEBOOK', 'TROPICAL', 'BALANCED']
      : length === 3
        ? ['CAT', 'DOG', 'HEN', 'FOX']
        : ['CRANE', 'MIGHT', 'PLANT', 'GLOOM'];
  return [
    ...words.map((word, row) =>
      tiles(
        word,
        Array.from({ length }, (_value, column) =>
          (column + row) % 4 === 0 ? 'correct' : (column + row) % 3 === 0 ? 'present' : 'absent',
        ),
      ),
    ),
    emptyRow(length),
    emptyRow(length),
  ];
}

export function CombatMatchPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const daily = location.pathname.includes('daily');
  const search = new URLSearchParams(location.search);
  const requestedLength = Number(search.get('length'));
  const length =
    Number.isInteger(requestedLength) && requestedLength >= 2 && requestedLength <= 35
      ? requestedLength
      : 5;
  const timed = search.get('timed') === '1';
  const sharedRows = useMemo(() => stressRows(length), [length]);
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState(
    daily
      ? 'MAYAR’s turn. Your keyboard is disabled while waiting.'
      : 'Your turn. Accepted moves persist before confirmation.',
  );
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const rows = useMemo(
    () => sharedRows.map((row, index) => (index === 4 && !daily ? emptyRow(length, draft) : row)),
    [daily, draft, length, sharedRows],
  );
  const evidence = useMemo(() => {
    const values: Record<string, TileState> = {};
    for (const row of sharedRows.slice(0, 4)) {
      for (const tile of row)
        if (tile.letter && tile.state !== 'empty') values[tile.letter] = tile.state;
    }
    return values;
  }, [sharedRows]);
  const onKey = (key: string) => {
    if (daily || submitted) return;
    if (key === 'BACKSPACE') setDraft((value) => value.slice(0, -1));
    else if (key === 'ENTER') {
      if (draft.length !== length)
        setMessage(`Guess must contain exactly ${length} letters. Attempt not consumed.`);
      else {
        setSubmitted(true);
        setMessage('Move accepted and saved. Waiting for rival.');
      }
    } else setDraft((value) => (value.length < length ? `${value}${key}` : value));
  };

  return (
    <div className="combat-match">
      <aside className="participant-rail participant-rail--ember">
        <span className="avatar avatar--xl">DS</span>
        <h2>Dennis Sellers</h2>
        <StatusDot tone="amber">You</StatusDot>
        <Metric value={daily ? 17 : 34} label="Live points" tone="amber" />
        <p>{daily ? '4 personal attempts remaining' : 'Your turn'}</p>
      </aside>
      <section className="shared-board" aria-labelledby="match-context">
        <header>
          <p id="match-context">
            {daily
              ? `Ranked Daily · OG · ${length}L · Expert · no clock`
              : `Practice · ranked · ${length === 8 ? 'GO' : 'OG'} · ${length}L · ${timed ? '5 minute clock' : 'no clock'}`}
          </p>
          <div className="turn-line">
            <StatusDot tone={daily ? 'ice' : 'green'}>
              {daily ? 'MAYAR’s turn' : 'Your turn'}
            </StatusDot>
            <span>{daily ? 'Return before next UTC midnight' : 'Lead +5'}</span>
          </div>
        </header>
        <GameBoard
          rows={rows}
          length={length}
          activeRow={daily || submitted ? undefined : 4}
          actors={['DS', 'MR', 'DS', 'MR', 'DS']}
        />
        <p className="game-message" role="status">
          {message}
        </p>
        <Keyboard evidence={evidence} disabled={daily || submitted} onKey={onKey} />
        <TileLegend />
        <Disclosure label="Match details" meta={daily ? 'Ranked Daily · UTC' : 'Ranked Practice'}>
          <p>
            One shared chronological board. Each participant retains a separate server-authoritative
            session.
          </p>
        </Disclosure>
        <Button tone="danger" onClick={() => setConfirmForfeit(true)}>
          Forfeit match
        </Button>
        {confirmForfeit ? (
          <div className="confirmation-bar" role="alertdialog" aria-label="Confirm forfeit">
            <p>
              {sharedRows.slice(0, 4).length > 0
                ? 'Play has started. Forfeit makes your rival the winner.'
                : 'No guesses were made. This cancels without a result.'}
            </p>
            <Button
              tone="danger"
              onClick={() => navigate('/combat/match/proof/result?outcome=forfeit')}
            >
              Confirm forfeit
            </Button>
            <Button onClick={() => setConfirmForfeit(false)}>Keep playing</Button>
          </div>
        ) : null}
      </section>
      <aside className="participant-rail participant-rail--ice">
        <span className="avatar avatar--xl">MR</span>
        <h2>MAYAR</h2>
        <StatusDot tone="ice">{daily ? 'Next turn' : 'Connected'}</StatusDot>
        <Metric value={daily ? 2 : 29} label="Live points" tone="ice" />
        <p>{daily ? '5 personal attempts remaining' : 'Waiting'}</p>
      </aside>
    </div>
  );
}

export function CombatResultPage() {
  const outcome = new URLSearchParams(useLocation().search).get('outcome') ?? 'points';
  const cancelled = outcome === 'cancelled';
  const timeout = outcome === 'timeout';
  const forfeit = outcome === 'forfeit';
  const title = cancelled
    ? 'Match cancelled'
    : timeout
      ? 'Dennis won on time'
      : forfeit
        ? 'Dennis won by forfeit'
        : 'MAYAR won on points';
  return (
    <div className="result-page">
      <p className="eyebrow">Ranked Practice · OG · 5L · Expert</p>
      <h1>{title}</h1>
      {cancelled ? (
        <p>Match cancelled before the first turn. No result was recorded.</p>
      ) : (
        <p>
          {timeout
            ? 'Timeout overrides tile points.'
            : forfeit
              ? 'Forfeit overrides tile points.'
              : 'Dennis solved CRANE. MAYAR’s accumulated evidence preserved the lead.'}
        </p>
      )}
      {!cancelled ? (
        <div className="verdict-score">
          <Metric
            value={forfeit || timeout ? 12 : 160}
            label={forfeit || timeout ? 'Dennis tile points' : 'MAYAR points'}
            tone="green"
          />
          <span>—</span>
          <Metric
            value={forfeit || timeout ? 17 : 141}
            label={forfeit || timeout ? 'MAYAR tile points' : 'Dennis points'}
          />
        </div>
      ) : null}
      <dl className="cancel-ledger">
        <div>
          <dt>Shared guesses</dt>
          <dd>{cancelled ? '0' : '3'}</dd>
        </div>
        <div>
          <dt>Winner</dt>
          <dd>{cancelled ? 'None' : forfeit || timeout ? 'Dennis' : 'MAYAR'}</dd>
        </div>
        <div>
          <dt>Performance result</dt>
          <dd>{cancelled ? 'None' : 'Recorded'}</dd>
        </div>
        <div>
          <dt>Answer</dt>
          <dd>{cancelled ? 'Not revealed' : 'SLATE'}</dd>
        </div>
      </dl>
      {!cancelled ? (
        <div className="trust-band">
          <Icon name="check" />
          <div>
            <strong>Ranked · trusted settlement eligible</strong>
            <p>Rating updates only after trusted authenticated settlement.</p>
          </div>
        </div>
      ) : (
        <p className="neutral-band">No winner · no loss · no rating result</p>
      )}
      <div className="button-stack">
        <ButtonLink to="/combat/lobby" tone="primary">
          Search ranked Practice again
        </ButtonLink>
        <ButtonLink to="/history">History</ButtonLink>
        <ButtonLink to="/combat">Combat</ButtonLink>
      </div>
    </div>
  );
}

export function LiveMatchPage() {
  return (
    <div className="page page--live-match">
      <ButtonLink to="/combat/live" tone="quiet">
        ‹ Back to Live list
      </ButtonLink>
      <header className="spectator-header">
        <span className="avatar">CL</span>
        <strong>Claudine</strong>
        <span>vs</span>
        <strong>KIKI</strong>
        <span className="avatar">KI</span>
      </header>
      <StatusDot>KIKI’s turn · 4 turns submitted</StatusDot>
      <div className="capability-band">
        <span>
          <Icon name="focus" /> Spectator
        </span>
        <span>
          <Icon name="lock" /> Read-only
        </span>
      </div>
      <GameBoard rows={defaultSharedRows} length={5} actors={['CL', 'KI', 'CL', 'KI']} />
      <Disclosure label="Live exchange" meta="2 eligible Practice matches">
        <p>
          Daily spectator access is excluded. Restricted matches and private identifiers remain
          hidden.
        </p>
        <ButtonLink to="/combat/live">Return to Live list</ButtonLink>
      </Disclosure>
    </div>
  );
}
