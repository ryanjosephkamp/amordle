import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { emptyRow, tiles } from '../../src/components/gameBoardData';
import {
  CombatLobbyPanel,
  CombatParticipantHeader,
  CombatSharedActorBoard,
  CombatTerminalResultPanel,
  CombatUnavailablePanel,
  type CombatPreviewParticipant,
} from '../../src/features/combat/components';
import { useRankedSearchController } from '../../src/features/combat/ranked-search-controller';
import '../../src/styles/global.css';

const participants: readonly [CombatPreviewParticipant, CombatPreviewParticipant] = [
  {
    key: 'left-seat',
    displayName: 'Ember Player',
    shortLabel: 'EP',
    tone: 'ember',
  },
  {
    key: 'right-seat',
    displayName: 'Ice Player',
    shortLabel: 'IP',
    tone: 'ice',
  },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('repository-agnostic COMBAT preview components', () => {
  it('keeps restored ranked-search UI stable while status is loading and reconciling', () => {
    const claim = vi.fn(() => new Promise<{ status: 'queued' }>(() => undefined));
    const finalize = vi.fn(async () => undefined);
    const onQueueUpdate = vi.fn();
    const onTerminal = vi.fn();
    const onTransientError = vi.fn();
    function SearchHarness({
      queue,
      updatedAt,
    }: {
      queue: { status: 'queued' } | undefined;
      updatedAt: number;
    }) {
      const search = useRankedSearchController({
        enabled: true,
        requestId: 'queue-one',
        queue,
        queueUpdatedAt: updatedAt,
        claim,
        finalize,
        onQueueUpdate,
        onTerminal,
        onTransientError,
      });
      return (
        <p role="status">{search.phase === 'queued' ? 'Searching for a rival' : search.phase}</p>
      );
    }

    const { rerender } = render(<SearchHarness queue={undefined} updatedAt={0} />);
    expect(screen.getByRole('status')).toHaveTextContent('Searching for a rival');

    rerender(<SearchHarness queue={{ status: 'queued' }} updatedAt={1} />);
    expect(screen.getByRole('status')).toHaveTextContent('Searching for a rival');
    expect(claim).toHaveBeenCalledOnce();
  });

  it('renders an accessible participant status header and server-derived clock label', () => {
    render(
      <CombatParticipantHeader
        participants={participants}
        activeSeat="right"
        statusLabel="Opponent turn"
        statusTone="ice"
        clock={{ value: '2:14', label: 'Authoritative time remaining', urgent: false }}
      />,
    );

    const header = screen.getByRole('banner', { name: 'Match status' });
    expect(within(header).getByText('Ember Player')).toBeVisible();
    expect(within(header).getByText('Ice Player')).toBeVisible();
    expect(within(header).getByRole('status')).toHaveTextContent('Opponent turn');
    expect(within(header).getByLabelText('Authoritative time remaining: 2:14')).toBeVisible();
  });

  it('presents lobby settings and waiting actions without owning repository state', async () => {
    const cancel = vi.fn();
    const user = userEvent.setup();
    render(
      <CombatLobbyPanel
        title="Practice lobby"
        description="Waiting for a compatible participant."
        statusLabel="Waiting"
        host={participants[0]}
        waitingLabel="Open seat"
        waitingDescription="The match begins after durable join confirmation."
        settings={[
          { label: 'Mode', value: 'GO' },
          { label: 'Length', value: '5 letters' },
          { label: 'Clock', value: '5 minutes' },
        ]}
        actions={[{ label: 'Cancel lobby', tone: 'danger', onPress: cancel }]}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Practice lobby' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Waiting');
    expect(screen.getByText('GO')).toBeVisible();
    expect(screen.getByText('5 letters')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cancel lobby' }));
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('keeps every attributed tile row centered with equal actor gutters', () => {
    render(
      <div style={{ width: 480 }}>
        <CombatSharedActorBoard
          length={5}
          rows={[
            tiles('CRANE', ['absent', 'present', 'absent', 'correct', 'correct']),
            tiles('MIGHT', ['correct', 'absent', 'present', 'correct', 'absent']),
            emptyRow(5),
          ]}
          actorRows={[
            { participantKey: participants[0].key, shortLabel: participants[0].shortLabel },
            { participantKey: participants[1].key, shortLabel: participants[1].shortLabel },
            { participantKey: null, shortLabel: '' },
          ]}
          participants={participants}
          contextLabel="Shared chronological board"
          message="Waiting for the next durable move."
        />
      </div>,
    );

    const board = screen.getByRole('grid', { name: '5-letter word board' });
    const box = board.getBoundingClientRect();
    for (const row of screen.getAllByRole('row')) {
      const cells = row.querySelectorAll<HTMLElement>('[role="gridcell"]');
      const first = cells.item(0).getBoundingClientRect();
      const last = cells.item(cells.length - 1).getBoundingClientRect();
      expect(row.querySelectorAll('.actor-gutter')).toHaveLength(2);
      expect(
        Math.abs((first.left + last.right) / 2 - (box.left + box.width / 2)),
      ).toBeLessThanOrEqual(2);
    }
    expect(
      screen.getByRole('list', { name: 'Match participants', hidden: true }),
    ).toHaveTextContent('Ember Player');
  });

  it('renders the read-only spectator board without duplicate mobile participant chrome', () => {
    render(
      <CombatSharedActorBoard
        length={5}
        rows={[
          tiles('CRANE', ['absent', 'present', 'absent', 'correct', 'correct']),
          emptyRow(5),
          emptyRow(5),
          emptyRow(5),
          emptyRow(5),
          emptyRow(5),
        ]}
        actorRows={[
          { participantKey: participants[0].key, shortLabel: participants[0].shortLabel },
          ...Array.from({ length: 5 }, () => ({
            participantKey: null,
            shortLabel: '',
          })),
        ]}
        participants={participants}
        contextLabel="Spectator · OG · 5 letters"
        message="1 accepted turn"
        readOnly
      />,
    );

    const surface = screen.getByRole('region', { name: 'Shared COMBAT board' });
    expect(surface).toHaveAttribute('data-read-only', 'true');
    expect(within(surface).queryByRole('list', { name: 'Match participants' })).toBeNull();
    expect(within(surface).getAllByRole('row')).toHaveLength(6);
    expect(within(surface).queryByRole('group', { name: /game keyboard/i })).toBeNull();
  });

  it('reuses the modular keyboard and remains bounded inside a 320px host', async () => {
    const commands: string[] = [];
    const user = userEvent.setup();
    render(
      <div data-testid="narrow-host" style={{ width: 320, overflow: 'hidden' }}>
        <CombatSharedActorBoard
          length={5}
          rows={[emptyRow(5), emptyRow(5)]}
          actorRows={[
            { participantKey: null, shortLabel: '' },
            { participantKey: null, shortLabel: '' },
          ]}
          participants={participants}
          contextLabel="Player-owned input"
          message="Your turn."
          activeRow={0}
          keyboard={{
            evidence: { a: 'correct', b: 'present' },
            onCommand: (command) => {
              commands.push(command);
              return true;
            },
          }}
        />
      </div>,
    );

    const host = screen.getByTestId('narrow-host');
    expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth + 1);
    expect(screen.getByRole('button', { name: 'A, correct' })).toHaveAttribute(
      'data-state',
      'correct',
    );
    expect(screen.getByRole('button', { name: 'B, present' })).toHaveAttribute(
      'data-state',
      'present',
    );
    await user.click(screen.getByRole('button', { name: 'Enter' }));
    expect(commands).toEqual(['ENTER']);
  });

  it('fits six shared rows and the keyboard inside a mobile gameplay stage', () => {
    render(
      <div
        data-testid="mobile-match-stage"
        style={{ width: 390, height: 720, display: 'grid', overflow: 'hidden' }}
      >
        <CombatSharedActorBoard
          length={5}
          rows={Array.from({ length: 6 }, () => emptyRow(5))}
          actorRows={Array.from({ length: 6 }, () => ({
            participantKey: null,
            shortLabel: '',
          }))}
          participants={participants}
          contextLabel="Unranked Public Practice OG · 5 letters"
          message="Your turn."
          activeRow={0}
          keyboard={{ onCommand: () => true }}
        />
      </div>,
    );

    const host = screen.getByTestId('mobile-match-stage');
    const keyboard = screen.getByRole('group', { name: /game keyboard/i });
    expect(screen.getAllByRole('row')).toHaveLength(6);
    expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth + 1);
    expect(keyboard.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      host.getBoundingClientRect().bottom + 1,
    );
  });

  it('renders unavailable and terminal states from sanitized props only', async () => {
    const retry = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <CombatUnavailablePanel
        title="Ranked Practice unavailable"
        description="The authority surface could not be reached."
        statusLabel="Unavailable"
        privacyNote="No participant session or private match data was displayed."
        actions={[{ label: 'Retry', onPress: retry }]}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('No participant session');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledOnce();

    rerender(
      <CombatTerminalResultPanel
        title="Match complete"
        summary="The terminal projection is final."
        statusLabel="Recorded"
        participants={[
          { ...participants[0], score: 18, ratingChange: '+14 rating' },
          { ...participants[1], score: 12, ratingChange: '-14 rating' },
        ]}
        evidence={{ label: 'Authorized answer evidence', value: 'FROST' }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Match complete' })).toBeVisible();
    expect(screen.getByLabelText('Terminal score')).toHaveTextContent('18');
    expect(screen.getByLabelText('Terminal score')).toHaveTextContent('12');
    expect(screen.getByText('FROST')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
