import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
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

function participantPair(
  identities:
    | readonly {
        seat: 'player-one' | 'player-two';
        displayName: string;
      }[]
    | undefined,
): readonly [CombatPreviewParticipant, CombatPreviewParticipant] {
  const nameFor = (seat: 'player-one' | 'player-two') =>
    identities?.find((identity) => identity.seat === seat)?.displayName ??
    (seat === 'player-one' ? 'Player One' : 'Player Two');
  const leftName = nameFor('player-one');
  const rightName = nameFor('player-two');
  return [
    { key: 'player-one', displayName: leftName, shortLabel: shortLabel(leftName), tone: 'ember' },
    { key: 'player-two', displayName: rightName, shortLabel: shortLabel(rightName), tone: 'ice' },
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

function MatchGate({ title, description }: { title: string; description: string }) {
  const navigate = useNavigate();
  return (
    <div className="page page--combat-match">
      <CombatUnavailablePanel
        title={title}
        statusLabel="Unavailable"
        statusTone="muted"
        description={description}
        privacyNote="No fictional projection, raw JSON, or answer material is substituted."
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
        description="COMBAT match projections are participant-only."
      />
    );
  }
  if (authoritative.isPending && summary.isPending) {
    return (
      <div className="route-loading" role="status" aria-live="polite" aria-busy="true">
        <span aria-hidden="true" />
        <p>Resolving the safe match lane…</p>
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
        title="Legacy Ranked Practice is read-only"
        description="This pre-authority shell record is preserved as recovery material, but Amordle will not accept participant-authored ranked moves or settlement. Start a new Ranked Practice search for server-owned play."
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
        description="Authoritative COMBAT projections are participant-only."
      />
    );
  }
  if (match.projection.isPending) {
    return (
      <div className="route-loading" role="status" aria-live="polite" aria-busy="true">
        <span aria-hidden="true" />
        <p>Loading server-authoritative COMBAT state…</p>
      </div>
    );
  }
  if (!current || match.projection.isError) {
    return (
      <MatchGate
        title="Authoritative match unavailable"
        description={
          match.projection.error instanceof Error
            ? match.projection.error.message
            : 'No participant projection was returned.'
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
          description="The private answer authority is prepared, but gameplay cannot begin until a distinct signed-in participant joins."
          privacyNote="The waiting projection contains no answer, seed, email, or raw Auth identifier."
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
              ? 'Server terminal'
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
      <p className="privacy-band">
        Server-owned answers, validation, turns, GO evidence, clocks, outcomes
        {current.ranked ? ', and Elo settlement' : ''} · participant projection excludes active
        answer authority
      </p>
      {terminal ? (
        <ButtonLink tone="primary" to={`/combat/match/${matchId}/result`}>
          Review trusted result
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
                  : 'Play has started. Forfeit gives the other participant the authoritative win.'}
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
          description="COMBAT drafts and answer-bearing participant state are never exposed to guests."
          privacyNote="Use Auth, then return to the exact match link."
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
        <p>Loading durable COMBAT state…</p>
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
              : 'The record is missing or is a legacy shell game without a compatible participant projection.'
          }
          privacyNote="Amordle does not guess at legacy state, expose raw projection JSON, or mutate an incompatible match."
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
          description="The answerless lobby is durable. Gameplay begins only after another signed-in account joins."
          privacyNote="No answer or player-two session exists yet."
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
          privacyNote="No answer was selected and no rating, history result, or reward was created."
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
          ? `Unranked Daily · ${projection.dailyDateKey} UTC · participant-authored turns · no rating mutation · never public Live`
          : projection.ranked
            ? 'Ranked shell parity · FIFO matched · durable compare-and-swap turns · trusted terminal settlement'
            : 'Unranked Practice · durable compare-and-swap recovery · no rating mutation'}
      </p>
      {terminal ? (
        <ButtonLink tone="primary" to={`/combat/match/${matchId}/result`}>
          Review result
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
        <p>Loading server-authoritative Ranked Daily…</p>
      </div>
    );
  }
  if (!current || match.projection.isError) {
    return (
      <MatchGate
        title="Ranked Daily projection unavailable"
        description={
          match.projection.error instanceof Error
            ? match.projection.error.message
            : 'No participant projection was returned.'
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
          terminal ? 'Server terminal' : match.canEdit ? 'Your turn' : 'Other participant’s turn'
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
      <p className="privacy-band">
        Server-authoritative answers, validation, turns, outcome, and trusted settlement · never
        public Live
      </p>
      {terminal ? (
        <ButtonLink tone="primary" to={`/combat/match/${matchId}/result`}>
          Review trusted result
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
                  : 'Forfeit overrides tile points and is settled from private authority.'}
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
        <p>Loading participant result…</p>
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
  const match = useAuthoritativeCombatMatch(matchId);
  const current = match.current;
  const participants = participantPair(current?.players);
  if (match.projection.isPending) {
    return (
      <div className="route-loading" role="status" aria-live="polite">
        <p>Loading server-authoritative result…</p>
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
        title="Trusted result unavailable"
        description="The server-owned authority has not returned a participant terminal projection."
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
  return (
    <div className="page page--combat-result">
      <CombatTerminalResultPanel
        title={cancelled ? 'Match cancelled' : winner ? `${winner} won` : 'Match drawn'}
        summary={
          cancelled
            ? 'The match ended before an eligible result. No answer or rating result was created.'
            : current.ranked && match.settlement
              ? `Server reconstruction settled the rating: ${match.settlement.oldRating} → ${match.settlement.newRating}.`
              : current.ranked
                ? `${reason} is durable. Server-owned Elo settlement is reconciling.`
                : `${reason} determined this unranked Daily result without a rating mutation.`
        }
        statusLabel={cancelled ? 'No result' : reason}
        statusTone={cancelled ? 'muted' : 'green'}
        participants={[
          {
            ...participants[0],
            score: current.playerState['player-one'].points,
            ...(current.viewerSeat === 'player-one' && match.settlement
              ? {
                  ratingChange: `${match.settlement.ratingDelta >= 0 ? '+' : ''}${match.settlement.ratingDelta}`,
                }
              : {}),
          },
          {
            ...participants[1],
            score: current.playerState['player-two'].points,
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
          { label: 'Active games', onPress: () => navigate('/combat/active') },
        ]}
      />
    </div>
  );
}

function PracticeCombatResultView({ matchId }: { matchId: string }) {
  const navigate = useNavigate();
  const { client, user } = useAuth();
  const repository = useMemo(() => (client ? new CombatPreviewRepository(client) : null), [client]);
  const [rematchMessage, setRematchMessage] = useState('');
  const match = usePracticeCombatMatch(matchId);
  const state = match.state;
  const participants = participantPair(match.participantIdentities.data);

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
          title="Terminal result unavailable"
          statusLabel="Not complete"
          description="This route only renders a durable participant terminal state."
          privacyNote="No fictional score, answer, or settlement is substituted."
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
              ? `${reason} determined this unranked Daily result. The UTC lane is durable and does not mutate ratings.`
              : match.projection.data?.ranked
                ? `${reason} determined this Ranked Practice result. Trusted shell settlement ${match.settlement ? 'is complete' : 'is reconciling'}.`
                : `${reason} determined this unranked Practice result. The result is durable and does not mutate ratings.`
        }
        statusLabel={cancelled ? 'No result' : reason}
        statusTone={cancelled ? 'muted' : 'green'}
        participants={[
          {
            ...participants[0],
            score: leftPoints,
            ...(match.projection.data?.viewerSeat === 'player-one' && match.settlement
              ? {
                  ratingChange: `${match.settlement.ratingDelta >= 0 ? '+' : ''}${match.settlement.ratingDelta}`,
                }
              : {}),
          },
          {
            ...participants[1],
            score: rightPoints,
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
          { label: 'Active games', onPress: () => navigate('/combat/active') },
        ]}
      />
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
  const match = useRankedDailyCombatMatch(matchId);
  const current = match.current;
  const participants = participantPair(match.identities.data);
  if (match.projection.isPending) {
    return (
      <div className="route-loading" role="status" aria-live="polite">
        <p>Loading trusted Ranked Daily result…</p>
      </div>
    );
  }
  if (!current || !['won', 'lost', 'expired', 'cancelled'].includes(current.status)) {
    return (
      <MatchGate
        title="Trusted result unavailable"
        description="The private authority has not returned a terminal Ranked Daily projection."
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
              ? `Trusted settlement applied: ${match.settlement.oldRating} → ${match.settlement.newRating}.`
              : 'Terminal authority is durable. Trusted settlement is reconciling.'
        }
        statusLabel={cancelled ? 'No result' : 'Trusted authority'}
        statusTone={cancelled ? 'muted' : 'green'}
        participants={[
          {
            ...participants[0],
            score: current.moves.filter((move) => move.playerId === 'player-one').length,
            ...(current.viewerSeat === 'player-one' && match.settlement
              ? {
                  ratingChange: `${match.settlement.ratingDelta >= 0 ? '+' : ''}${match.settlement.ratingDelta}`,
                }
              : {}),
          },
          {
            ...participants[1],
            score: current.moves.filter((move) => move.playerId === 'player-two').length,
            ...(current.viewerSeat === 'player-two' && match.settlement
              ? {
                  ratingChange: `${match.settlement.ratingDelta >= 0 ? '+' : ''}${match.settlement.ratingDelta}`,
                }
              : {}),
          },
        ]}
        evidence={{
          label: 'Answer authority',
          value: cancelled
            ? 'Not revealed'
            : 'Held in the private Ranked Daily authority; public projection remains answerless',
        }}
        actions={[
          { label: 'Daily COMBAT', onPress: () => navigate('/combat/daily'), tone: 'primary' },
          { label: 'COMBAT', onPress: () => navigate('/combat') },
        ]}
      />
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
        title="Live service unavailable"
        description="The privacy-safe spectator projection cannot be loaded in this environment."
      />
    );
  }
  if (live.isPending) {
    return (
      <div className="route-loading" role="status" aria-live="polite" aria-busy="true">
        <span aria-hidden="true" />
        <p>Loading privacy-safe Live evidence…</p>
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
          privacyNote="Exact-ID lookup uses the same eligibility boundary as the Live list. No participant session or answer fallback is attempted."
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
        message={`${game.progress.moveCount} accepted ${game.progress.moveCount === 1 ? 'turn' : 'turns'} · spectator projection updated ${new Date(game.updatedAt).toLocaleTimeString()}`}
        compact={game.wordLength > 10}
        readOnly
      />
      <div className="spectator-controls">
        <ButtonLink tone="primary" to="/combat/live">
          Back to Live
        </ButtonLink>
        <Disclosure label="Spectator privacy" meta="Read-only">
          <p role="status">
            Scored moves only. No keyboard, drafts, answers, raw account identifiers, or mutation
            capabilities are exposed.
          </p>
        </Disclosure>
      </div>
    </div>
  );
}
