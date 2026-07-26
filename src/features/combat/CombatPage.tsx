import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';

import { useAuth } from '../../app/auth-context';
import { Button, ButtonLink } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { PageHeader, RuledList, SectionHeading, StatusDot } from '../../components/Surface';
import { answerPoolForDifficulty } from '../../domain/words';
import {
  createPracticeCombatPreview,
  parsePracticeCombatPreviewConfig,
} from '../../domain/practice-combat-preview';
import { CombatPreviewRepository } from '../../services/combat-preview-repository';
import {
  AuthoritativeCombatRepository,
  type RankedPracticeQueue,
  type UnrankedDailyLobby,
} from '../../services/authoritative-combat-repository';
import {
  CombatLiveRepository,
  type CombatLiveProjection,
} from '../../services/combat-live-repository';
import {
  clearPendingPracticeLobbyCreation,
  createPendingPracticeLobbyCreation,
  practiceLobbyConfigurationFingerprint,
  readPendingPracticeLobbyCreation,
  writePendingPracticeLobbyCreation,
} from '../../services/pending-practice-lobby';
import {
  clearPendingDailyLobby,
  createPendingDailyLobby,
  readPendingDailyLobby,
  writePendingDailyLobby,
} from '../../services/pending-daily-lobby';
import {
  attachRankedPracticeRequest,
  clearRankedPracticeSearchState,
  createRankedPracticeSearchState,
  rankedPracticeSearchFingerprint,
  readRankedPracticeSearchState,
  writeRankedPracticeSearchState,
} from '../../services/pending-ranked-practice';
import {
  attachRankedDailyRequest,
  clearLegacyRankedDailyRequestId,
  clearRankedDailySearchIntent,
  createRankedDailySearchIntent,
  readLegacyRankedDailyRequestId,
  readRankedDailySearchIntent,
  type RankedDailySearchIntent,
  writeRankedDailySearchIntent,
} from '../../services/pending-ranked-daily';
import { PublicRepository } from '../../services/public-repository';
import { PrivateRequestRepository } from '../../services/private-request-repository';
import type {
  PrivateRequestProjection,
  RankedDailyQueueProjection,
  RematchProjection,
} from '../../services/combat-preview-projections';
import type { Json } from '../../types/database';
import type { PublicProfileProjection } from '../../types/services';
import {
  buildCooperativePracticeProjection,
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
import { combatPlayerCopy } from './player-copy';
import { useRankedSearchController, type RankedSearchPhase } from './ranked-search-controller';

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

function isPublicProfileId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
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
  const authoritativeRepository = useMemo(
    () => (client ? new AuthoritativeCombatRepository(client) : null),
    [client],
  );
  const liveRepository = useMemo(
    () => (client ? new CombatLiveRepository(client) : null),
    [client],
  );
  const publicRepository = useMemo(() => (client ? new PublicRepository(client) : null), [client]);
  const privateRepository = useMemo(
    () => (client ? new PrivateRequestRepository(client) : null),
    [client],
  );
  const ownerProfile = useQuery({
    queryKey: ['owner-public-profile', user?.id],
    enabled: Boolean(publicRepository && user),
    queryFn: () => publicRepository!.getMyProfile(),
    staleTime: 30_000,
    retry: 1,
  });
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
  const [rankedDailyIntent, setRankedDailyIntent] = useState<RankedDailySearchIntent | null>(null);
  const [legacyRankedDailyRequestId, setLegacyRankedDailyRequestId] = useState<string | null>(null);
  const [rankedPracticeRequestId, setRankedPracticeRequestId] = useState<string | null>(() =>
    sessionStorage.getItem('amordle:ranked-practice-request'),
  );
  const [rankedPracticeTimed, setRankedPracticeTimed] = useState(false);
  const [rankedDailyAction, setRankedDailyAction] = useState<'creating' | 'cancelling' | null>(
    null,
  );
  const [rankedPracticeAction, setRankedPracticeAction] = useState<
    'creating' | 'cancelling' | null
  >(null);
  const rankedDailyCreateInFlight = useRef(false);
  const rankedPracticeCreateInFlight = useRef(false);
  const [privateTarget, setPrivateTarget] = useState(() =>
    (new URLSearchParams(location.search).get('target') ?? '').toLowerCase(),
  );

  useEffect(() => {
    setPrivateTarget((new URLSearchParams(location.search).get('target') ?? '').toLowerCase());
  }, [location.search]);

  const rankedRequestId =
    rankedDailyIntent !== null && user !== null && rankedDailyIntent.ownerNamespace === user.id
      ? rankedDailyIntent.requestId
      : legacyRankedDailyRequestId;
  const rankedPracticeSearchOwned =
    user !== null &&
    readRankedPracticeSearchState(sessionStorage, user.id)?.requestId === rankedPracticeRequestId;

  useEffect(() => {
    if (!user) {
      setRankedDailyIntent(null);
      setLegacyRankedDailyRequestId(null);
      setRankedPracticeRequestId(null);
      return;
    }
    const daily = readRankedDailySearchIntent(sessionStorage, user.id);
    setRankedDailyIntent(daily);
    if (daily) {
      setRankedMode(daily.mode);
      setRankedHardMode(daily.hardMode);
    }
    setLegacyRankedDailyRequestId(readLegacyRankedDailyRequestId(sessionStorage));
    const restored = readRankedPracticeSearchState(sessionStorage, user.id);
    setRankedPracticeRequestId(restored?.requestId ?? null);
  }, [user]);

  const lobbies = useQuery({
    queryKey: ['combat', 'practice', 'public-lobbies', user?.id],
    enabled: Boolean(transport && user),
    queryFn: () => transport!.listPublicLobbies(user!.id),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const dailyLobbies = useQuery({
    queryKey: ['combat', 'daily', 'unranked-lobbies', utcDateKey(), user?.id],
    enabled: Boolean(authoritativeRepository && user && section === 'daily'),
    queryFn: () => authoritativeRepository!.listUnrankedDailyLobbies({ limit: 25 }),
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
  const authoritativeActive = useQuery({
    queryKey: ['combat', 'participant-summaries', 'authoritative-v2', user?.id],
    enabled: Boolean(authoritativeRepository && user),
    queryFn: () => authoritativeRepository!.listActive(50),
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
  const privateTargetProfile = useQuery({
    queryKey: ['combat', 'private-target-profile', privateTarget],
    enabled: Boolean(publicRepository && isPublicProfileId(privateTarget)),
    queryFn: () => publicRepository!.getProfile(privateTarget),
    staleTime: 30_000,
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
    queryKey: ['combat', 'ranked-daily-queue', user?.id, rankedRequestId],
    enabled: Boolean(previewRepository && user && rankedRequestId && section === 'daily'),
    queryFn: () => previewRepository!.loadRankedDailyQueue(rankedRequestId!),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const rankedPracticeQueue = useQuery({
    queryKey: ['combat', 'ranked-practice-queue', user?.id, rankedPracticeRequestId],
    enabled: Boolean(
      authoritativeRepository &&
      user &&
      rankedPracticeRequestId &&
      rankedPracticeSearchOwned &&
      section === 'practice',
    ),
    queryFn: () => authoritativeRepository!.getRankedPracticeStatus(rankedPracticeRequestId!),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const live = useQuery({
    queryKey: ['combat', 'live', status === 'authenticated' ? 'authenticated' : 'public'],
    enabled: Boolean(liveRepository && section === 'live'),
    queryFn: () =>
      liveRepository!.list({
        authenticated: status === 'authenticated',
        limit: 50,
      }),
    refetchInterval: section === 'live' ? 30_000 : false,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  useEffect(() => {
    if (!user || !legacyRankedDailyRequestId || !rankedQueue.isSuccess || rankedDailyIntent) {
      return;
    }
    const queue = rankedQueue.data;
    if (
      queue &&
      queue.status !== 'cancelled' &&
      queue.status !== 'expired' &&
      queue.dailyDateKey === utcDateKey()
    ) {
      const adopted = attachRankedDailyRequest(
        createRankedDailySearchIntent({
          ownerNamespace: user.id,
          dailyDateKey: queue.dailyDateKey,
          mode: queue.mode,
          hardMode: queue.hardMode,
          requestedAt: queue.queuedAt,
        }),
        queue.requestId,
      );
      writeRankedDailySearchIntent(sessionStorage, adopted);
      setRankedDailyIntent(adopted);
      setLegacyRankedDailyRequestId(null);
      return;
    }
    clearLegacyRankedDailyRequestId(sessionStorage);
    setLegacyRankedDailyRequestId(null);
  }, [
    legacyRankedDailyRequestId,
    rankedDailyIntent,
    rankedQueue.data,
    rankedQueue.isSuccess,
    user,
  ]);

  const claimRankedDaily = useCallback(async () => {
    if (!previewRepository || !rankedRequestId) {
      throw new Error('Ranked Daily search is unavailable.');
    }
    return previewRepository.claimRankedDailyQueue(rankedRequestId);
  }, [previewRepository, rankedRequestId]);
  const updateRankedDailyQueue = useCallback(
    (queue: RankedDailyQueueProjection) => {
      if (!rankedRequestId) return;
      queryClient.setQueryData(['combat', 'ranked-daily-queue', user?.id, rankedRequestId], queue);
      if (queue.status === 'matched') setMessage('Rival found. Preparing your game…');
    },
    [queryClient, rankedRequestId, user?.id],
  );
  const finalizeRankedDaily = useCallback(
    async (queue: RankedDailyQueueProjection) => {
      if (!previewRepository || !user) throw new Error('Ranked Daily finalization is unavailable.');
      const { gameId } = await previewRepository.finalizeRankedDailyQueue(queue);
      clearRankedDailySearchIntent(sessionStorage, user.id);
      setRankedDailyIntent(null);
      queryClient.invalidateQueries({ queryKey: ['combat', 'participant-summaries'] });
      navigate(`/combat/match/${gameId}`);
    },
    [navigate, previewRepository, queryClient, user],
  );
  const endRankedDailySearch = useCallback(() => {
    if (user) clearRankedDailySearchIntent(sessionStorage, user.id);
    clearLegacyRankedDailyRequestId(sessionStorage);
    setRankedDailyIntent(null);
    setLegacyRankedDailyRequestId(null);
    setMessage('That Ranked Daily search is no longer active.');
  }, [user]);
  const handleRankedDailyReconciliationError = useCallback(() => {
    setMessage('Your search is still active. We’ll keep trying to connect you.');
  }, []);
  const dailySearch = useRankedSearchController({
    enabled: section === 'daily' && Boolean(previewRepository && user && rankedRequestId),
    requestId: rankedRequestId,
    queue: rankedQueue.data,
    queueUpdatedAt: rankedQueue.dataUpdatedAt,
    claim: claimRankedDaily,
    finalize: finalizeRankedDaily,
    onQueueUpdate: updateRankedDailyQueue,
    onTerminal: endRankedDailySearch,
    onTransientError: handleRankedDailyReconciliationError,
  });

  const claimRankedPractice = useCallback(async () => {
    if (!authoritativeRepository || !rankedPracticeRequestId) {
      throw new Error('Ranked Practice search is unavailable.');
    }
    return authoritativeRepository.claimRankedPractice({
      requestId: rankedPracticeRequestId,
      actionId: crypto.randomUUID(),
    });
  }, [authoritativeRepository, rankedPracticeRequestId]);
  const updateRankedPracticeQueue = useCallback(
    (queue: RankedPracticeQueue) => {
      if (!rankedPracticeRequestId) return;
      queryClient.setQueryData(
        ['combat', 'ranked-practice-queue', user?.id, rankedPracticeRequestId],
        queue,
      );
      if (queue.status === 'matched') setMessage('Rival found. Preparing your game…');
    },
    [queryClient, rankedPracticeRequestId, user?.id],
  );
  const finalizeRankedPractice = useCallback(
    async (queue: RankedPracticeQueue) => {
      if (!authoritativeRepository || !queue.matchedGameId) {
        throw new Error('Ranked Practice finalization is unavailable.');
      }
      const projection = await authoritativeRepository.finalizeRankedPractice({
        requestId: queue.requestId,
        gameId: queue.matchedGameId,
        actionId: `amordle-ranked-practice-finalize:${queue.requestId}`,
      });
      clearRankedPracticeSearchState(sessionStorage);
      setRankedPracticeRequestId(null);
      queryClient.setQueryData(
        ['combat', 'match', projection.id, 'authoritative-v2', user?.id],
        projection,
      );
      navigate(`/combat/match/${projection.id}`);
    },
    [authoritativeRepository, navigate, queryClient, user?.id],
  );
  const endRankedPracticeSearch = useCallback(() => {
    clearRankedPracticeSearchState(sessionStorage);
    setRankedPracticeRequestId(null);
    setMessage('That Ranked Practice search is no longer active.');
  }, []);
  const handleRankedPracticeReconciliationError = useCallback(() => {
    setMessage('Your search is still active. We’ll keep trying to connect you.');
  }, []);
  const practiceSearch = useRankedSearchController({
    enabled:
      section === 'practice' &&
      Boolean(
        authoritativeRepository && user && rankedPracticeRequestId && rankedPracticeSearchOwned,
      ),
    requestId: rankedPracticeRequestId,
    queue: rankedPracticeQueue.data,
    queueUpdatedAt: rankedPracticeQueue.dataUpdatedAt,
    claim: claimRankedPractice,
    finalize: finalizeRankedPractice,
    onQueueUpdate: updateRankedPracticeQueue,
    onTerminal: endRankedPracticeSearch,
    onTransientError: handleRankedPracticeReconciliationError,
  });

  const requireAccount = (): boolean => {
    if (status === 'authenticated' && user && transport && previewRepository) return true;
    setMessage('Sign in to create, join, or resume COMBAT games.');
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
      const fingerprint = practiceLobbyConfigurationFingerprint(config);
      const pending = readPendingPracticeLobbyCreation(sessionStorage, user.id);
      if (pending) {
        const recovered = await transport.recoverPublicLobby({
          gameId: pending.gameId,
          ownerUserId: user.id,
          configurationFingerprint: pending.configurationFingerprint,
        });
        if (recovered) {
          queryClient.setQueryData(
            ['combat', 'match', recovered.id, 'cooperative-preview', user.id],
            recovered,
          );
          await Promise.all([lobbies.refetch(), active.refetch()]);
          navigate(`/combat/match/${recovered.id}`);
          clearPendingPracticeLobbyCreation(sessionStorage, user.id);
          setMessage('Previously committed Practice lobby recovered without creating a duplicate.');
          return;
        }
      }
      const intent =
        pending && pending.configurationFingerprint === fingerprint
          ? pending
          : createPendingPracticeLobbyCreation({
              gameId: pending?.gameId ?? `amordle-practice-${crypto.randomUUID()}`,
              ownerNamespace: user.id,
              config,
              requestedAt: new Date().toISOString(),
            });
      writePendingPracticeLobbyCreation(sessionStorage, intent);
      const lobby = await transport.createPublicLobby({
        id: intent.gameId,
        hostUserId: user.id,
        config,
        now: intent.requestedAt,
      });
      queryClient.setQueryData(
        ['combat', 'match', lobby.id, 'cooperative-preview', user.id],
        lobby,
      );
      await Promise.all([lobbies.refetch(), active.refetch()]);
      setMessage('Answerless public lobby created. Waiting for a second signed-in account.');
      navigate(`/combat/match/${lobby.id}`);
      clearPendingPracticeLobbyCreation(sessionStorage, user.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Practice lobby creation failed.');
    } finally {
      setBusy(false);
    }
  };

  const joinLobby = async (lobby: PracticeWaitingProjection) => {
    if (!requireAccount() || !user || !transport || !publicRepository) return;
    setBusy(true);
    try {
      const [list, ownerProfile] = await Promise.all([
        wordListProvider.load(lobby.wordLength),
        publicRepository.getMyProfile(),
      ]);
      const count = lobby.mode === 'go' ? lobby.goPuzzleCount! : 1;
      const answers = choosePracticeAnswers(answerPoolForDifficulty(list, lobby.difficulty), count);
      const joinerName =
        ownerProfile?.visibility === 'public' && ownerProfile.displayName
          ? ownerProfile.displayName
          : 'Player Two';
      const joined = await transport.joinPublicLobby({
        gameId: lobby.id,
        joinerUserId: user.id,
        expectedUpdatedAt: lobby.updatedAt,
        displayNames: ['Player One', joinerName],
        answers,
        wordRevision: list.revision,
        now: new Date().toISOString(),
      });
      queryClient.setQueryData(
        ['combat', 'match', lobby.id, 'cooperative-preview', user.id],
        joined,
      );
      setMessage('Lobby joined. The game is ready.');
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
    if (!requireAccount() || !previewRepository || !user || rankedDailyCreateInFlight.current) {
      return;
    }
    rankedDailyCreateInFlight.current = true;
    setRankedDailyAction('creating');
    try {
      const dailyDateKey = utcDateKey();
      const fingerprint = `${dailyDateKey}:${rankedMode}:${rankedHardMode ? 'hard' : 'normal'}`;
      const restored = readRankedDailySearchIntent(sessionStorage, user.id);
      if (restored?.requestId && restored.fingerprint !== fingerprint) {
        setRankedDailyIntent(restored);
        setMessage('Cancel your current Ranked Daily search before changing its settings.');
        return;
      }
      const intent =
        restored && restored.fingerprint === fingerprint
          ? restored
          : createRankedDailySearchIntent({
              ownerNamespace: user.id,
              dailyDateKey,
              mode: rankedMode,
              hardMode: rankedHardMode,
              requestedAt: new Date().toISOString(),
            });
      writeRankedDailySearchIntent(sessionStorage, intent);
      setRankedDailyIntent(intent);
      if (intent.requestId) {
        setMessage(combatPlayerCopy.searchQueued);
        return;
      }
      const queue = await previewRepository.createRankedDailyQueue({
        mode: intent.mode,
        dailyDateKey: intent.dailyDateKey,
        hardMode: intent.hardMode,
        idempotencyKey: intent.idempotencyKey,
      });
      const attached = attachRankedDailyRequest(intent, queue.requestId);
      writeRankedDailySearchIntent(sessionStorage, attached);
      setRankedDailyIntent(attached);
      queryClient.setQueryData(['combat', 'ranked-daily-queue', user.id, queue.requestId], queue);
      setMessage(combatPlayerCopy.searchQueued);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Ranked Daily search could not be started.',
      );
    } finally {
      rankedDailyCreateInFlight.current = false;
      setRankedDailyAction(null);
    }
  };

  const cancelRankedDaily = async () => {
    if (!previewRepository || !rankedRequestId || !user) return;
    setRankedDailyAction('cancelling');
    try {
      const queue = await previewRepository.cancelRankedDailyQueue(rankedRequestId);
      if (queue.status === 'cancelled' || queue.status === 'expired') {
        clearRankedDailySearchIntent(sessionStorage, user.id);
        clearLegacyRankedDailyRequestId(sessionStorage);
        setRankedDailyIntent(null);
        setLegacyRankedDailyRequestId(null);
        setMessage('Ranked Daily search cancelled.');
      }
    } catch (error) {
      await rankedQueue.refetch();
      setMessage(
        error instanceof Error
          ? error.message
          : 'The cancellation could not be confirmed. Your search is still being checked.',
      );
    } finally {
      setRankedDailyAction(null);
    }
  };

  const createUnrankedDaily = async () => {
    if (!requireAccount() || !authoritativeRepository || !user) return;
    setBusy(true);
    try {
      const dateKey = utcDateKey();
      const existing = readPendingDailyLobby(sessionStorage, user.id);
      const pending =
        existing &&
        existing.mode === rankedMode &&
        existing.hardMode === rankedHardMode &&
        existing.dailyDateKey === dateKey
          ? existing
          : createPendingDailyLobby({
              ownerNamespace: user.id,
              mode: rankedMode,
              hardMode: rankedHardMode,
              dailyDateKey: dateKey,
              requestedAt: new Date().toISOString(),
            });
      writePendingDailyLobby(sessionStorage, pending);
      const lobby = await authoritativeRepository.createUnrankedDailyLobby({
        mode: pending.mode,
        hardMode: pending.hardMode,
        creationKey: pending.creationKey,
      });
      queryClient.setQueryData(['combat', 'match', lobby.id, 'authoritative-v2', user.id], lobby);
      clearPendingDailyLobby(sessionStorage);
      await Promise.all([dailyLobbies.refetch(), active.refetch(), authoritativeActive.refetch()]);
      setMessage('Unranked Daily lobby created for today’s UTC lane.');
      navigate(`/combat/match/${lobby.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unranked Daily lobby creation failed.');
    } finally {
      setBusy(false);
    }
  };

  const joinUnrankedDaily = async (lobby: UnrankedDailyLobby) => {
    if (!requireAccount() || !authoritativeRepository || !user) return;
    setBusy(true);
    try {
      if (lobby.scope !== 'daily' || lobby.dailyDateKey !== utcDateKey()) {
        throw new Error('Only today’s UTC Daily lobby can be joined.');
      }
      const joined = await authoritativeRepository.joinUnrankedDailyLobby({
        gameId: lobby.id,
        actionId: crypto.randomUUID(),
        expectedVersion: lobby.version,
      });
      queryClient.setQueryData(['combat', 'match', lobby.id, 'authoritative-v2', user.id], joined);
      await Promise.all([dailyLobbies.refetch(), active.refetch(), authoritativeActive.refetch()]);
      setMessage('Unranked Daily lobby joined.');
      navigate(`/combat/match/${joined.id}`);
    } catch (error) {
      await dailyLobbies.refetch();
      setMessage(error instanceof Error ? error.message : 'Unranked Daily join failed.');
    } finally {
      setBusy(false);
    }
  };

  const cancelUnrankedDaily = async (lobby: UnrankedDailyLobby) => {
    if (!requireAccount() || !authoritativeRepository || !user) return;
    setBusy(true);
    try {
      await authoritativeRepository.cancelUnrankedDailyLobby({
        gameId: lobby.id,
        actionId: crypto.randomUUID(),
        expectedVersion: lobby.version,
      });
      await Promise.all([dailyLobbies.refetch(), active.refetch(), authoritativeActive.refetch()]);
      setMessage('Unranked Daily lobby cancelled and its lane claim released.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unranked Daily cancellation failed.');
    } finally {
      setBusy(false);
    }
  };

  const enterRankedPractice = async () => {
    if (
      !requireAccount() ||
      !authoritativeRepository ||
      !user ||
      rankedPracticeCreateInFlight.current
    ) {
      return;
    }
    rankedPracticeCreateInFlight.current = true;
    setRankedPracticeAction('creating');
    try {
      const configuration = {
        mode,
        wordLength,
        difficulty,
        hardMode,
        puzzleCount,
        timeLimitMs: rankedPracticeTimed ? (300_000 as const) : null,
      };
      const fingerprint = rankedPracticeSearchFingerprint(configuration);
      const existing = readRankedPracticeSearchState(sessionStorage, user.id);
      const search =
        existing && existing.requestId === null && existing.fingerprint === fingerprint
          ? existing
          : createRankedPracticeSearchState({
              ownerNamespace: user.id,
              configuration,
              requestedAt: new Date().toISOString(),
            });
      writeRankedPracticeSearchState(sessionStorage, search);
      const queue = await authoritativeRepository.createRankedPracticeRequest({
        mode,
        wordLength,
        difficulty,
        hardMode,
        goPuzzleCount: puzzleCount,
        timeLimitMs: configuration.timeLimitMs,
        creationKey: search.idempotencyKey,
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      });
      writeRankedPracticeSearchState(
        sessionStorage,
        attachRankedPracticeRequest(search, queue.requestId),
      );
      setRankedPracticeRequestId(queue.requestId);
      queryClient.setQueryData(
        ['combat', 'ranked-practice-queue', user.id, queue.requestId],
        queue,
      );
      setMessage(combatPlayerCopy.searchQueued);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Ranked Practice search could not be started.',
      );
    } finally {
      rankedPracticeCreateInFlight.current = false;
      setRankedPracticeAction(null);
    }
  };

  const cancelRankedPractice = async () => {
    if (!authoritativeRepository || !rankedPracticeRequestId) return;
    setRankedPracticeAction('cancelling');
    try {
      const queue = await authoritativeRepository.cancelRankedPractice({
        requestId: rankedPracticeRequestId,
        actionId: crypto.randomUUID(),
      });
      if (queue.status === 'cancelled' || queue.status === 'expired') {
        clearRankedPracticeSearchState(sessionStorage);
        setRankedPracticeRequestId(null);
        setMessage('Ranked Practice search cancelled.');
      }
    } catch (error) {
      await rankedPracticeQueue.refetch();
      setMessage(
        error instanceof Error
          ? error.message
          : 'The cancellation could not be confirmed. Your search is still being checked.',
      );
    } finally {
      setRankedPracticeAction(null);
    }
  };

  const createPrivateRequest = async () => {
    if (!requireAccount() || !privateRepository || !user) return;
    if (!privateTargetProfile.data || privateTargetProfile.data.publicProfileId !== privateTarget) {
      setMessage('Choose an eligible public player before sending a private request.');
      return;
    }
    setBusy(true);
    try {
      const request = await privateRepository.create({
        targetPublicProfileId: privateTarget,
        mode,
        wordLength,
        hardMode,
        ...(timeLimitMs === null ? {} : { timeLimitMs }),
        ...(mode === 'go' ? { goPuzzleCount: puzzleCount } : {}),
        idempotencyKey: `amordle-private-request:${user.id}:${privateTarget}:${mode}:${wordLength}:${hardMode}:${timeLimitMs ?? 'none'}:${puzzleCount}`,
      });
      setMessage(
        `Private Practice request sent to ${request.opponent.displayName ?? 'the selected player'}.`,
      );
      await privateRequests.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Private Practice request failed.');
    } finally {
      setBusy(false);
    }
  };

  const respondToPrivateRequest = async (
    request: PrivateRequestProjection,
    action: 'accept' | 'decline' | 'cancel',
  ) => {
    if (!requireAccount() || !privateRepository) return;
    setBusy(true);
    try {
      if (action === 'decline') {
        await privateRepository.decline(request.requestId);
        setMessage('Private Practice request declined.');
      } else if (action === 'cancel') {
        await privateRepository.cancel(request.requestId);
        setMessage('Private Practice request cancelled.');
      } else {
        const list = await wordListProvider.load(request.wordLength);
        const count = request.mode === 'go' ? request.goPuzzleCount! : 1;
        const gameId = `amordle-private-${crypto.randomUUID()}`;
        const state = createPracticeCombatPreview({
          id: gameId,
          config: {
            mode: request.mode,
            wordLength: request.wordLength,
            difficulty,
            hardMode: request.hardMode,
            puzzleCount: count,
            timeLimitMs: request.timeLimitMs,
          },
          players: [
            { displayName: request.requester.displayName ?? 'Player One' },
            { displayName: request.opponent.displayName ?? 'Player Two' },
          ],
          answers: choosePracticeAnswers(answerPoolForDifficulty(list, difficulty), count),
          now: new Date().toISOString(),
        });
        const withPlaceholderIds = buildCooperativePracticeProjection({
          sourceKind: 'private-request',
          playerOneUserId: '00000000-0000-4000-8000-000000000001',
          playerTwoUserId: '00000000-0000-4000-8000-000000000002',
          wordRevision: list.revision,
          state,
        });
        const browserProjection = structuredClone(withPlaceholderIds) as Record<string, unknown>;
        delete browserProjection.playerUserIds;
        const accepted = await privateRepository.accept(
          request.requestId,
          browserProjection as Json,
          `amordle-private-accept:${request.requestId}:${gameId}`,
        );
        if (!accepted.createdGameId) {
          throw new Error('Private request acceptance did not return a game.');
        }
        setMessage('Private Practice request accepted.');
        navigate(`/combat/match/${accepted.createdGameId}`);
      }
      await privateRequests.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Private request action failed.');
    } finally {
      setBusy(false);
    }
  };

  const respondToRematch = async (
    request: RematchProjection,
    action: 'accept' | 'decline' | 'cancel',
  ) => {
    if (!requireAccount() || !previewRepository || !transport || !user) return;
    setBusy(true);
    try {
      const result =
        action === 'accept'
          ? await transport.acceptRematch({ request, viewerUserId: user.id, difficulty })
          : action === 'decline'
            ? await previewRepository.declineRematch(request.requestId)
            : await previewRepository.cancelRematch(request.requestId);
      await rematches.refetch();
      if (result.createdGameId) {
        navigate(`/combat/match/${result.createdGameId}`);
      } else {
        setMessage(
          action === 'decline'
            ? 'Practice rematch declined.'
            : action === 'cancel'
              ? 'Practice rematch cancelled.'
              : 'Practice rematch accepted.',
        );
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Practice rematch action failed.');
    } finally {
      setBusy(false);
    }
  };

  const participant: CombatPreviewParticipant = {
    key: 'viewer',
    displayName:
      ownerProfile.data?.displayName ?? (status === 'authenticated' ? 'Account' : 'Guest'),
    shortLabel: ownerProfile.data?.displayName
      ? ownerProfile.data.displayName.slice(0, 2).toLocaleUpperCase('en-US')
      : status === 'authenticated'
        ? 'YOU'
        : 'G',
    tone: 'ember',
    publicProfileId: ownerProfile.data?.publicProfileId ?? null,
    avatarUrl: ownerProfile.data?.avatarUrl ?? null,
    accentColor: ownerProfile.data?.accentColor ?? null,
  };
  const activeGames = Array.from(
    new Map(
      [...(authoritativeActive.data ?? []), ...(active.data ?? [])]
        .filter((game) => ['waiting', 'playing', 'holding'].includes(game.status))
        .map((game) => [game.id, game]),
    ).values(),
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
              searchPhase={dailySearch.phase}
              rankedAction={rankedDailyAction}
              busy={busy}
              onMode={setRankedMode}
              onHardMode={setRankedHardMode}
              onEnter={() => void enterRankedDaily()}
              onCancel={() => void cancelRankedDaily()}
              unrankedLobbies={dailyLobbies.data ?? []}
              onCreateUnranked={() => void createUnrankedDaily()}
              onJoinUnranked={(lobby) => void joinUnrankedDaily(lobby)}
              onCancelUnranked={(lobby) => void cancelUnrankedDaily(lobby)}
            />
          ) : null}
          {section === 'practice' ? (
            <>
              <PracticeForm
                mode={mode}
                wordLength={wordLength}
                difficulty={difficulty}
                hardMode={hardMode}
                puzzleCount={puzzleCount}
                timeLimitMs={timeLimitMs}
                busy={busy}
                locked={
                  rankedPracticeAction !== null ||
                  ['queued', 'matched'].includes(practiceSearch.phase)
                }
                onMode={setMode}
                onWordLength={setWordLength}
                onDifficulty={setDifficulty}
                onHardMode={setHardMode}
                onPuzzleCount={setPuzzleCount}
                onTimeLimit={setTimeLimitMs}
                onCreate={() => void createLobby()}
              />
              <RankedPracticePanel
                timed={rankedPracticeTimed}
                searchPhase={practiceSearch.phase}
                rankedAction={rankedPracticeAction}
                onTimed={setRankedPracticeTimed}
                onEnter={() => void enterRankedPractice()}
                onCancel={() => void cancelRankedPractice()}
              />
              <PrivateRequestComposer
                profile={privateTargetProfile.data ?? null}
                resolving={privateTargetProfile.isPending && isPublicProfileId(privateTarget)}
                unavailable={
                  privateTarget.length > 0 &&
                  (!isPublicProfileId(privateTarget) ||
                    privateTargetProfile.isError ||
                    (!privateTargetProfile.isPending && !privateTargetProfile.data))
                }
                busy={busy}
                onCreate={() => void createPrivateRequest()}
              />
            </>
          ) : null}
          {section === 'active' ? (
            <ActivePanel
              games={activeGames}
              loading={active.isPending || authoritativeActive.isPending}
              error={
                active.isError || authoritativeActive.isError
                  ? 'One participant-game lane could not be loaded.'
                  : null
              }
              onRetry={() => {
                void Promise.all([active.refetch(), authoritativeActive.refetch()]);
              }}
            />
          ) : null}
          {section === 'lobby' ? (
            <>
              <LobbyList
                lobbies={lobbies.data ?? []}
                participant={participant}
                busy={busy}
                loading={lobbies.isPending}
                error={lobbies.isError ? 'Practice lobbies could not be loaded.' : null}
                onRetry={() => void lobbies.refetch()}
                onJoin={(lobby) => void joinLobby(lobby)}
                onCancel={(lobby) => void cancelLobby(lobby)}
              />
              <PrivateRequestList
                requests={privateRequests.data ?? []}
                busy={busy}
                onAction={(request, action) => void respondToPrivateRequest(request, action)}
              />
              <RematchRequestList
                requests={rematches.data ?? []}
                busy={busy}
                onAction={(request, action) => void respondToRematch(request, action)}
              />
            </>
          ) : null}
          {section === 'live' ? (
            <LivePanel
              games={live.data ?? []}
              loading={live.isPending}
              error={live.isError ? 'Live games could not be loaded.' : null}
              onRetry={() => void live.refetch()}
            />
          ) : null}
        </div>
        <aside className="combat-rail">
          <h2>COMBAT guide</h2>
          <dl className="data-list">
            <div>
              <dt>Unranked Practice</dt>
              <dd>Casual public games</dd>
            </div>
            <div>
              <dt>Ranked Daily</dt>
              <dd>One ranked game each day</dd>
            </div>
            <div>
              <dt>Ranked Practice</dt>
              <dd>Matchmaking and ratings</dd>
            </div>
            <div>
              <dt>Public Live</dt>
              <dd>Read-only spectating</dd>
            </div>
          </dl>
          <p>Choose Daily for today’s challenge or Practice for custom games and matchmaking.</p>
          <ButtonLink to="/help">Read COMBAT help</ButtonLink>
        </aside>
      </div>
    </div>
  );
}

function LivePanel({
  games,
  loading,
  error,
  onRetry,
}: {
  games: readonly CombatLiveProjection[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <>
      <SectionHeading title="Live Practice exchange" />
      <p className="privacy-band">
        Watch eligible public Practice games. Spectators cannot make moves.
      </p>
      <RuledList>
        {loading ? <p role="status">Loading Live games…</p> : null}
        {error ? (
          <div className="support-state" role="alert">
            <strong>{error}</strong>
            <Button onClick={onRetry}>Retry Live</Button>
          </div>
        ) : null}
        {games.map((game) => (
          <div className="active-game-row" key={game.id}>
            <StatusDot tone={game.status === 'playing' ? 'green' : 'ice'}>{game.status}</StatusDot>
            <div>
              <strong>
                {game.mode.toUpperCase()} · {game.wordLength} letters
              </strong>
              <small>
                {game.players.map((player) => player.label).join(' vs ')} ·{' '}
                {game.ranked ? 'ranked' : 'unranked'} · {game.progress.moveCount} turns
              </small>
            </div>
            <ButtonLink tone="primary" to={`/combat/live/${game.id}`}>
              Spectate
            </ButtonLink>
          </div>
        ))}
        {games.length === 0 && !loading && !error ? (
          <p className="empty-state">No public Practice games are currently eligible for Live.</p>
        ) : null}
      </RuledList>
    </>
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
          <p>One UTC challenge each day · ranked or unranked.</p>
          <ButtonLink to="/combat/daily">Open Daily</ButtonLink>
        </section>
        <section>
          <Icon name="combat" />
          <h2>Practice</h2>
          <p>Public shared play · lengths 2–35 · flexible clocks.</p>
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
        title="Ranked Practice is ready"
        statusLabel="Online"
        statusTone="green"
        description="Search for a compatible rival, play, and receive your rating update when the game ends."
      />
    </div>
  );
}

function DailyPanel({
  mode,
  hardMode,
  searchPhase,
  rankedAction,
  busy,
  onMode,
  onHardMode,
  onEnter,
  onCancel,
  unrankedLobbies,
  onCreateUnranked,
  onJoinUnranked,
  onCancelUnranked,
}: {
  mode: 'og' | 'go';
  hardMode: boolean;
  searchPhase: RankedSearchPhase;
  rankedAction: 'creating' | 'cancelling' | null;
  busy: boolean;
  onMode: (mode: 'og' | 'go') => void;
  onHardMode: (value: boolean) => void;
  onEnter: () => void;
  onCancel: () => void;
  unrankedLobbies: readonly UnrankedDailyLobby[];
  onCreateUnranked: () => void;
  onJoinUnranked: (lobby: UnrankedDailyLobby) => void;
  onCancelUnranked: (lobby: UnrankedDailyLobby) => void;
}) {
  const searchActive =
    rankedAction !== null || ['queued', 'claiming', 'matched', 'finalizing'].includes(searchPhase);
  const preparingGame = searchPhase === 'matched' || searchPhase === 'finalizing';
  return (
    <>
      <SectionHeading title="Daily COMBAT" meta={`${utcDateKey()} · UTC`} />
      <form className="practice-form" onSubmit={(event) => event.preventDefault()}>
        <label>
          Mode
          <select
            value={mode}
            disabled={searchActive}
            onChange={(event) => onMode(event.target.value as 'og' | 'go')}
          >
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
            disabled={searchActive}
            onChange={(event) => onHardMode(event.target.checked)}
          />{' '}
          Hard Mode
        </label>
        <Button tone="primary" disabled={busy || searchActive} onClick={onCreateUnranked}>
          Create unranked Daily lobby
        </Button>
        <Button tone="primary" disabled={rankedAction !== null || searchActive} onClick={onEnter}>
          {rankedAction === 'creating' ? 'Starting search…' : 'Enter ranked Daily'}
        </Button>
        {searchActive ? (
          <Button disabled={rankedAction !== null || preparingGame} onClick={onCancel}>
            Cancel search
          </Button>
        ) : null}
      </form>
      {searchActive ? (
        <div className="ranked-search-status" role="status" aria-live="polite">
          <span className="ranked-search-indicator" aria-hidden="true" />
          <strong>
            {preparingGame ? 'Rival found. Preparing your game…' : combatPlayerCopy.searching}
          </strong>
        </div>
      ) : null}
      <p className="privacy-band">
        <Icon name="lock" /> Fixed five letters · no clock · separate unranked and ranked claims ·
        never public Live
      </p>
      <section className="support-state" aria-labelledby="daily-lobbies-title">
        <h2 id="daily-lobbies-title">Unranked Daily lobbies</h2>
        {unrankedLobbies.length === 0 ? (
          <p>No open unranked Daily lobby exists for today’s UTC date.</p>
        ) : (
          unrankedLobbies.map((lobby) => {
            const owned = lobby.capabilities.canCancel;
            return (
              <div className="active-game-row" key={lobby.id}>
                <StatusDot tone="green">waiting</StatusDot>
                <div>
                  <strong>{lobby.mode.toUpperCase()} · 5 letters</strong>
                  <small>Unranked · Expert · no clock</small>
                </div>
                <Button
                  disabled={busy}
                  onClick={() => (owned ? onCancelUnranked(lobby) : onJoinUnranked(lobby))}
                >
                  {owned ? 'Cancel lobby' : 'Join Daily'}
                </Button>
              </div>
            );
          })
        )}
      </section>
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
  locked,
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
  locked: boolean;
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
          <select
            value={mode}
            disabled={locked}
            onChange={(event) => onMode(event.target.value as 'og' | 'go')}
          >
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
            disabled={locked}
            onChange={(event) => onWordLength(Number(event.target.value))}
          />
        </label>
        <label>
          Difficulty
          <select
            value={difficulty}
            disabled={locked}
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
              disabled={locked}
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
            disabled={locked}
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
            disabled={locked}
            onChange={(event) => onHardMode(event.target.checked)}
          />{' '}
          Hard Mode
        </label>
        <Button tone="primary" disabled={busy || locked} onClick={onCreate}>
          Create public lobby
        </Button>
        <ButtonLink to="/leaderboards">Find a player for a private request</ButtonLink>
      </form>
      <p className="privacy-band">
        Public Practice is unranked. Games save automatically and do not change ratings.
      </p>
    </>
  );
}

function RankedPracticePanel({
  timed,
  searchPhase,
  rankedAction,
  onTimed,
  onEnter,
  onCancel,
}: {
  timed: boolean;
  searchPhase: RankedSearchPhase;
  rankedAction: 'creating' | 'cancelling' | null;
  onTimed: (value: boolean) => void;
  onEnter: () => void;
  onCancel: () => void;
}) {
  const searchActive = ['queued', 'claiming', 'matched', 'finalizing'].includes(searchPhase);
  const preparingGame = searchPhase === 'matched' || searchPhase === 'finalizing';
  return (
    <section className="support-state" aria-labelledby="ranked-practice-title">
      <h2 id="ranked-practice-title">Ranked Practice</h2>
      <p>
        Uses the same mode, length, Hard Mode, difficulty, and GO chain selected above. Ranked
        matchmaking supports untimed or five-minute games.
      </p>
      <label className="check-control">
        <input
          type="checkbox"
          checked={timed}
          disabled={searchActive}
          onChange={(event) => onTimed(event.target.checked)}
        />{' '}
        Five-minute player clocks
      </label>
      <Button tone="primary" disabled={rankedAction !== null || searchActive} onClick={onEnter}>
        {rankedAction === 'creating' ? 'Starting search…' : 'Find ranked opponent'}
      </Button>
      {searchActive ? (
        <Button disabled={rankedAction !== null || preparingGame} onClick={onCancel}>
          Cancel ranked search
        </Button>
      ) : null}
      {searchActive ? (
        <div className="ranked-search-status" role="status" aria-live="polite">
          <span className="ranked-search-indicator" aria-hidden="true" />
          <strong>
            {preparingGame ? 'Rival found. Preparing your game…' : combatPlayerCopy.searching}
          </strong>
        </div>
      ) : null}
      <p className="privacy-band">
        Ranked games use matched settings and update ratings after the result.
      </p>
    </section>
  );
}

function PrivateRequestComposer({
  profile,
  resolving,
  unavailable,
  busy,
  onCreate,
}: {
  profile: PublicProfileProjection | null;
  resolving: boolean;
  unavailable: boolean;
  busy: boolean;
  onCreate: () => void;
}) {
  return (
    <section className="support-state" aria-labelledby="private-practice-title">
      <h2 id="private-practice-title">Private Practice request</h2>
      <p>
        Choose an eligible player from a public profile, then send the current Practice settings.
        Private-game preferences and blocked-player settings are respected.
      </p>
      {resolving ? <p role="status">Loading the selected public player…</p> : null}
      {profile ? (
        <div className="support-state">
          <StatusDot tone="ice">Selected player</StatusDot>
          <strong>{profile.displayName ?? 'Public player'}</strong>
          <Button tone="primary" disabled={busy} onClick={onCreate}>
            Send private request
          </Button>
        </div>
      ) : null}
      {unavailable ? (
        <p role="alert">
          The selected player does not have an eligible public profile. Choose another public
          player.
        </p>
      ) : null}
      {!profile && !resolving ? (
        <ButtonLink to="/leaderboards">Choose a public player</ButtonLink>
      ) : null}
    </section>
  );
}

function PrivateRequestList({
  requests,
  busy,
  onAction,
}: {
  requests: readonly PrivateRequestProjection[];
  busy: boolean;
  onAction: (request: PrivateRequestProjection, action: 'accept' | 'decline' | 'cancel') => void;
}) {
  const pending = requests.filter((request) => request.status === 'requested');
  return (
    <>
      <SectionHeading title="Private Practice requests" />
      <RuledList>
        {pending.map((request) => {
          const rival = request.viewerRole === 'requester' ? request.opponent : request.requester;
          return (
            <div className="active-game-row" key={request.requestId}>
              <StatusDot tone="ice">requested</StatusDot>
              <div>
                <strong>{rival.displayName ?? 'Private player'}</strong>
                <small>
                  {request.mode.toUpperCase()} · {request.wordLength} letters ·{' '}
                  {request.timeLimitMs ? `${request.timeLimitMs / 1_000}s` : 'untimed'}
                </small>
              </div>
              {request.capabilities.canAccept ? (
                <>
                  <Button
                    tone="primary"
                    disabled={busy}
                    onClick={() => onAction(request, 'accept')}
                  >
                    Accept
                  </Button>
                  <Button disabled={busy} onClick={() => onAction(request, 'decline')}>
                    Decline
                  </Button>
                </>
              ) : null}
              {request.capabilities.canCancel ? (
                <Button tone="danger" disabled={busy} onClick={() => onAction(request, 'cancel')}>
                  Cancel
                </Button>
              ) : null}
            </div>
          );
        })}
        {pending.length === 0 ? (
          <p className="empty-state">No private Practice requests require attention.</p>
        ) : null}
      </RuledList>
    </>
  );
}

function RematchRequestList({
  requests,
  busy,
  onAction,
}: {
  requests: readonly RematchProjection[];
  busy: boolean;
  onAction: (request: RematchProjection, action: 'accept' | 'decline' | 'cancel') => void;
}) {
  const pending = requests.filter((request) => request.status === 'requested');
  return (
    <>
      <SectionHeading title="Practice rematches" />
      <RuledList>
        {pending.map((request) => (
          <div className="active-game-row" key={request.requestId}>
            <StatusDot tone="ice">rematch</StatusDot>
            <div>
              <strong>
                {request.mode.toUpperCase()} · {request.wordLength} letters
              </strong>
              <small>
                {request.timeLimitMs ? `${request.timeLimitMs / 1_000}s` : 'untimed'} · private game
              </small>
            </div>
            {request.capabilities.canAccept ? (
              <>
                <Button tone="primary" disabled={busy} onClick={() => onAction(request, 'accept')}>
                  Accept
                </Button>
                <Button disabled={busy} onClick={() => onAction(request, 'decline')}>
                  Decline
                </Button>
              </>
            ) : null}
            {request.capabilities.canCancel ? (
              <Button tone="danger" disabled={busy} onClick={() => onAction(request, 'cancel')}>
                Cancel
              </Button>
            ) : null}
          </div>
        ))}
        {pending.length === 0 ? (
          <p className="empty-state">No Practice rematch requests require attention.</p>
        ) : null}
      </RuledList>
    </>
  );
}

function ActivePanel({
  games,
  loading,
  error,
  onRetry,
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
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <>
      <SectionHeading title="Your active games" />
      <RuledList>
        {loading ? <p role="status">Loading active games…</p> : null}
        {error ? (
          <div className="support-state" role="alert">
            <strong>{error}</strong>
            <Button onClick={onRetry}>Retry Active games</Button>
          </div>
        ) : null}
        {games.map((game) => (
          <div className="active-game-row" key={game.id}>
            <StatusDot tone={game.status === 'playing' ? 'green' : 'ice'}>{game.status}</StatusDot>
            <div>
              <strong>
                {game.mode.toUpperCase()} {game.scope}
              </strong>
              <small>
                {game.wordLength} letters · {game.ranked ? 'ranked' : 'unranked'}
              </small>
            </div>
            <ButtonLink tone="primary" to={`/combat/match/${game.id}`}>
              Open
            </ButtonLink>
          </div>
        ))}
        {games.length === 0 && !loading && !error ? (
          <p className="empty-state">No active COMBAT games.</p>
        ) : null}
      </RuledList>
    </>
  );
}

function LobbyList({
  lobbies,
  participant,
  busy,
  loading,
  error,
  onRetry,
  onJoin,
  onCancel,
}: {
  lobbies: readonly PracticeWaitingProjection[];
  participant: CombatPreviewParticipant;
  busy: boolean;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onJoin: (lobby: PracticeWaitingProjection) => void;
  onCancel: (lobby: PracticeWaitingProjection) => void;
}) {
  return (
    <>
      <SectionHeading title="Open public Practice lobbies" />
      {loading ? <p role="status">Loading public Practice lobbies…</p> : null}
      {error ? (
        <div className="support-state" role="alert">
          <strong>{error}</strong>
          <Button onClick={onRetry}>Retry Practice lobbies</Button>
        </div>
      ) : null}
      {lobbies.map((lobby) => (
        <CombatLobbyPanel
          key={lobby.id}
          title={`${lobby.mode.toUpperCase()} · ${lobby.wordLength} letters`}
          description="Public Practice lobby"
          statusLabel={lobby.viewerSeat === 'player-one' ? 'Your lobby' : 'Open'}
          host={
            lobby.viewerSeat === 'player-one'
              ? participant
              : {
                  key: `private:${lobby.id}`,
                  displayName: 'Private player',
                  shortLabel: '—',
                  tone: 'ember',
                }
          }
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
      {lobbies.length === 0 && !loading && !error ? (
        <p className="empty-state">No public Practice lobbies are open.</p>
      ) : null}
    </>
  );
}
