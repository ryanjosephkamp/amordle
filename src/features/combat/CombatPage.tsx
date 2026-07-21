import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { useAuth } from '../../app/auth-context';
import { Button, ButtonLink } from '../../components/Button';
import { Disclosure } from '../../components/Disclosure';
import { Icon } from '../../components/Icon';
import { PageHeader, RuledList, SectionHeading, StatusDot } from '../../components/Surface';
import { CombatRepository } from '../../services/combat-repository';

const tabs = [
  ['/combat', 'Overview'],
  ['/combat/daily', 'Daily'],
  ['/combat/practice', 'Practice'],
  ['/combat/active', 'Active 2'],
  ['/combat/lobby', 'Lobby'],
  ['/combat/live', 'Live'],
] as const;

function CombatNav() {
  return (
    <nav className="subnav subnav--combat" aria-label="Combat">
      {tabs.map(([to, label]) => (
        <NavLink end={to === '/combat'} key={to} to={to}>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export function CombatPage() {
  const location = useLocation();
  const section = location.pathname.split('/')[2] ?? 'overview';
  const { client, user } = useAuth();
  const repository = useMemo(() => (client ? new CombatRepository(client) : null), [client]);
  const [queueState, setQueueState] = useState<'ready' | 'searching'>('ready');
  const [queueRequestId, setQueueRequestId] = useState<string | null>(null);
  const [serviceMessage, setServiceMessage] = useState('');
  const [ownedLobby, setOwnedLobby] = useState(true);
  const [joined, setJoined] = useState(false);
  const participantGames = useQuery({
    queryKey: ['combat-participant-games', user?.id],
    enabled: Boolean(repository && user),
    queryFn: () => repository!.listParticipantGames(user!.id),
    staleTime: 5_000,
    retry: 1,
  });

  const startRankedSearch = async () => {
    if (!repository || !user) {
      setServiceMessage('Sign in before entering server-authoritative COMBAT.');
      return;
    }
    setQueueState('searching');
    setServiceMessage('Submitting a compatible ranked Practice request…');
    try {
      const result = await repository.createRankedSearch({
        mode: 'og',
        scope: 'practice',
        wordLength: 5,
        hardMode: false,
        idempotencyKey: crypto.randomUUID(),
      });
      const record =
        typeof result === 'object' && result !== null ? (result as Record<string, unknown>) : {};
      const requestId = typeof record.request_id === 'string' ? record.request_id : null;
      const gameId = typeof record.matched_game_id === 'string' ? record.matched_game_id : null;
      setQueueRequestId(requestId);
      setServiceMessage(
        gameId
          ? 'Compatible opponent matched. Open Active games.'
          : 'Ranked request accepted. Durable status will reconcile while you wait.',
      );
      if (!requestId && !gameId) setQueueState('ready');
      void participantGames.refetch();
    } catch (error) {
      setQueueState('ready');
      setServiceMessage(error instanceof Error ? error.message : 'Ranked search failed.');
    }
  };

  const cancelRankedSearch = async () => {
    if (!repository || !queueRequestId) {
      setQueueState('ready');
      return;
    }
    try {
      await repository.cancelRankedSearch(queueRequestId);
      setServiceMessage('Ranked request cancelled. No result was created.');
      setQueueRequestId(null);
      setQueueState('ready');
    } catch (error) {
      setServiceMessage(error instanceof Error ? error.message : 'Cancellation failed.');
    }
  };

  return (
    <div className="page page--combat">
      <PageHeader
        title="Combat"
        eyebrow="2 / 5 active"
        actions={<StatusDot tone="green">Connection ready</StatusDot>}
      />
      <CombatNav />
      <div className="combat-layout">
        <div>
          <div className="turn-banner">
            <StatusDot>Your turn</StatusDot>
            <span>MAYAR · ranked Practice OG · 5L</span>
            <ButtonLink to="/combat/match/proof" tone="primary">
              Resume
            </ButtonLink>
          </div>
          {section === 'overview' ? <Overview /> : null}
          {section === 'daily' ? <Daily /> : null}
          {section === 'practice' ? <Practice /> : null}
          {section === 'active' ? (
            <Active
              games={participantGames.data ?? []}
              loading={participantGames.isPending && Boolean(user)}
            />
          ) : null}
          {section === 'lobby' ? (
            <>
              <SectionHeading title="Open lobby" />
              <RuledList label="Joinable Practice lobbies">
                <LobbyRow
                  initials="L9"
                  name="LEXI_99"
                  context="Practice · unranked · OG · 5L · no clock"
                  action={
                    <Button tone="primary" onClick={() => setJoined(true)}>
                      {joined ? 'Joined' : 'Join'}
                    </Button>
                  }
                />
                <LobbyRow
                  initials="JB"
                  name="JONAHB"
                  context="Practice · unranked · GO · 7L · Hard Mode"
                  action={
                    <Button onClick={() => setJoined(true)}>{joined ? 'Joined' : 'Join'}</Button>
                  }
                />
                {ownedLobby ? (
                  <LobbyRow
                    initials="G"
                    name="Guest / you"
                    context="Practice · unranked · OG · 5L · waiting for rival"
                    action={
                      <>
                        <Button tone="primary">Open</Button>
                        <Button onClick={() => setOwnedLobby(false)}>Cancel</Button>
                      </>
                    }
                  />
                ) : (
                  <p className="empty-state">
                    Your waiting lobby was cancelled. No game or result was created.
                  </p>
                )}
              </RuledList>
              {joined ? (
                <div className="success-banner" role="status">
                  <Icon name="check" /> Joined the Practice lobby.{' '}
                  <ButtonLink to="/combat/match/proof" tone="primary">
                    Enter match
                  </ButtonLink>
                </div>
              ) : null}
            </>
          ) : null}
          {section === 'live' ? <LiveList /> : null}
        </div>
        <aside className="combat-rail">
          <h2>Ranked quick match</h2>
          <dl className="data-list">
            <div>
              <dt>Mode</dt>
              <dd>Practice OG</dd>
            </div>
            <div>
              <dt>Length</dt>
              <dd>5 letters</dd>
            </div>
            <div>
              <dt>Clock</dt>
              <dd>No clock</dd>
            </div>
            <div>
              <dt>Hard Mode</dt>
              <dd>Off</dd>
            </div>
          </dl>
          <Button
            tone="primary"
            disabled={queueState === 'searching'}
            onClick={() => void startRankedSearch()}
          >
            {queueState === 'searching' ? 'Searching…' : 'Enter ranked queue'}
          </Button>
          {queueState === 'searching' ? (
            <Button onClick={() => void cancelRankedSearch()}>Cancel search</Button>
          ) : null}
          {serviceMessage ? <p role="status">{serviceMessage}</p> : null}
          <p>
            No wait-time promise. Matching uses compatible mode, length, rating bucket, and clock.
          </p>
          <hr />
          <StatusDot tone="red">Live · Practice only</StatusDot>
          <h2>Open Live</h2>
          <p>Practice-only Live is available from COMBAT; Daily spectator access is excluded.</p>
          <ButtonLink to="/combat/live">View live matches</ButtonLink>
        </aside>
      </div>
    </div>
  );
}

function LobbyRow({
  initials,
  name,
  context,
  action,
}: {
  initials: string;
  name: string;
  context: string;
  action: React.ReactNode;
}) {
  return (
    <div className="lobby-row" role="listitem">
      <span className="avatar">{initials}</span>
      <div>
        <strong>{name}</strong>
        <small>{context}</small>
      </div>
      <StatusDot>Open</StatusDot>
      <div className="button-row">{action}</div>
    </div>
  );
}

function Overview() {
  return (
    <div className="combat-overview">
      <SectionHeading title="Combat lanes" />
      <div className="three-up">
        <section>
          <Icon name="daily" />
          <h2>Daily</h2>
          <p>UTC day · async · ranked and unranked lanes.</p>
          <ButtonLink to="/combat/daily">Open Daily</ButtonLink>
        </section>
        <section>
          <Icon name="combat" />
          <h2>Practice</h2>
          <p>Public, private, ranked, and flexible clocks.</p>
          <ButtonLink to="/combat/practice">Configure Practice</ButtonLink>
        </section>
        <section>
          <Icon name="history" />
          <h2>Active</h2>
          <p>Resume participant-owned games and see turn status.</p>
          <ButtonLink to="/combat/active">View Active</ButtonLink>
        </section>
      </div>
    </div>
  );
}
function Daily() {
  return (
    <>
      <SectionHeading title="Daily Combat" meta="Resets at UTC midnight" />
      <div className="two-up">
        <section className="lane-panel">
          <h2>Daily OG</h2>
          <p>Five letters · asynchronous · no clock</p>
          <Button tone="primary">Find unranked rival</Button>
          <Button>Enter ranked lane</Button>
        </section>
        <section className="lane-panel">
          <h2>Daily GO</h2>
          <p>Fixed chain · asynchronous · no consumables</p>
          <Button tone="primary">Find unranked rival</Button>
          <Button>Enter ranked lane</Button>
        </section>
      </div>
      <p className="privacy-band">
        <Icon name="lock" /> Daily games never appear in public Live.
      </p>
    </>
  );
}
function Practice() {
  return (
    <>
      <SectionHeading title="Practice Combat" />
      <form className="practice-form" onSubmit={(event) => event.preventDefault()}>
        <label>
          Mode
          <select defaultValue="og">
            <option value="og">OG</option>
            <option value="go">GO</option>
          </select>
        </label>
        <label>
          Word length
          <input type="number" min="2" max="35" defaultValue="5" />
        </label>
        <label>
          Difficulty
          <select defaultValue="expert">
            <option>Casual</option>
            <option>Standard</option>
            <option value="expert">Expert</option>
          </select>
        </label>
        <label>
          Clock
          <select defaultValue="none">
            <option value="none">No clock</option>
            <option>30 seconds</option>
            <option>1 minute</option>
            <option>2 minutes</option>
            <option>5 minutes</option>
            <option>10 minutes</option>
            <option>30 minutes</option>
            <option>1 hour</option>
          </select>
        </label>
        <label className="check-control">
          <input type="checkbox" /> Hard Mode
        </label>
        <Button tone="primary" type="submit">
          Create public lobby
        </Button>
        <Button type="button">Send private request</Button>
      </form>
    </>
  );
}
function Active({
  games,
  loading,
}: {
  games: ReadonlyArray<{
    id: string;
    mode: string;
    scope: string;
    status: string;
    word_length: number;
  }>;
  loading: boolean;
}) {
  return (
    <>
      <SectionHeading title="Active games" />
      <RuledList>
        {loading ? <p role="status">Loading participant-authorized games…</p> : null}
        {games.map((game) => (
          <div className="active-game-row" key={game.id}>
            <StatusDot tone={game.status === 'active' ? 'green' : 'ice'}>{game.status}</StatusDot>
            <div>
              <strong>
                {game.mode.toUpperCase()} {game.scope}
              </strong>
              <small>{game.word_length} letters · durable server record</small>
            </div>
            <ButtonLink tone="primary" to={`/combat/match/${game.id}`}>
              Open
            </ButtonLink>
          </div>
        ))}
        {games.length === 0 && !loading ? (
          <p className="empty-state">No participant-authorized games are active.</p>
        ) : null}
        {games.length === 0 ? (
          <div className="active-game-row">
            <StatusDot>Your turn</StatusDot>
            <div>
              <strong>MAYAR</strong>
              <small>Ranked Practice · OG · 5L · 4 attempts left</small>
            </div>
            <ButtonLink tone="primary" to="/combat/match/proof">
              Resume
            </ButtonLink>
          </div>
        ) : null}
        <div className="active-game-row">
          <StatusDot tone="ice">Waiting</StatusDot>
          <div>
            <strong>LEXI_99</strong>
            <small>Daily GO · UTC · no clock</small>
          </div>
          <ButtonLink to="/combat/match/daily-proof">View</ButtonLink>
        </div>
      </RuledList>
    </>
  );
}
function LiveList() {
  return (
    <>
      <SectionHeading title="Live exchange" meta="Browse Practice matches" />
      <div className="capability-band">
        <StatusDot>Spectator</StatusDot>
        <span>
          <Icon name="lock" /> Read-only
        </span>
      </div>
      <RuledList>
        <Link className="live-row" to="/combat/live/proof">
          <StatusDot tone="red">Live</StatusDot>
          <div>
            <strong>CLAUDINE vs KIKI</strong>
            <small>Practice · unranked · OG · 5L · 4 turns</small>
          </div>
          <span>Open ›</span>
        </Link>
        <Link className="live-row" to="/combat/live/second">
          <StatusDot tone="red">Live</StatusDot>
          <div>
            <strong>MARCUS vs REESE</strong>
            <small>Practice · unranked · GO · 7L</small>
          </div>
          <span>Open ›</span>
        </Link>
      </RuledList>
      <Disclosure label="Privacy boundary" open>
        <p>One active game is hidden by Live privacy rules. Daily spectator access is excluded.</p>
      </Disclosure>
    </>
  );
}
