import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';

import { useAuth } from '../../app/auth-context';
import { Button, ButtonLink } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { PageHeader, RuledList, SectionHeading, StatusDot } from '../../components/Surface';
import { answerPoolForDifficulty } from '../../domain/words';
import { parsePracticeCombatPreviewConfig } from '../../domain/practice-combat-preview';
import { CombatPreviewRepository } from '../../services/combat-preview-repository';
import {
  PracticeCombatTransportRepository,
  type PracticeWaitingProjection,
} from '../../services/practice-combat-transport';
import { wordListProvider } from '../../services/word-list-provider';
import {
  CombatLobbyPanel,
  CombatUnavailablePanel,
  type CombatPreviewParticipant,
} from './components';
import { choosePracticeAnswers } from './usePracticeCombatMatch';

const tabs = [
  ['/combat', 'Overview'],
  ['/combat/daily', 'Daily'],
  ['/combat/practice', 'Practice'],
  ['/combat/active', 'Active'],
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

function utcDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function lobbySettings(lobby: PracticeWaitingProjection) {
  return [
    { label: 'Mode', value: lobby.mode.toUpperCase() },
    { label: 'Length', value: `${lobby.wordLength} letters` },
    { label: 'Difficulty', value: lobby.difficulty },
    { label: 'Hard Mode', value: lobby.hardMode ? 'On' : 'Off' },
    {
      label: 'Clock',
      value: lobby.timeLimitMs === null ? 'No clock' : `${lobby.timeLimitMs / 1_000}s`,
    },
    ...(lobby.goPuzzleCount === null
      ? []
      : [{ label: 'Chain', value: `${lobby.goPuzzleCount} puzzles` }]),
  ];
}

export function CombatPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const section = location.pathname.split('/')[2] ?? 'overview';
  const { client, user, status } = useAuth();
  const transport = useMemo(
    () => (client ? new PracticeCombatTransportRepository(client) : null),
    [client],
  );
  const previewRepository = useMemo(
    () => (client ? new CombatPreviewRepository(client) : null),
    [client],
  );
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'og' | 'go'>('og');
  const [wordLength, setWordLength] = useState(5);
  const [difficulty, setDifficulty] = useState<'casual' | 'standard' | 'expert'>('expert');
  const [hardMode, setHardMode] = useState(false);
  const [puzzleCount, setPuzzleCount] = useState<5 | 7 | 10>(5);
  const [timeLimitMs, setTimeLimitMs] = useState<number | null>(null);
  const [rankedMode, setRankedMode] = useState<'og' | 'go'>('og');
  const [rankedHardMode, setRankedHardMode] = useState(false);
  const [rankedRequestId, setRankedRequestId] = useState<string | null>(() =>
    sessionStorage.getItem('amordle:ranked-daily-request'),
  );
  const [finalizingDaily, setFinalizingDaily] = useState(false);

  const lobbies = useQuery({
    queryKey: ['combat', 'practice', 'public-lobbies', user?.id],
    enabled: Boolean(transport && user),
    queryFn: () => transport!.listPublicLobbies(user!.id),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const active = useQuery({
    queryKey: ['combat', 'participant-summaries', user?.id],
    enabled: Boolean(previewRepository && user),
    queryFn: () => previewRepository!.listParticipantSummaries(user!.id),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const privateRequests = useQuery({
    queryKey: ['combat', 'private-requests', user?.id],
    enabled: Boolean(previewRepository && user && (section === 'overview' || section === 'lobby')),
    queryFn: () => previewRepository!.listPrivateRequests({ limit: 25 }),
    staleTime: 15_000,
    retry: 1,
  });
  const rematches = useQuery({
    queryKey: ['combat', 'rematches', user?.id],
    enabled: Boolean(previewRepository && user && (section === 'overview' || section === 'lobby')),
    queryFn: () => previewRepository!.listRematches({ limit: 25 }),
    staleTime: 15_000,
    retry: 1,
  });
  const rankedQueue = useQuery({
    queryKey: ['combat', 'ranked-daily-queue', rankedRequestId],
    enabled: Boolean(previewRepository && user && rankedRequestId),
    queryFn: () => previewRepository!.loadRankedDailyQueue(rankedRequestId!),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  useEffect(() => {
    if (!previewRepository || rankedQueue.data?.status !== 'queued' || !rankedRequestId || busy)
      return;
    const timer = window.setTimeout(() => {
      setBusy(true);
      void previewRepository
        .claimRankedDailyQueue(rankedRequestId)
        .then((queue) => {
          queryClient.setQueryData(['combat', 'ranked-daily-queue', rankedRequestId], queue);
          setMessage(
            queue.status === 'matched'
              ? 'Ranked Daily opponent matched. Finalizing the private-authority game…'
              : 'Ranked Daily queue is still waiting for a compatible opponent.',
          );
        })
        .catch((error: unknown) =>
          setMessage(error instanceof Error ? error.message : 'Ranked Daily claim failed.'),
        )
        .finally(() => setBusy(false));
    }, 750);
    return () => window.clearTimeout(timer);
  }, [busy, previewRepository, queryClient, rankedQueue.data?.status, rankedRequestId]);

  useEffect(() => {
    if (
      !previewRepository ||
      rankedQueue.data?.status !== 'matched' ||
      finalizingDaily ||
      !rankedRequestId
    )
      return;
    setFinalizingDaily(true);
    void previewRepository
      .finalizeRankedDailyQueue(rankedQueue.data)
      .then(({ gameId }) => {
        sessionStorage.removeItem('amordle:ranked-daily-request');
        setRankedRequestId(null);
        navigate(`/combat/match/${gameId}`);
      })
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : 'Ranked Daily finalization failed.'),
      )
      .finally(() => setFinalizingDaily(false));
  }, [finalizingDaily, navigate, previewRepository, rankedQueue.data, rankedRequestId]);

  const requireAccount = (): boolean => {
    if (status === 'authenticated' && user && transport && previewRepository) return true;
    setMessage('Sign in before using durable COMBAT services.');
    return false;
  };

  const createLobby = async () => {
    if (!requireAccount() || !user || !transport) return;
    setBusy(true);
    try {
      const config = parsePracticeCombatPreviewConfig({
        mode,
        wordLength,
        difficulty,
        hardMode,
        puzzleCount: mode === 'go' ? puzzleCount : 1,
        timeLimitMs,
      });
      const lobby = await transport.createPublicLobby({
        id: `amordle-practice-${crypto.randomUUID()}`,
        hostUserId: user.id,
        config,
        now: new Date().toISOString(),
      });
      await lobbies.refetch();
      await active.refetch();
      setMessage('Answerless public lobby created. Waiting for a second signed-in account.');
      navigate(`/combat/match/${lobby.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Practice lobby creation failed.');
    } finally {
      setBusy(false);
    }
  };

  const joinLobby = async (lobby: PracticeWaitingProjection) => {
    if (!requireAccount() || !user || !transport) return;
    setBusy(true);
    try {
      const list = await wordListProvider.load(lobby.wordLength);
      const count = lobby.mode === 'go' ? lobby.goPuzzleCount! : 1;
      const answers = choosePracticeAnswers(answerPoolForDifficulty(list, lobby.difficulty), count);
      const joined = await transport.joinPublicLobby({
        gameId: lobby.id,
        joinerUserId: user.id,
        expectedUpdatedAt: lobby.updatedAt,
        displayNames: ['Player One', 'Player Two'],
        answers,
        wordRevision: list.revision,
        now: new Date().toISOString(),
      });
      queryClient.setQueryData(
        ['combat', 'match', lobby.id, 'cooperative-preview', user.id],
        joined,
      );
      setMessage('Lobby joined. Participant-only cooperative state is ready.');
      navigate(`/combat/match/${lobby.id}`);
    } catch (error) {
      await lobbies.refetch();
      setMessage(error instanceof Error ? error.message : 'Practice lobby join failed.');
    } finally {
      setBusy(false);
    }
  };

  const cancelLobby = async (lobby: PracticeWaitingProjection) => {
    if (!requireAccount() || !user || !transport) return;
    setBusy(true);
    try {
      await transport.cancelWaitingLobby({
        gameId: lobby.id,
        ownerUserId: user.id,
        expectedUpdatedAt: lobby.updatedAt,
        now: new Date().toISOString(),
      });
      await Promise.all([lobbies.refetch(), active.refetch()]);
      setMessage('Lobby cancelled before play. No answer, winner, or rating result was created.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Lobby cancellation failed.');
    } finally {
      setBusy(false);
    }
  };

  const enterRankedDaily = async () => {
    if (!requireAccount() || !previewRepository) return;
    setBusy(true);
    try {
      const queue = await previewRepository.createRankedDailyQueue({
        mode: rankedMode,
        dailyDateKey: utcDateKey(),
        hardMode: rankedHardMode,
        idempotencyKey: `amordle-ranked-daily:${utcDateKey()}:${rankedMode}:${rankedHardMode}`,
      });
      sessionStorage.setItem('amordle:ranked-daily-request', queue.requestId);
      setRankedRequestId(queue.requestId);
      setMessage('Ranked Daily queue accepted. Matching uses retained private authority.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ranked Daily queue failed.');
    } finally {
      setBusy(false);
    }
  };

  const cancelRankedDaily = async () => {
    if (!previewRepository || !rankedRequestId) return;
    setBusy(true);
    try {
      await previewRepository.cancelRankedDailyQueue(rankedRequestId);
      sessionStorage.removeItem('amordle:ranked-daily-request');
      setRankedRequestId(null);
      setMessage('Ranked Daily queue cancelled. No game or rating result was created.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ranked Daily cancellation failed.');
    } finally {
      setBusy(false);
    }
  };

  const participant: CombatPreviewParticipant = {
    key: 'viewer',
    displayName: status === 'authenticated' ? 'Signed-in player' : 'Guest',
    shortLabel: status === 'authenticated' ? 'YOU' : 'G',
    tone: 'ember',
  };
  const activeGames = (active.data ?? []).filter((game) =>
    ['waiting', 'playing'].includes(game.status),
  );

  return (
    <div className="page page--combat">
      <PageHeader
        title="Combat"
        eyebrow={`${activeGames.length} active`}
        actions={
          <StatusDot tone={client ? 'green' : 'amber'}>
            {client ? 'Backend configured' : 'Service unavailable'}
          </StatusDot>
        }
      />
      <CombatNav />
      {message ? (
        <p className="game-message" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
      <div className="combat-layout">
        <div>
          {section === 'overview' ? (
            <Overview
              activeCount={activeGames.length}
              privateCount={
                privateRequests.data?.filter((request) => request.status === 'requested').length ??
                0
              }
              rematchCount={
                rematches.data?.filter((request) => request.status === 'requested').length ?? 0
              }
            />
          ) : null}
          {section === 'daily' ? (
            <DailyPanel
              mode={rankedMode}
              hardMode={rankedHardMode}
              queueStatus={rankedQueue.data?.status ?? null}
              busy={busy || finalizingDaily}
              onMode={setRankedMode}
              onHardMode={setRankedHardMode}
              onEnter={() => void enterRankedDaily()}
              onCancel={() => void cancelRankedDaily()}
            />
          ) : null}
          {section === 'practice' ? (
            <PracticeForm
              mode={mode}
              wordLength={wordLength}
              difficulty={difficulty}
              hardMode={hardMode}
              puzzleCount={puzzleCount}
              timeLimitMs={timeLimitMs}
              busy={busy}
              onMode={setMode}
              onWordLength={setWordLength}
              onDifficulty={setDifficulty}
              onHardMode={setHardMode}
              onPuzzleCount={setPuzzleCount}
              onTimeLimit={setTimeLimitMs}
              onCreate={() => void createLobby()}
            />
          ) : null}
          {section === 'active' ? (
            <ActivePanel games={activeGames} loading={active.isPending} />
          ) : null}
          {section === 'lobby' ? (
            <LobbyList
              lobbies={lobbies.data ?? []}
              participant={participant}
              busy={busy}
              onJoin={(lobby) => void joinLobby(lobby)}
              onCancel={(lobby) => void cancelLobby(lobby)}
            />
          ) : null}
          {section === 'live' ? (
            <CombatUnavailablePanel
              title="Public Live disabled"
              statusLabel="Privacy fail-closed"
              description="The retained 42-migration backend cannot prove source visibility for every exact-ID spectator request."
              privacyNote="Daily, private-request, and rematch games remain inaccessible to public spectators. No fallback projection is rendered."
            />
          ) : null}
        </div>
        <aside className="combat-rail">
          <h2>Capability boundary</h2>
          <dl className="data-list">
            <div>
              <dt>Unranked Practice</dt>
              <dd>Cooperative preview</dd>
            </div>
            <div>
              <dt>Ranked Daily</dt>
              <dd>Private authority</dd>
            </div>
            <div>
              <dt>Ranked Practice</dt>
              <dd>Disabled</dd>
            </div>
            <div>
              <dt>Public Live</dt>
              <dd>Disabled</dd>
            </div>
          </dl>
          <p>
            Cooperative Practice persists accepted participant updates before confirmation, but it
            is not cheat-resistant and never mutates ratings.
          </p>
          <ButtonLink to="/help">Read COMBAT help</ButtonLink>
        </aside>
      </div>
    </div>
  );
}

function Overview({
  activeCount,
  privateCount,
  rematchCount,
}: {
  activeCount: number;
  privateCount: number;
  rematchCount: number;
}) {
  return (
    <div className="combat-overview">
      <SectionHeading title="Combat lanes" />
      <div className="three-up">
        <section>
          <Icon name="daily" />
          <h2>Daily</h2>
          <p>UTC day · private answer authority · ranked queue.</p>
          <ButtonLink to="/combat/daily">Open Daily</ButtonLink>
        </section>
        <section>
          <Icon name="combat" />
          <h2>Practice</h2>
          <p>Public cooperative preview · lengths 2–35 · flexible clocks.</p>
          <ButtonLink to="/combat/practice">Configure Practice</ButtonLink>
        </section>
        <section>
          <Icon name="history" />
          <h2>Attention</h2>
          <p>
            {activeCount} active · {privateCount} private requests · {rematchCount} rematches
          </p>
          <ButtonLink to="/combat/active">View Active</ButtonLink>
        </section>
      </div>
      <CombatUnavailablePanel
        title="Ranked Practice deferred"
        statusLabel="No mutation path"
        description="The existing backend stores participant-writable Practice projections, so Amordle will not label or settle those games as cheat-resistant ranked play."
        privacyNote="Ranked Practice queue controls are intentionally absent. A future authority upgrade requires separate approval."
      />
    </div>
  );
}

function DailyPanel({
  mode,
  hardMode,
  queueStatus,
  busy,
  onMode,
  onHardMode,
  onEnter,
  onCancel,
}: {
  mode: 'og' | 'go';
  hardMode: boolean;
  queueStatus: string | null;
  busy: boolean;
  onMode: (mode: 'og' | 'go') => void;
  onHardMode: (value: boolean) => void;
  onEnter: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <SectionHeading title="Ranked Daily COMBAT" meta={`${utcDateKey()} · UTC`} />
      <form className="practice-form" onSubmit={(event) => event.preventDefault()}>
        <label>
          Mode
          <select value={mode} onChange={(event) => onMode(event.target.value as 'og' | 'go')}>
            <option value="og">OG</option>
            <option value="go">GO</option>
          </select>
        </label>
        <label>
          Word length
          <input value="5" disabled aria-label="Daily word length" />
        </label>
        <label className="check-control">
          <input
            type="checkbox"
            checked={hardMode}
            onChange={(event) => onHardMode(event.target.checked)}
          />{' '}
          Hard Mode
        </label>
        <Button tone="primary" disabled={busy || queueStatus === 'queued'} onClick={onEnter}>
          {queueStatus === 'matched'
            ? 'Finalizing…'
            : queueStatus === 'queued'
              ? 'Searching…'
              : 'Enter ranked Daily'}
        </Button>
        {queueStatus === 'queued' ? (
          <Button disabled={busy} onClick={onCancel}>
            Cancel search
          </Button>
        ) : null}
      </form>
      <p className="privacy-band">
        <Icon name="lock" /> Fixed five letters · no clock · private answer authority · never public
        Live
      </p>
    </>
  );
}

function PracticeForm({
  mode,
  wordLength,
  difficulty,
  hardMode,
  puzzleCount,
  timeLimitMs,
  busy,
  onMode,
  onWordLength,
  onDifficulty,
  onHardMode,
  onPuzzleCount,
  onTimeLimit,
  onCreate,
}: {
  mode: 'og' | 'go';
  wordLength: number;
  difficulty: 'casual' | 'standard' | 'expert';
  hardMode: boolean;
  puzzleCount: 5 | 7 | 10;
  timeLimitMs: number | null;
  busy: boolean;
  onMode: (value: 'og' | 'go') => void;
  onWordLength: (value: number) => void;
  onDifficulty: (value: 'casual' | 'standard' | 'expert') => void;
  onHardMode: (value: boolean) => void;
  onPuzzleCount: (value: 5 | 7 | 10) => void;
  onTimeLimit: (value: number | null) => void;
  onCreate: () => void;
}) {
  return (
    <>
      <SectionHeading title="Practice COMBAT" />
      <form className="practice-form" onSubmit={(event) => event.preventDefault()}>
        <label>
          Mode
          <select value={mode} onChange={(event) => onMode(event.target.value as 'og' | 'go')}>
            <option value="og">OG</option>
            <option value="go">GO</option>
          </select>
        </label>
        <label>
          Word length
          <input
            type="number"
            min="2"
            max="35"
            step="1"
            value={wordLength}
            onChange={(event) => onWordLength(Number(event.target.value))}
          />
        </label>
        <label>
          Difficulty
          <select
            value={difficulty}
            onChange={(event) =>
              onDifficulty(event.target.value as 'casual' | 'standard' | 'expert')
            }
          >
            <option value="casual">Casual</option>
            <option value="standard">Standard</option>
            <option value="expert">Expert</option>
          </select>
        </label>
        {mode === 'go' ? (
          <label>
            GO chain
            <select
              value={puzzleCount}
              onChange={(event) => onPuzzleCount(Number(event.target.value) as 5 | 7 | 10)}
            >
              <option value="5">5 puzzles</option>
              <option value="7">7 puzzles</option>
              <option value="10">10 puzzles</option>
            </select>
          </label>
        ) : null}
        <label>
          Clock
          <select
            value={timeLimitMs ?? 'none'}
            onChange={(event) =>
              onTimeLimit(event.target.value === 'none' ? null : Number(event.target.value))
            }
          >
            <option value="none">No clock</option>
            <option value="30000">30 seconds</option>
            <option value="60000">1 minute</option>
            <option value="120000">2 minutes</option>
            <option value="300000">5 minutes</option>
            <option value="600000">10 minutes</option>
            <option value="1800000">30 minutes</option>
            <option value="3600000">1 hour</option>
          </select>
        </label>
        <label className="check-control">
          <input
            type="checkbox"
            checked={hardMode}
            onChange={(event) => onHardMode(event.target.checked)}
          />{' '}
          Hard Mode
        </label>
        <Button tone="primary" disabled={busy} onClick={onCreate}>
          Create public lobby
        </Button>
        <ButtonLink to="/players">Find a player for a private request</ButtonLink>
      </form>
      <p className="privacy-band">
        This lane is a participant-writable cooperative preview. It is durable and recoverable, but
        not cheat-resistant or rating-eligible.
      </p>
    </>
  );
}

function ActivePanel({
  games,
  loading,
}: {
  games: readonly {
    id: string;
    mode: 'og' | 'go';
    scope: 'practice' | 'daily';
    status: string;
    wordLength: number;
    ranked: boolean;
  }[];
  loading: boolean;
}) {
  return (
    <>
      <SectionHeading title="Participant games" />
      <RuledList>
        {loading ? <p role="status">Loading safe game summaries…</p> : null}
        {games.map((game) => (
          <div className="active-game-row" key={game.id}>
            <StatusDot tone={game.status === 'playing' ? 'green' : 'ice'}>{game.status}</StatusDot>
            <div>
              <strong>
                {game.mode.toUpperCase()} {game.scope}
              </strong>
              <small>
                {game.wordLength} letters · {game.ranked ? 'ranked' : 'unranked'} · safe summary
              </small>
            </div>
            <ButtonLink tone="primary" to={`/combat/match/${game.id}`}>
              Open
            </ButtonLink>
          </div>
        ))}
        {games.length === 0 && !loading ? (
          <p className="empty-state">No participant games currently require attention.</p>
        ) : null}
      </RuledList>
    </>
  );
}

function LobbyList({
  lobbies,
  participant,
  busy,
  onJoin,
  onCancel,
}: {
  lobbies: readonly PracticeWaitingProjection[];
  participant: CombatPreviewParticipant;
  busy: boolean;
  onJoin: (lobby: PracticeWaitingProjection) => void;
  onCancel: (lobby: PracticeWaitingProjection) => void;
}) {
  return (
    <>
      <SectionHeading title="Open public Practice lobbies" />
      {lobbies.map((lobby) => (
        <CombatLobbyPanel
          key={lobby.id}
          title={`${lobby.mode.toUpperCase()} · ${lobby.wordLength} letters`}
          description="Answerless public waiting projection"
          statusLabel={lobby.viewerSeat === 'player-one' ? 'Your lobby' : 'Open'}
          host={participant}
          waitingLabel="waiting"
          waitingDescription="A second signed-in account may claim this seat."
          settings={lobbySettings(lobby)}
          actions={[
            lobby.viewerSeat === 'player-one'
              ? {
                  label: 'Cancel lobby',
                  onPress: () => onCancel(lobby),
                  disabled: busy,
                  tone: 'danger',
                }
              : {
                  label: 'Join lobby',
                  onPress: () => onJoin(lobby),
                  disabled: busy,
                  tone: 'primary',
                },
          ]}
        />
      ))}
      {lobbies.length === 0 ? (
        <p className="empty-state">No answerless public Practice lobbies are open.</p>
      ) : null}
    </>
  );
}
