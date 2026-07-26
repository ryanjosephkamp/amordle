import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import { useAuth } from '../../app/auth-context';
import { Button, ButtonLink } from '../../components/Button';
import { Disclosure } from '../../components/Disclosure';
import { emptyRow, type Tile } from '../../components/gameBoardData';
import { useKeyboardInput } from '../../components/keyboard/useKeyboardInput';
import { sharedCombatRowCapacity } from '../../domain/combat';
import {
  practiceCombatAttemptBudget,
  practiceCombatPlayerPoints,
  practiceCombatPriorEvidence,
} from '../../domain/practice-combat-preview';
import {
  AuthoritativeCombatRepository,
  authoritativeGuessMoves,
} from '../../services/authoritative-combat-repository';
import { AccountRepository } from '../../services/account-repository';
import { createCombatHistoryRow } from '../../services/combat-history';
import { wordListProvider } from '../../services/word-list-provider';
import { combatLaneLabel, projectedCombatPoints } from '../../domain/combat-presentation';
import {
  CombatParticipantHeader,
  CombatSharedActorBoard,
  CombatTerminalResultPanel,
  CombatUnavailablePanel,
  type CombatActorRow,
  type CombatPreviewParticipant,
} from './components';
import { CombatLiveRepository } from '../../services/combat-live-repository';
import { CombatPreviewRepository } from '../../services/combat-preview-repository';
import { useAuthoritativeCombatMatch } from './useAuthoritativeCombatMatch';
import { usePracticeCombatMatch } from './usePracticeCombatMatch';
import { useRankedDailyCombatMatch } from './useRankedDailyCombatMatch';

function shortLabel(displayName: string): string {
  const words = displayName.trim().split(/\s+/);
  return (
    words.length > 1 ? `${words[0]?.[0] ?? ''}${words.at(-1)?.[0] ?? ''}` : displayName.slice(0, 2)
  ).toLocaleUpperCase('en-US');
}

function normalizedDifficulty(
  value: 'casual' | 'standard' | 'expert' | 'easy' | 'medium' | 'hard',
): 'casual' | 'standard' | 'expert' {
  if (value === 'easy') return 'casual';
  if (value === 'medium') return 'standard';
  if (value === 'hard') return 'expert';
  return value;
}

function participantPair(
  identities:
    | readonly {
        seat: 'player-one' | 'player-two';
        displayName: string;
        publicProfileId?: string | null | undefined;
        avatarUrl?: string | null | undefined;
        accentColor?: string | null | undefined;
      }[]
    | undefined,
): readonly [CombatPreviewParticipant, CombatPreviewParticipant] {
  const identityFor = (seat: 'player-one' | 'player-two') =>
    identities?.find((identity) => identity.seat === seat);
  const nameFor = (seat: 'player-one' | 'player-two') =>
    identityFor(seat)?.displayName ?? (seat === 'player-one' ? 'Player One' : 'Player Two');
  const leftName = nameFor('player-one');
  const rightName = nameFor('player-two');
  return [
    {
      key: 'player-one',
      displayName: leftName,
      shortLabel: shortLabel(leftName),
      tone: 'ember',
      publicProfileId: identityFor('player-one')?.publicProfileId ?? null,
      avatarUrl: identityFor('player-one')?.avatarUrl ?? null,
      accentColor: identityFor('player-one')?.accentColor ?? null,
    },
    {
      key: 'player-two',
      displayName: rightName,
      shortLabel: shortLabel(rightName),
      tone: 'ice',
      publicProfileId: identityFor('player-two')?.publicProfileId ?? null,
      avatarUrl: identityFor('player-two')?.avatarUrl ?? null,
      accentColor: identityFor('player-two')?.accentColor ?? null,
    },
  ];
}

function tilesFromScored(
  tiles: readonly { letter: string; state: 'absent' | 'present' | 'correct' }[],
): Tile[] {
  return tiles.map(({ letter, state }) => ({ letter, state }));
}

function formatClock(deadlineAt: string | null): string | undefined {
  if (deadlineAt === null) return undefined;
  const remaining = Math.max(0, Date.parse(deadlineAt) - Date.now());
  const seconds = Math.ceil(remaining / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function ResultDefinitions({ answers }: { answers: readonly string[] }) {
  const normalized = answers
    .map((answer) => answer.trim().toLocaleLowerCase('en-US'))
    .filter((answer) => /^[a-z]{2,35}$/u.test(answer));
  const wordLength = normalized[0]?.length;
  const words = useQuery({
    queryKey: ['result-definitions', wordLength],
    enabled: wordLength !== undefined,
    queryFn: ({ signal }) => wordListProvider.load(wordLength!, signal),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });
  if (normalized.length === 0) return null;
  return (
    <section className="result-definitions" aria-labelledby="result-definitions-title">
      <h2 id="result-definitions-title">Definitions</h2>
      {normalized.map((word) => {
        const entries = words.data?.definitions?.[word] ?? [];
        return (
          <article key={word}>
            <h3>{word.toLocaleUpperCase('en-US')}</h3>
            {entries.length > 0 ? (
              <ul>
                {entries.map((entry, index) => (
                  <li key={`${word}:${index}`}>
                    {entry.partOfSpeech ? <em>{entry.partOfSpeech}: </em> : null}
                    {entry.text}
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                No definition is available.{' '}
                <a
                  href={`https://www.google.com/search?q=define+${encodeURIComponent(word)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Search Google for this word.
                </a>
              </p>
            )}
          </article>
        );
      })}
    </section>
  );
}

function MatchGate({ title, description }: { title: string; description: string }) {
  const navigate = useNavigate();
  return (
    <div className="page page--combat-match">
      <CombatUnavailablePanel
        title={title}
        statusLabel="Unavailable"
        statusTone="muted"
        description={description}
        actions={[{ label: 'Back to COMBAT', onPress: () => navigate('/combat'), tone: 'primary' }]}
      />
    </div>
  );
}

export function CombatMatchPage() {
  const { matchId = '' } = useParams();
  const { client, user, status } = useAuth();
  const repository = useMemo(() => (client ? new CombatPreviewRepository(client) : null), [client]);
  const authoritativeRepository = useMemo(
    () => (client ? new AuthoritativeCombatRepository(client) : null),
    [client],
  );
  const authoritative = useQuery({
    queryKey: ['combat', 'match-kind', matchId, 'authoritative-v2', user?.id],
    enabled: Boolean(authoritativeRepository && user),
    queryFn: () => authoritativeRepository!.getGame(matchId),
    staleTime: 5_000,
    retry: false,
  });
  const summary = useQuery({
    queryKey: ['combat', 'match-kind', matchId, user?.id],
    enabled: Boolean(repository && user),
    queryFn: () => repository!.loadLegacyReadOnlySummary(matchId),
    staleTime: 30_000,
    retry: 1,
  });
  if (status !== 'authenticated' || !user) {
    return (
      <MatchGate
        title="Sign in to open this participant match"
        description="Only players in this match can open it."
      />
    );
  }
  if (authoritative.isPending && summary.isPending) {
    return (
      <div className="route-loading" role="status" aria-live="polite" aria-busy="true">
        <span aria-hidden="true" />
        <p>Opening match…</p>
      </div>
    );
  }
  if (authoritative.data) {
    return <AuthoritativeCombatMatchView matchId={matchId} />;
  }
  if (summary.isError || !summary.data) {
    return (
      <MatchGate
        title="This match cannot be opened safely"
        description={
          summary.error instanceof Error ? summary.error.message : 'The match record was not found.'
        }
      />
    );
  }
  if (summary.data.scope === 'daily' && summary.data.ranked) {
    return <RankedDailyMatchView matchId={matchId} />;
  }
  if (summary.data.scope === 'practice' && summary.data.ranked) {
    return (
      <MatchGate
        title="This older Ranked Practice game is read-only"
        description="Start a new Ranked Practice search to play from Amordle."
      />
    );
  }
  return <PracticeCombatMatchView matchId={matchId} />;
}

function clockLabel(remainingMs: number | null): string | undefined {
  if (remainingMs === null) return undefined;
  const seconds = Math.ceil(Math.max(0, remainingMs) / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function AuthoritativeCombatMatchView({ matchId }: { matchId: string }) {
  const navigate = useNavigate();
  const { user, status } = useAuth();
  const match = useAuthoritativeCombatMatch(matchId);
  const [confirmTerminal, setConfirmTerminal] = useState(false);
  const current = match.current;
  const participants = participantPair(current?.players);
  const pressedKeys = useKeyboardInput({
    disabled: !match.canEdit,
    onCommand: match.onCommand,
  });

  const board = useMemo(() => {
    if (!current) {
      return { rows: [] as Tile[][], actors: [] as CombatActorRow[], activeRow: undefined };
    }
    const currentMoves = authoritativeGuessMoves(current).filter(
      (move) => move.puzzleIndex === current.currentPuzzleIndex,
    );
    const rows: Tile[][] = current.seededRows.map((row) => tilesFromScored(row.tiles));
    const actors: CombatActorRow[] = current.seededRows.map((row) => ({
      participantKey: null,
      shortLabel: row.label,
      kind: 'evidence',
    }));
    for (const move of currentMoves) {
      rows.push(tilesFromScored(move.tiles));
      const participant = move.seat === 'player-one' ? participants[0] : participants[1];
      actors.push({
        participantKey: participant.key,
        shortLabel: participant.shortLabel,
        kind: 'participant',
      });
    }
    let activeRow: number | undefined;
    if (match.canEdit) {
      activeRow = rows.length;
      rows.push(emptyRow(current.wordLength, match.draft));
      const participant = current.viewerSeat === 'player-one' ? participants[0] : participants[1];
      actors.push({
        participantKey: participant.key,
        shortLabel: participant.shortLabel,
        kind: 'participant',
      });
    }
    const targetRows = sharedCombatRowCapacity({
      seededRows: current.seededRows.length,
      acceptedMoves: currentMoves.length,
      hasActiveDraft: match.canEdit,
      attemptBudget: current.attemptBudget,
    });
    while (rows.length < targetRows) {
      rows.push(emptyRow(current.wordLength));
      actors.push({ participantKey: null, shortLabel: '', kind: 'participant' });
    }
    return { rows, actors, activeRow };
  }, [current, match.canEdit, match.draft, participants]);

  if (status !== 'authenticated' || !user) {
    return (
      <MatchGate
        title="Sign in to open this participant match"
        description="Only players in this match can open it."
      />
    );
  }
  if (match.projection.isPending) {
    return (
      <div className="route-loading" role="status" aria-live="polite" aria-busy="true">
        <span aria-hidden="true" />
        <p>Loading match…</p>
      </div>
    );
  }
  if (!current || match.projection.isError) {
    return (
      <MatchGate
        title="Match unavailable"
        description={
          match.projection.error instanceof Error
            ? match.projection.error.message
            : 'The match could not be loaded.'
        }
      />
    );
  }
  if (current.status === 'waiting') {
    return (
      <div className="page page--combat-match">
        <CombatUnavailablePanel
          title="Waiting for a second participant"
          statusLabel="Lobby open"
          description="Gameplay begins when another signed-in player joins."
          actions={[
            {
              label: current.scope === 'daily' ? 'Open Daily' : 'Open Practice',
              onPress: () =>
                navigate(current.scope === 'daily' ? '/combat/daily' : '/combat/practice'),
              tone: 'primary',
            },
          ]}
        />
      </div>
    );
  }

  const terminal = current.status === 'completed' || current.status === 'cancelled';
  const activeSeat =
    current.currentTurn === 'player-one'
      ? 'left'
      : current.currentTurn === 'player-two'
        ? 'right'
        : null;
  const clock = clockLabel(match.clockRemainingMs);
  const terminalAction = current.moveCount === 0 ? 'cancel' : 'forfeit';
  const puzzleCount = current.mode === 'go' ? (current.goPuzzleCount ?? 5) : 1;

  return (
    <div className="page page--combat-match combat-preview-match">
      <CombatParticipantHeader
        participants={participants}
        activeSeat={terminal ? null : activeSeat}
        statusLabel={
          current.status === 'holding'
            ? 'Evidence hold'
            : terminal
              ? 'Game complete'
              : match.canEdit
                ? 'Your turn'
                : 'Other participant’s turn'
        }
        statusTone={match.canEdit ? 'green' : current.status === 'holding' ? 'ice' : 'muted'}
        {...(clock
          ? {
              clock: {
                value: clock,
                label: 'Active participant clock',
                urgent: match.clockRemainingMs !== null && match.clockRemainingMs <= 10_000,
              },
            }
          : {})}
      />
      <CombatSharedActorBoard
        length={current.wordLength}
        rows={board.rows}
        actorRows={board.actors}
        participants={participants}
        contextLabel={`${current.ranked ? 'Ranked Practice' : 'Unranked Daily'} · ${current.mode.toUpperCase()} · ${current.wordLength} letters · ${current.difficulty} · puzzle ${current.currentPuzzleIndex + 1} of ${puzzleCount}`}
        message={match.message}
        compact={current.wordLength > 10}
        {...(board.activeRow === undefined ? {} : { activeRow: board.activeRow })}
        keyboard={{
          evidence: match.evidence,
          pressedKeys,
          disabled: !match.canEdit,
          onCommand: match.onCommand,
        }}
      />
      <p className="privacy-band">Moves save automatically. Only the two players can play.</p>
      {terminal ? (
        <ButtonLink tone="primary" to={`/combat/match/${matchId}/result`}>
          View results
        </ButtonLink>
      ) : (
        <>
          <Button tone="danger" onClick={() => setConfirmTerminal(true)}>
            {terminalAction === 'cancel' ? 'Cancel match' : 'Forfeit match'}
          </Button>
          {confirmTerminal ? (
            <div className="confirmation-bar" role="alertdialog" aria-label="Confirm match exit">
              <p>
                {terminalAction === 'cancel'
                  ? 'No accepted moves exist. Cancellation creates no winner or rating result.'
                  : 'Play has started. Forfeit gives the other player the win.'}
              </p>
              <Button
                tone="danger"
                disabled={match.saving}
                onClick={() => {
                  void match.saveCommand({ command: terminalAction });
                  setConfirmTerminal(false);
                }}
              >
                Confirm {terminalAction}
              </Button>
              <Button onClick={() => setConfirmTerminal(false)}>Keep playing</Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function PracticeCombatMatchView({ matchId }: { matchId: string }) {
  const navigate = useNavigate();
  const { user, status } = useAuth();
  const match = usePracticeCombatMatch(matchId);
  const [confirmTerminal, setConfirmTerminal] = useState(false);
  const state = match.state;
  const projection = match.projection.data;
  const participants = participantPair(match.participantIdentities.data);
  const pressedKeys = useKeyboardInput({
    disabled: !match.canEdit,
    onCommand: match.onCommand,
  });

  const board = useMemo(() => {
    if (!state)
      return { rows: [] as Tile[][], actors: [] as CombatActorRow[], activeRow: undefined };
    const prior = practiceCombatPriorEvidence(state);
    const currentMoves = state.moves.filter(
      (move) => move.puzzleIndex === state.currentPuzzleIndex,
    );
    const rows: Tile[][] = prior.map((row) => tilesFromScored(row.tiles));
    const actors: CombatActorRow[] = prior.map((row) => ({
      participantKey: null,
      shortLabel: `P${row.sourcePuzzleIndex + 1}`,
      kind: 'evidence',
    }));
    for (const move of currentMoves) {
      rows.push(tilesFromScored(move.tiles));
      const participant = move.actor === 'left' ? participants[0] : participants[1];
      actors.push({
        participantKey: participant.key,
        shortLabel: participant.shortLabel,
        kind: 'participant',
      });
    }
    let activeRow: number | undefined;
    if (match.canEdit) {
      activeRow = rows.length;
      rows.push(emptyRow(state.config.wordLength, match.draft));
      const participant = match.viewerActor === 'left' ? participants[0] : participants[1];
      actors.push({
        participantKey: participant.key,
        shortLabel: participant.shortLabel,
        kind: 'participant',
      });
    }
    const puzzleBudget = practiceCombatAttemptBudget(
      state.config.mode,
      state.currentPuzzleIndex,
      state.config.puzzleCount,
    );
    const targetRows = sharedCombatRowCapacity({
      seededRows: prior.length,
      acceptedMoves: currentMoves.length,
      hasActiveDraft: match.canEdit,
      attemptBudget: puzzleBudget,
    });
    while (rows.length < targetRows) {
      rows.push(emptyRow(state.config.wordLength));
      actors.push({ participantKey: null, shortLabel: '', kind: 'participant' });
    }
    return { rows, actors, activeRow };
  }, [match.canEdit, match.draft, match.viewerActor, participants, state]);

  if (status !== 'authenticated' || !user) {
    return (
      <div className="page page--combat-match">
        <CombatUnavailablePanel
          title="Sign in to open this participant match"
          statusLabel="Participant-only"
          description="Sign in with a player account, then return to this match."
          actions={[
            {
              label: 'Open Auth',
              onPress: () => navigate('/auth'),
              tone: 'primary',
            },
          ]}
        />
      </div>
    );
  }

  if (match.projection.isPending) {
    return (
      <div className="route-loading" role="status" aria-live="polite" aria-busy="true">
        <span aria-hidden="true" />
        <p>Loading match…</p>
      </div>
    );
  }

  if (match.projection.isError || projection === null || projection === undefined) {
    return (
      <div className="page page--combat-match">
        <CombatUnavailablePanel
          title="This match cannot be opened safely"
          statusLabel="Unavailable"
          statusTone="muted"
          description={
            match.projection.error instanceof Error
              ? match.projection.error.message
              : 'The game is missing or cannot be opened by this version of Amordle.'
          }
          actions={[
            { label: 'Back to COMBAT', onPress: () => navigate('/combat'), tone: 'primary' },
          ]}
        />
      </div>
    );
  }

  if (projection.kind === 'waiting') {
    return (
      <div className="page page--combat-match">
        <CombatUnavailablePanel
          title="Waiting for a second participant"
          statusLabel="Lobby open"
          description="Gameplay begins when another signed-in player joins."
          actions={[
            {
              label: projection.scope === 'daily' ? 'Open Daily' : 'Open Lobby',
              onPress: () =>
                navigate(projection.scope === 'daily' ? '/combat/daily' : '/combat/lobby'),
              tone: 'primary',
            },
          ]}
        />
      </div>
    );
  }

  if (projection.kind === 'cancelled-waiting' || !state) {
    return (
      <div className="page page--combat-match">
        <CombatUnavailablePanel
          title="Lobby cancelled"
          statusLabel="No result"
          statusTone="muted"
          description="This lobby ended before a second participant joined."
          actions={[
            { label: 'Back to COMBAT', onPress: () => navigate('/combat'), tone: 'primary' },
          ]}
        />
      </div>
    );
  }

  const activeSeat =
    state.activeActor === 'left' ? 'left' : state.activeActor === 'right' ? 'right' : null;
  const clock = formatClock(state.deadlineAt);
  const terminal = state.status === 'terminal' || state.status === 'cancelled';
  const viewerActor = match.viewerActor;
  const terminalAction = state.moves.length === 0 ? 'cancel' : 'forfeit';

  return (
    <div className="page page--combat-match combat-preview-match">
      <CombatParticipantHeader
        participants={participants}
        activeSeat={activeSeat}
        statusLabel={
          state.status === 'holding'
            ? 'Evidence hold'
            : terminal
              ? 'Complete'
              : match.canEdit
                ? 'Your turn'
                : 'Other participant’s turn'
        }
        statusTone={match.canEdit ? 'green' : state.status === 'holding' ? 'ice' : 'muted'}
        {...(clock
          ? {
              clock: {
                value: clock,
                label: 'Active turn clock',
                urgent: clock === '0:00',
              },
            }
          : {})}
      />
      <CombatSharedActorBoard
        length={state.config.wordLength}
        rows={board.rows}
        actorRows={board.actors}
        participants={participants}
        contextLabel={`${projection.scope === 'daily' ? 'Unranked Daily' : projection.ranked ? 'Ranked Practice' : 'Practice'} · ${state.config.mode.toUpperCase()} · ${state.config.wordLength} letters · ${state.config.difficulty} · puzzle ${state.currentPuzzleIndex + 1} of ${state.config.puzzleCount}`}
        message={match.message}
        compact={state.config.wordLength > 10}
        {...(board.activeRow === undefined ? {} : { activeRow: board.activeRow })}
        keyboard={{
          evidence: match.evidence,
          pressedKeys,
          disabled: !match.canEdit,
          onCommand: match.onCommand,
        }}
      />
      <p className="privacy-band">
        {projection.scope === 'daily'
          ? `Unranked Daily · ${projection.dailyDateKey} UTC · ratings unchanged`
          : projection.ranked
            ? 'Ranked Practice · rating updates after the game'
            : 'Unranked Practice · ratings unchanged'}
      </p>
      {terminal ? (
        <ButtonLink tone="primary" to={`/combat/match/${matchId}/result`}>
          View results
        </ButtonLink>
      ) : null}
      {!terminal && viewerActor ? (
        <>
          <Button tone="danger" onClick={() => setConfirmTerminal(true)}>
            {terminalAction === 'cancel' ? 'Cancel match' : 'Forfeit match'}
          </Button>
          {confirmTerminal ? (
            <div className="confirmation-bar" role="alertdialog" aria-label="Confirm match exit">
              <p>
                {terminalAction === 'cancel'
                  ? 'No accepted moves exist. Cancellation creates no winner or rating result.'
                  : 'Play has started. Forfeit gives the other participant the win; rating remains unchanged.'}
              </p>
              <Button
                tone="danger"
                disabled={match.saving}
                onClick={() => {
                  void match.saveAction({
                    type: terminalAction,
                    actor: viewerActor,
                    actionId: crypto.randomUUID(),
                    expectedRevision: state.revision,
                    expectedMoveCount: state.moves.length,
                    now: new Date(
                      Math.max(Date.now(), Date.parse(state.updatedAt) + 1),
                    ).toISOString(),
                  });
                  setConfirmTerminal(false);
                }}
              >
                Confirm {terminalAction}
              </Button>
              <Button onClick={() => setConfirmTerminal(false)}>Keep playing</Button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function RankedDailyMatchView({ matchId }: { matchId: string }) {
  const match = useRankedDailyCombatMatch(matchId);
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const current = match.current;
  const participants = participantPair(match.identities.data);
  const pressedKeys = useKeyboardInput({
    disabled: !match.canEdit,
    onCommand: match.onCommand,
  });
  if (match.projection.isPending) {
    return (
      <div className="route-loading" role="status" aria-live="polite" aria-busy="true">
        <p>Loading Ranked Daily…</p>
      </div>
    );
  }
  if (!current || match.projection.isError) {
    return (
      <MatchGate
        title="Ranked Daily unavailable"
        description={
          match.projection.error instanceof Error
            ? match.projection.error.message
            : 'The match could not be loaded.'
        }
      />
    );
  }
  const currentPuzzleIndex = current.moves.reduce(
    (maximum, move) => Math.max(maximum, move.puzzleIndex),
    0,
  );
  const currentMoves = current.moves.filter((move) => move.puzzleIndex === currentPuzzleIndex);
  const rows: Tile[][] = currentMoves.map((move) => tilesFromScored(move.tiles));
  const actors: CombatActorRow[] = currentMoves.map((move) => {
    const participant = move.playerId === 'player-one' ? participants[0] : participants[1];
    return {
      participantKey: participant.key,
      shortLabel: participant.shortLabel,
      kind: 'participant',
    };
  });
  let activeRow: number | undefined;
  if (match.canEdit) {
    activeRow = rows.length;
    rows.push(emptyRow(5, match.draft));
    const participant = current.viewerSeat === 'player-one' ? participants[0] : participants[1];
    actors.push({
      participantKey: participant.key,
      shortLabel: participant.shortLabel,
      kind: 'participant',
    });
  }
  const attemptRows = current.mode === 'go' ? Math.max(2, 6 - currentPuzzleIndex) : 6;
  const targetRows = sharedCombatRowCapacity({
    seededRows: 0,
    acceptedMoves: currentMoves.length,
    hasActiveDraft: match.canEdit,
    attemptBudget: attemptRows,
  });
  while (rows.length < targetRows) {
    rows.push(emptyRow(5));
    actors.push({ participantKey: null, shortLabel: '', kind: 'participant' });
  }
  const terminal = ['won', 'lost', 'expired', 'cancelled'].includes(current.status);
  const activeSeat = current.currentTurn === 'player-one' ? 'left' : 'right';
  return (
    <div className="page page--combat-match combat-preview-match">
      <CombatParticipantHeader
        participants={participants}
        activeSeat={terminal ? null : activeSeat}
        statusLabel={
          terminal ? 'Complete' : match.canEdit ? 'Your turn' : 'Other participant’s turn'
        }
        statusTone={match.canEdit ? 'green' : terminal ? 'muted' : 'ice'}
      />
      <CombatSharedActorBoard
        length={5}
        rows={rows}
        actorRows={actors}
        participants={participants}
        contextLabel={`Ranked Daily · ${current.mode.toUpperCase()} · 5 letters · Expert · ${current.dailyDateKey} UTC`}
        message={match.message}
        {...(activeRow === undefined ? {} : { activeRow })}
        keyboard={{
          evidence: match.evidence,
          pressedKeys,
          disabled: !match.canEdit,
          onCommand: match.onCommand,
        }}
      />
      <p className="privacy-band">Ranked Daily · rating updates after the game.</p>
      {terminal ? (
        <ButtonLink tone="primary" to={`/combat/match/${matchId}/result`}>
          View results
        </ButtonLink>
      ) : (
        <>
          <Button tone="danger" onClick={() => setConfirmForfeit(true)}>
            {current.moves.length === 0 ? 'Cancel match' : 'Forfeit match'}
          </Button>
          {confirmForfeit ? (
            <div
              className="confirmation-bar"
              role="alertdialog"
              aria-label="Confirm Ranked Daily exit"
            >
              <p>
                {current.moves.length === 0
                  ? 'Cancelling before the first move creates no result.'
                  : 'Forfeit gives the other player the win.'}
              </p>
              <Button
                tone="danger"
                disabled={match.saving}
                onClick={() => {
                  void match.forfeit();
                  setConfirmForfeit(false);
                }}
              >
                Confirm
              </Button>
              <Button onClick={() => setConfirmForfeit(false)}>Keep playing</Button>
            </div>
          ) : null}
        </>
      )}
      <ButtonLink to="/combat/daily">Back to Daily</ButtonLink>
    </div>
  );
}

export function CombatResultPage() {
  const { matchId = '' } = useParams();
  const { client, user, status } = useAuth();
  const repository = useMemo(() => (client ? new CombatPreviewRepository(client) : null), [client]);
  const authoritativeRepository = useMemo(
    () => (client ? new AuthoritativeCombatRepository(client) : null),
    [client],
  );
  const authoritative = useQuery({
    queryKey: ['combat', 'result-kind', matchId, 'authoritative-v2', user?.id],
    enabled: Boolean(authoritativeRepository && user),
    queryFn: () => authoritativeRepository!.getGame(matchId),
    staleTime: 5_000,
    retry: false,
  });
  const summary = useQuery({
    queryKey: ['combat', 'match-kind', matchId, user?.id],
    enabled: Boolean(repository && user),
    queryFn: () => repository!.loadLegacyReadOnlySummary(matchId),
    staleTime: 30_000,
  });
  if (status !== 'authenticated' || !user) {
    return (
      <MatchGate
        title="Sign in to open this participant result"
        description="Practice COMBAT results remain participant-only."
      />
    );
  }
  if (authoritative.isPending && summary.isPending) {
    return (
      <div className="route-loading" role="status" aria-live="polite">
        <p>Loading results…</p>
      </div>
    );
  }
  if (authoritative.data) {
    return <AuthoritativeCombatResultView matchId={matchId} />;
  }
  if (summary.data?.scope === 'daily' && summary.data.ranked) {
    return <RankedDailyResultView matchId={matchId} />;
  }
  return <PracticeCombatResultView matchId={matchId} />;
}

function AuthoritativeCombatResultView({ matchId }: { matchId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { client, user } = useAuth();
  const accountRepository = useMemo(
    () => (client ? new AccountRepository(client) : null),
    [client],
  );
  const match = useAuthoritativeCombatMatch(matchId);
  const current = match.current;
  const participants = participantPair(current?.players);
  const historyInFlight = useRef(false);
  const [historyStatus, setHistoryStatus] = useState<'idle' | 'saved' | 'pending'>('idle');

  useEffect(() => {
    if (
      !accountRepository ||
      !user ||
      !current ||
      current.status !== 'completed' ||
      current.outcome.reason === undefined ||
      current.outcome.reason === 'cancelled' ||
      !current.endedAt ||
      historyInFlight.current ||
      historyStatus !== 'idle'
    ) {
      return;
    }
    const viewerSeat = current.viewerSeat;
    const opponentSeat = viewerSeat === 'player-one' ? 'player-two' : 'player-one';
    const opponent = current.players.find((player) => player.seat === opponentSeat);
    const winner = current.outcome.winnerSeat;
    const result = winner === undefined ? 'Draw' : winner === viewerSeat ? 'Won' : 'Lost';
    historyInFlight.current = true;
    void accountRepository
      .saveHistory(
        createCombatHistoryRow({
          gameId: current.id,
          userId: user.id,
          scope: current.scope,
          mode: current.mode,
          ranked: current.ranked,
          sourceKind: current.sourceKind,
          result,
          terminalReason: current.outcome.reason,
          wordLength: current.wordLength,
          difficulty: normalizedDifficulty(current.difficulty),
          hardMode: current.hardMode,
          puzzleCount: current.mode === 'go' ? (current.goPuzzleCount ?? 5) : 1,
          playerPoints: current.playerState[viewerSeat].points,
          opponentPoints: current.playerState[opponentSeat].points,
          completedAt: current.endedAt,
          opponent: {
            publicProfileId: opponent?.publicProfileId ?? null,
            displayName: opponent?.displayName ?? 'Private player',
          },
        }),
      )
      .then(async () => {
        setHistoryStatus('saved');
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['account-history', user.id] }),
          queryClient.invalidateQueries({ queryKey: ['account-stats', user.id] }),
        ]);
      })
      .catch(() => setHistoryStatus('pending'))
      .finally(() => {
        historyInFlight.current = false;
      });
  }, [accountRepository, current, historyStatus, queryClient, user]);
  if (match.projection.isPending) {
    return (
      <div className="route-loading" role="status" aria-live="polite">
        <p>Loading results…</p>
      </div>
    );
  }
  if (
    !current ||
    (current.status !== 'completed' && current.status !== 'cancelled') ||
    match.projection.isError
  ) {
    return (
      <MatchGate
        title="Results unavailable"
        description="This game does not have a completed result yet."
      />
    );
  }
  const cancelled = current.status === 'cancelled';
  const winner =
    current.outcome.winnerSeat === 'player-one'
      ? participants[0].displayName
      : current.outcome.winnerSeat === 'player-two'
        ? participants[1].displayName
        : null;
  const reason =
    current.outcome.reason === 'forfeit'
      ? 'Forfeit'
      : current.outcome.reason === 'timeout'
        ? 'Timeout'
        : current.outcome.reason === 'solve'
          ? 'OG solve'
          : current.outcome.reason === 'points'
            ? 'Points'
            : current.outcome.reason === 'draw'
              ? 'Draw'
              : 'Cancellation';
  const lane = combatLaneLabel({
    scope: current.scope,
    mode: current.mode,
    ranked: current.ranked,
    sourceKind: current.sourceKind,
  });
  return (
    <div className="page page--combat-result">
      <CombatTerminalResultPanel
        title={cancelled ? `${lane} cancelled` : winner ? `${winner} won` : `${lane} drawn`}
        summary={
          cancelled
            ? 'The game ended before play began. No result or rating change was recorded.'
            : current.ranked && match.settlement
              ? `${lane} complete. Rating ${match.settlement.oldRating} → ${match.settlement.newRating}.`
              : current.ranked
                ? `${lane} complete by ${reason.toLocaleLowerCase('en-US')}. Rating update pending.`
                : `${lane} complete by ${reason.toLocaleLowerCase('en-US')}.`
        }
        statusLabel={cancelled ? 'No result' : reason}
        statusTone={cancelled ? 'muted' : 'green'}
        participants={[
          {
            ...participants[0],
            score: current.playerState['player-one'].points,
            outcome: cancelled
              ? 'neutral'
              : current.outcome.winnerSeat === undefined
                ? 'draw'
                : current.outcome.winnerSeat === 'player-one'
                  ? 'winner'
                  : 'loser',
            ...(current.viewerSeat === 'player-one' && match.settlement
              ? {
                  ratingChange: `${match.settlement.ratingDelta >= 0 ? '+' : ''}${match.settlement.ratingDelta}`,
                }
              : {}),
          },
          {
            ...participants[1],
            score: current.playerState['player-two'].points,
            outcome: cancelled
              ? 'neutral'
              : current.outcome.winnerSeat === undefined
                ? 'draw'
                : current.outcome.winnerSeat === 'player-two'
                  ? 'winner'
                  : 'loser',
            ...(current.viewerSeat === 'player-two' && match.settlement
              ? {
                  ratingChange: `${match.settlement.ratingDelta >= 0 ? '+' : ''}${match.settlement.ratingDelta}`,
                }
              : {}),
          },
        ]}
        evidence={{
          label: current.mode === 'go' ? 'Answer chain' : 'Answer',
          value: cancelled
            ? 'Not revealed'
            : (current.revealedAnswers ?? []).map((answer) => answer.toUpperCase()).join(' · '),
        }}
        actions={[
          {
            label: current.scope === 'daily' ? 'Daily COMBAT' : 'Practice COMBAT',
            onPress: () =>
              navigate(current.scope === 'daily' ? '/combat/daily' : '/combat/practice'),
            tone: 'primary',
          },
          { label: 'View History', onPress: () => navigate('/history') },
          { label: 'Active games', onPress: () => navigate('/combat/active') },
        ]}
      />
      {!cancelled ? <ResultDefinitions answers={current.revealedAnswers ?? []} /> : null}
      {historyStatus === 'pending' ? (
        <p className="game-message" role="status">
          Result saved. History sync is pending and will retry when this page is reopened.
        </p>
      ) : null}
    </div>
  );
}

function PracticeCombatResultView({ matchId }: { matchId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { client, user } = useAuth();
  const repository = useMemo(() => (client ? new CombatPreviewRepository(client) : null), [client]);
  const accountRepository = useMemo(
    () => (client ? new AccountRepository(client) : null),
    [client],
  );
  const [rematchMessage, setRematchMessage] = useState('');
  const historyInFlight = useRef(false);
  const [historyStatus, setHistoryStatus] = useState<'idle' | 'saved' | 'pending'>('idle');
  const match = usePracticeCombatMatch(matchId);
  const state = match.state;
  const participants = participantPair(match.participantIdentities.data);

  useEffect(() => {
    const projection = match.projection.data;
    if (
      !accountRepository ||
      !user ||
      !state ||
      !projection ||
      state.status !== 'terminal' ||
      !state.outcome ||
      state.outcome.kind === 'cancelled' ||
      !projection.endedAt ||
      historyInFlight.current ||
      historyStatus !== 'idle'
    ) {
      return;
    }
    const viewerActor = projection.viewerSeat === 'player-two' ? 'right' : 'left';
    const opponentIndex = viewerActor === 'left' ? 1 : 0;
    const result =
      state.outcome.kind === 'draw'
        ? 'Draw'
        : state.outcome.winnerId === viewerActor
          ? 'Won'
          : 'Lost';
    const terminalReason =
      state.outcome.kind === 'draw'
        ? 'draw'
        : state.outcome.reason === 'og_solve'
          ? 'solve'
          : state.outcome.reason;
    historyInFlight.current = true;
    void accountRepository
      .saveHistory(
        createCombatHistoryRow({
          gameId: state.id,
          userId: user.id,
          scope: projection.scope,
          mode: state.config.mode,
          ranked: projection.ranked,
          sourceKind: projection.sourceKind,
          result,
          terminalReason,
          wordLength: state.config.wordLength,
          difficulty: state.config.difficulty,
          hardMode: state.config.hardMode,
          puzzleCount: state.config.puzzleCount,
          playerPoints: practiceCombatPlayerPoints(state, viewerActor),
          opponentPoints: practiceCombatPlayerPoints(
            state,
            viewerActor === 'left' ? 'right' : 'left',
          ),
          completedAt: projection.endedAt,
          opponent: {
            publicProfileId: participants[opponentIndex].publicProfileId ?? null,
            displayName: participants[opponentIndex].displayName,
          },
        }),
      )
      .then(async () => {
        setHistoryStatus('saved');
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['account-history', user.id] }),
          queryClient.invalidateQueries({ queryKey: ['account-stats', user.id] }),
        ]);
      })
      .catch(() => setHistoryStatus('pending'))
      .finally(() => {
        historyInFlight.current = false;
      });
  }, [
    accountRepository,
    historyStatus,
    match.projection.data,
    participants,
    queryClient,
    state,
    user,
  ]);

  if (match.projection.isPending) {
    return (
      <div className="route-loading" role="status" aria-live="polite">
        <p>Loading participant result…</p>
      </div>
    );
  }
  if (!state || (state.status !== 'terminal' && state.status !== 'cancelled')) {
    return (
      <div className="page page--combat-result">
        <CombatUnavailablePanel
          title="Results unavailable"
          statusLabel="Not complete"
          description="This game does not have a completed result yet."
          actions={[
            {
              label: 'Return to match',
              onPress: () => navigate(`/combat/match/${matchId}`),
              tone: 'primary',
            },
          ]}
        />
      </div>
    );
  }
  const leftPoints = practiceCombatPlayerPoints(state, 'left');
  const rightPoints = practiceCombatPlayerPoints(state, 'right');
  const cancelled = state.outcome?.kind === 'cancelled';
  const winner =
    state.outcome?.kind === 'win'
      ? state.outcome.winnerId === 'left'
        ? participants[0].displayName
        : participants[1].displayName
      : null;
  const title = cancelled
    ? 'Match cancelled'
    : state.outcome?.kind === 'draw'
      ? 'Match drawn'
      : `${winner ?? 'Participant'} won`;
  const reason =
    state.outcome?.reason === 'forfeit'
      ? 'Forfeit'
      : state.outcome?.reason === 'timeout'
        ? 'Timeout'
        : state.outcome?.reason === 'og_solve'
          ? 'OG solve'
          : state.outcome?.reason === 'points'
            ? 'Points'
            : 'Cancellation';
  return (
    <div className="page page--combat-result">
      <CombatTerminalResultPanel
        title={title}
        summary={
          cancelled
            ? 'The game ended before the first accepted move. No winner, answer reveal, or rating result was created.'
            : match.projection.data?.scope === 'daily'
              ? `${reason} decided this Unranked Daily game. Ratings were unchanged.`
              : match.projection.data?.ranked
                ? `${reason} decided this Ranked Practice game. The rating update ${match.settlement ? 'is complete' : 'is pending'}.`
                : `${reason} decided this Unranked Practice game. Ratings were unchanged.`
        }
        statusLabel={cancelled ? 'No result' : reason}
        statusTone={cancelled ? 'muted' : 'green'}
        participants={[
          {
            ...participants[0],
            score: leftPoints,
            outcome: cancelled
              ? 'neutral'
              : state.outcome?.kind === 'draw'
                ? 'draw'
                : state.outcome?.kind === 'win' && state.outcome.winnerId === 'left'
                  ? 'winner'
                  : 'loser',
            ...(match.projection.data?.viewerSeat === 'player-one' && match.settlement
              ? {
                  ratingChange: `${match.settlement.ratingDelta >= 0 ? '+' : ''}${match.settlement.ratingDelta}`,
                }
              : {}),
          },
          {
            ...participants[1],
            score: rightPoints,
            outcome: cancelled
              ? 'neutral'
              : state.outcome?.kind === 'draw'
                ? 'draw'
                : state.outcome?.kind === 'win' && state.outcome.winnerId === 'right'
                  ? 'winner'
                  : 'loser',
            ...(match.projection.data?.viewerSeat === 'player-two' && match.settlement
              ? {
                  ratingChange: `${match.settlement.ratingDelta >= 0 ? '+' : ''}${match.settlement.ratingDelta}`,
                }
              : {}),
          },
        ]}
        evidence={
          cancelled
            ? { label: 'Answer', value: 'Not selected or revealed' }
            : {
                label: state.config.mode === 'go' ? 'Answer chain' : 'Answer',
                value: state.answers.map((answer) => answer.toUpperCase()).join(' · '),
              }
        }
        actions={[
          ...(!cancelled && repository && user && match.projection.data?.scope === 'practice'
            ? [
                {
                  label: 'Request rematch',
                  onPress: () => {
                    void repository
                      .requestRematch(matchId)
                      .then(() => {
                        setRematchMessage('Rematch requested. Track it in the COMBAT lobby.');
                      })
                      .catch((error: unknown) =>
                        setRematchMessage(
                          error instanceof Error ? error.message : 'Rematch request failed.',
                        ),
                      );
                  },
                  tone: 'primary' as const,
                },
              ]
            : []),
          { label: 'COMBAT', onPress: () => navigate('/combat'), tone: 'primary' },
          { label: 'View History', onPress: () => navigate('/history') },
          { label: 'Active games', onPress: () => navigate('/combat/active') },
        ]}
      />
      {!cancelled ? <ResultDefinitions answers={state.answers} /> : null}
      {historyStatus === 'pending' ? (
        <p className="game-message" role="status">
          Result saved. History sync will retry when this page is reopened.
        </p>
      ) : null}
      {rematchMessage ? (
        <p className="game-message" role="status" aria-live="polite">
          {rematchMessage}
        </p>
      ) : null}
    </div>
  );
}

function RankedDailyResultView({ matchId }: { matchId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { client, user } = useAuth();
  const accountRepository = useMemo(
    () => (client ? new AccountRepository(client) : null),
    [client],
  );
  const match = useRankedDailyCombatMatch(matchId);
  const current = match.current;
  const participants = participantPair(match.identities.data);
  const playerOnePoints = current
    ? projectedCombatPoints({
        mode: current.mode,
        puzzleCount: current.mode === 'go' ? (current.goPuzzleCount ?? 5) : 1,
        hardMode: current.hardMode,
        moves: current.moves,
        seat: 'player-one',
      })
    : 0;
  const playerTwoPoints = current
    ? projectedCombatPoints({
        mode: current.mode,
        puzzleCount: current.mode === 'go' ? (current.goPuzzleCount ?? 5) : 1,
        hardMode: current.hardMode,
        moves: current.moves,
        seat: 'player-two',
      })
    : 0;
  const historyInFlight = useRef(false);
  const [historyStatus, setHistoryStatus] = useState<'idle' | 'saved' | 'pending'>('idle');

  useEffect(() => {
    if (
      !accountRepository ||
      !user ||
      !current ||
      !['won', 'lost', 'expired'].includes(current.status) ||
      !current.endedAt ||
      historyInFlight.current ||
      historyStatus !== 'idle'
    ) {
      return;
    }
    const viewerSeat = current.viewerSeat ?? 'player-one';
    const opponentSeat = viewerSeat === 'player-one' ? 'player-two' : 'player-one';
    const opponentIndex = opponentSeat === 'player-one' ? 0 : 1;
    const result =
      current.winnerId === null ? 'Draw' : current.winnerId === viewerSeat ? 'Won' : 'Lost';
    historyInFlight.current = true;
    void accountRepository
      .saveHistory(
        createCombatHistoryRow({
          gameId: current.id,
          userId: user.id,
          scope: 'daily',
          mode: current.mode,
          ranked: true,
          sourceKind: 'ranked-queue',
          result,
          terminalReason:
            current.status === 'expired'
              ? 'timeout'
              : current.mode === 'og' &&
                  current.moves.some((move) => move.tiles.every((tile) => tile.state === 'correct'))
                ? 'solve'
                : current.winnerId === null
                  ? 'draw'
                  : 'points',
          wordLength: current.wordLength,
          difficulty: normalizedDifficulty(current.difficulty),
          hardMode: current.hardMode,
          puzzleCount: current.mode === 'go' ? (current.goPuzzleCount ?? 5) : 1,
          playerPoints: viewerSeat === 'player-one' ? playerOnePoints : playerTwoPoints,
          opponentPoints: opponentSeat === 'player-one' ? playerOnePoints : playerTwoPoints,
          completedAt: current.endedAt,
          opponent: {
            publicProfileId: participants[opponentIndex].publicProfileId ?? null,
            displayName: participants[opponentIndex].displayName,
          },
        }),
      )
      .then(async () => {
        setHistoryStatus('saved');
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['account-history', user.id] }),
          queryClient.invalidateQueries({ queryKey: ['account-stats', user.id] }),
        ]);
      })
      .catch(() => setHistoryStatus('pending'))
      .finally(() => {
        historyInFlight.current = false;
      });
  }, [
    accountRepository,
    current,
    historyStatus,
    participants,
    playerOnePoints,
    playerTwoPoints,
    queryClient,
    user,
  ]);
  if (match.projection.isPending) {
    return (
      <div className="route-loading" role="status" aria-live="polite">
        <p>Loading Ranked Daily results…</p>
      </div>
    );
  }
  if (!current || !['won', 'lost', 'expired', 'cancelled'].includes(current.status)) {
    return (
      <MatchGate
        title="Results unavailable"
        description="This Ranked Daily game does not have a completed result yet."
      />
    );
  }
  const cancelled = current.status === 'cancelled';
  const winner =
    current.winnerId === 'player-one'
      ? participants[0].displayName
      : current.winnerId === 'player-two'
        ? participants[1].displayName
        : null;
  return (
    <div className="page page--combat-result">
      <CombatTerminalResultPanel
        title={
          cancelled ? 'Ranked Daily cancelled' : winner ? `${winner} won` : 'Ranked Daily draw'
        }
        summary={
          cancelled
            ? 'Cancellation occurred before the first accepted move. No rating result was created.'
            : match.settlement
              ? `Rating updated: ${match.settlement.oldRating} → ${match.settlement.newRating}.`
              : 'The game is complete. The rating update is pending.'
        }
        statusLabel={cancelled ? 'No result' : 'Complete'}
        statusTone={cancelled ? 'muted' : 'green'}
        participants={[
          {
            ...participants[0],
            score: playerOnePoints,
            outcome: cancelled
              ? 'neutral'
              : current.winnerId === null
                ? 'draw'
                : current.winnerId === 'player-one'
                  ? 'winner'
                  : 'loser',
            ...(current.viewerSeat === 'player-one' && match.settlement
              ? {
                  ratingChange: `${match.settlement.ratingDelta >= 0 ? '+' : ''}${match.settlement.ratingDelta}`,
                }
              : {}),
          },
          {
            ...participants[1],
            score: playerTwoPoints,
            outcome: cancelled
              ? 'neutral'
              : current.winnerId === null
                ? 'draw'
                : current.winnerId === 'player-two'
                  ? 'winner'
                  : 'loser',
            ...(current.viewerSeat === 'player-two' && match.settlement
              ? {
                  ratingChange: `${match.settlement.ratingDelta >= 0 ? '+' : ''}${match.settlement.ratingDelta}`,
                }
              : {}),
          },
        ]}
        evidence={{
          label: 'Answer',
          value: cancelled
            ? 'Not revealed'
            : 'Available when the completed result finishes loading',
        }}
        actions={[
          { label: 'Daily COMBAT', onPress: () => navigate('/combat/daily'), tone: 'primary' },
          { label: 'View History', onPress: () => navigate('/history') },
          { label: 'Active games', onPress: () => navigate('/combat/active') },
        ]}
      />
      {historyStatus === 'pending' ? (
        <p className="game-message" role="status">
          Result saved. History sync will retry when this page is reopened.
        </p>
      ) : null}
    </div>
  );
}

export function LiveMatchPage() {
  const { matchId = '' } = useParams();
  const navigate = useNavigate();
  const { client, status } = useAuth();
  const repository = useMemo(() => (client ? new CombatLiveRepository(client) : null), [client]);
  const live = useQuery({
    queryKey: ['combat', 'live', matchId, status === 'authenticated' ? 'authenticated' : 'public'],
    enabled: Boolean(repository && matchId),
    queryFn: () =>
      repository!.get({
        authenticated: status === 'authenticated',
        gameId: matchId,
      }),
    refetchInterval: (query) => (query.state.data?.status === 'playing' ? 5_000 : 30_000),
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const participants = participantPair(
    live.data?.players.map((player) => ({
      seat: player.seat,
      displayName: player.profile?.displayName ?? player.label,
    })),
  );
  const rows: Tile[][] = live.data?.moves.map((move) => tilesFromScored(move.tiles)) ?? [];
  const actors: CombatActorRow[] =
    live.data?.moves.map((move) => {
      const participant = move.seat === 'player-one' ? participants[0] : participants[1];
      return {
        participantKey: participant.key,
        shortLabel: participant.shortLabel,
        kind: 'participant',
      };
    }) ?? [];
  const targetRows = sharedCombatRowCapacity({
    seededRows: 0,
    acceptedMoves: rows.length,
    hasActiveDraft: false,
    attemptBudget: 0,
  });
  while (rows.length < targetRows) {
    rows.push(emptyRow(live.data?.wordLength ?? 5));
    actors.push({ participantKey: null, shortLabel: '', kind: 'participant' });
  }

  if (!repository) {
    return (
      <MatchGate
        title="Live games unavailable"
        description="Live games cannot be loaded right now."
      />
    );
  }
  if (live.isPending) {
    return (
      <div className="route-loading" role="status" aria-live="polite" aria-busy="true">
        <span aria-hidden="true" />
        <p>Loading Live game…</p>
      </div>
    );
  }
  if (live.isError || !live.data) {
    return (
      <div className="page page--live-match">
        <CombatUnavailablePanel
          title="This match is not available for public spectation"
          statusLabel="Privacy denied"
          statusTone="ice"
          description={
            live.error instanceof Error
              ? live.error.message
              : 'The game is private, Daily, waiting, expired, or no longer eligible for Live.'
          }
          actions={[
            {
              label: 'Back to Live',
              onPress: () => navigate('/combat/live'),
              tone: 'primary',
            },
          ]}
        />
      </div>
    );
  }

  const game = live.data;
  const activeSeat =
    game.currentTurn === 'player-one' ? 'left' : game.currentTurn === 'player-two' ? 'right' : null;
  return (
    <div className="page page--combat-match combat-preview-match page--live-match">
      <CombatParticipantHeader
        participants={participants}
        activeSeat={game.status === 'playing' ? activeSeat : null}
        statusLabel={game.status === 'playing' ? 'Live · read-only' : game.outcome.label}
        statusTone={game.status === 'playing' ? 'green' : 'ice'}
      />
      <CombatSharedActorBoard
        length={game.wordLength}
        rows={rows}
        actorRows={actors}
        participants={participants}
        contextLabel={`Spectator · ${game.mode.toUpperCase()} · ${game.wordLength} letters · ${game.ranked ? 'ranked' : 'unranked'} · puzzle ${game.progress.currentPuzzleIndex + 1}${game.goPuzzleCount ? ` of ${game.goPuzzleCount}` : ''}`}
        message={`${game.progress.moveCount} ${game.progress.moveCount === 1 ? 'turn' : 'turns'} played · updated ${new Date(game.updatedAt).toLocaleTimeString()}`}
        compact={game.wordLength > 10}
        readOnly
      />
      <div className="spectator-controls">
        <ButtonLink tone="primary" to="/combat/live">
          Back to Live
        </ButtonLink>
        <Disclosure label="Spectator privacy" meta="Read-only">
          <p role="status">You can watch scored moves, but only the players can make a move.</p>
        </Disclosure>
      </div>
    </div>
  );
}
