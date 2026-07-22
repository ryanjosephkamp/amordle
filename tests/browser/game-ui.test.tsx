import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';

import { AuthContext } from '../../src/app/auth-context';
import { PlayerStateContext } from '../../src/app/player-state-context';
import { GameBoard, Keyboard } from '../../src/components/GameBoard';
import { emptyRow, tiles } from '../../src/components/gameBoardData';
import { mergeKeyboardEvidence, scoreGuess } from '../../src/domain/game';
import { createGoSession } from '../../src/domain/go';
import { SoloGamePage } from '../../src/features/play/SoloGamePage';
import { soundEngine } from '../../src/services/sound-controller';
import { wordListProvider } from '../../src/services/word-list-provider';
import '../../src/styles/global.css';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('code-native game controls', () => {
  it('exposes board evidence without relying on color', () => {
    render(
      <GameBoard
        length={5}
        rows={[tiles('CRANE', ['correct', 'present', 'absent', 'correct', 'empty']), emptyRow(5)]}
      />,
    );
    expect(screen.getByRole('grid', { name: '5-letter word board' })).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: 'C, correct' })).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: 'R, present' })).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: 'A, absent' })).toBeInTheDocument();
    expect(screen.getByRole('gridcell', { name: 'empty position 1' })).toBeInTheDocument();
  });

  it('keeps on-screen keyboard actions equivalent', async () => {
    const received: string[] = [];
    const user = userEvent.setup();
    render(
      <Keyboard onKey={(key) => received.push(key)} evidence={{ A: 'correct', B: 'removed' }} />,
    );
    await user.click(screen.getByRole('button', { name: 'A, correct' }));
    await user.click(screen.getByRole('button', { name: 'Enter' }));
    await user.click(screen.getByRole('button', { name: 'Backspace' }));
    expect(received).toEqual(['A', 'ENTER', 'BACKSPACE']);
    expect(screen.getByRole('button', { name: 'B, removed' })).toBeDisabled();
  });

  it('normalizes lowercase domain evidence without allowing a weaker casing duplicate to win', () => {
    const domainEvidence = mergeKeyboardEvidence([
      { tiles: scoreGuess('array', 'cigar') },
      { tiles: scoreGuess('cigar', 'cigar') },
    ]);
    render(<Keyboard onKey={() => undefined} evidence={{ ...domainEvidence, A: 'absent' }} />);

    for (const letter of 'CIGAR') {
      expect(screen.getByRole('button', { name: `${letter}, correct` })).toHaveAttribute(
        'data-state',
        'correct',
      );
    }
  });

  it('renders sculpted keycaps without changing evidence palette semantics', () => {
    render(
      <Keyboard
        onKey={() => undefined}
        pressedKey="A"
        evidence={{ A: 'correct', B: 'present', C: 'absent', D: 'removed' }}
      />,
    );
    const correct = screen.getByRole('button', { name: 'A, correct' });
    const present = screen.getByRole('button', { name: 'B, present' });
    const absent = screen.getByRole('button', { name: 'C, absent' });
    expect(correct).toHaveAttribute('data-pressed', 'true');
    expect(getComputedStyle(correct).getPropertyValue('--key-face').trim()).toBe('#176435');
    expect(getComputedStyle(present).getPropertyValue('--key-face').trim()).toBe('#7b5209');
    expect(getComputedStyle(absent).getPropertyValue('--key-face').trim()).toBe('#202527');
    expect(Number.parseFloat(getComputedStyle(correct).borderRadius)).toBeGreaterThanOrEqual(5);
    expect(getComputedStyle(correct).boxShadow).not.toBe('none');
    expect(screen.getByRole('button', { name: 'D, removed' })).toBeDisabled();
  });

  it('keeps attributed and open board rows on one centered tile matrix', () => {
    render(
      <div style={{ width: 480 }}>
        <GameBoard
          length={5}
          rows={[
            tiles('CRANE', ['absent', 'present', 'absent', 'correct', 'correct']),
            tiles('MIGHT', ['correct', 'absent', 'present', 'correct', 'absent']),
            emptyRow(5),
            emptyRow(5),
          ]}
          actors={['CL', 'KI']}
        />
      </div>,
    );

    const board = screen.getByRole('grid', { name: '5-letter word board' });
    const boardCenter =
      board.getBoundingClientRect().left + board.getBoundingClientRect().width / 2;
    const rowStarts = screen.getAllByRole('row').map((row) => {
      const cells = row.querySelectorAll<HTMLElement>('[role="gridcell"]');
      const first = cells.item(0).getBoundingClientRect();
      const last = cells.item(cells.length - 1).getBoundingClientRect();
      expect(row.querySelectorAll('.actor-gutter')).toHaveLength(2);
      expect(Math.abs((first.left + last.right) / 2 - boardCenter)).toBeLessThanOrEqual(2);
      return first.left;
    });

    expect(Math.max(...rowStarts) - Math.min(...rowStarts)).toBeLessThanOrEqual(1);
  });

  it('keeps the touch keyboard bounded at 320px with practical key height', () => {
    render(
      <div data-testid="narrow-keyboard" style={{ width: 320 }}>
        <Keyboard onKey={() => undefined} />
      </div>,
    );

    const wrapper = screen.getByTestId('narrow-keyboard');
    const letter = screen.getByRole('button', { name: 'A' });
    expect(wrapper.scrollWidth).toBeLessThanOrEqual(wrapper.clientWidth + 1);
    expect(letter.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(getComputedStyle(letter).touchAction).toBe('manipulation');
  });
});

describe('interactive Solo proof', () => {
  it('restarts an active legacy GO lane with the corrected budgets', async () => {
    const answers = ['crane', 'stare', 'cider', 'delta', 'ember'];
    const legacy = {
      ...createGoSession({
        id: 'legacy-practice-go',
        answers,
        scope: 'practice',
        now: '2026-07-22T12:00:00.000Z',
      }),
      puzzles: createGoSession({
        id: 'legacy-practice-go',
        answers,
        scope: 'practice',
        now: '2026-07-22T12:00:00.000Z',
      }).puzzles.map((puzzle) => ({ ...puzzle, maxAttempts: 6 })),
    } as Record<string, unknown>;
    delete legacy.attemptPolicyVersion;
    localStorage.setItem(
      'amordle:solo:practice:go:active:5l:expert:normal:5p:guest',
      JSON.stringify({
        schemaVersion: 1,
        owner: { kind: 'guest' },
        revision: 3,
        updatedAt: '2026-07-22T12:00:00.000Z',
        payload: legacy,
      }),
    );
    vi.spyOn(wordListProvider, 'load').mockResolvedValue({
      schemaVersion: 1,
      revision: 'browser-go-restart-v1',
      wordLength: 5,
      answers: { casual: answers, standard: answers, expert: answers },
      validGuesses: answers,
    });
    const router = createMemoryRouter([{ path: '/play/:scope/:mode', Component: SoloGamePage }], {
      initialEntries: ['/play/practice/go'],
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider
          value={{
            client: null,
            service: null,
            user: null,
            status: 'unconfigured',
            identity: { kind: 'guest' },
          }}
        >
          <PlayerStateContext.Provider
            value={{
              progression: {
                xp: 0,
                coins: 0,
                rewardedGameIds: [],
                unlockedDailies: [],
                appliedUnlockIds: [],
              },
              persistenceAvailable: true,
              economyPending: false,
              reward: async () => false,
              unlockDaily: async () => 'invalid',
              promoteDailyUnlock: () => false,
              purchaseConsumable: async () => ({ ok: false, code: 'unavailable' }),
              consumeConsumable: async () => ({ ok: false, code: 'unavailable' }),
              spendCoins: async () => ({ ok: false, code: 'unavailable' }),
            }}
          >
            <RouterProvider router={router} />
          </PlayerStateContext.Provider>
        </AuthContext.Provider>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText(
        'GO attempt rules updated. A new deterministic Practice chain is ready.',
      ),
    ).toBeInTheDocument();
    const saved = JSON.parse(
      localStorage.getItem('amordle:solo:practice:go:active:5l:expert:normal:5p:guest') ?? '{}',
    ) as { payload?: { attemptPolicyVersion?: string; puzzles?: { maxAttempts: number }[] } };
    expect(saved.payload?.attemptPolicyVersion).toBe('carryover-consumes-v1');
    expect(saved.payload?.puzzles?.map((puzzle) => puzzle.maxAttempts)).toEqual([6, 5, 4, 3, 2]);
  });

  it('uses domain validation and does not consume an invalid attempt', async () => {
    const sound = vi.spyOn(soundEngine, 'play').mockResolvedValue(true);
    vi.spyOn(wordListProvider, 'load').mockResolvedValue({
      schemaVersion: 1,
      revision: 'browser-fixture-v1',
      wordLength: 5,
      answers: { casual: ['crane'], standard: ['crane'], expert: ['crane'] },
      validGuesses: ['crane', 'stare'],
    });
    const router = createMemoryRouter([{ path: '/play/:scope/:mode', Component: SoloGamePage }], {
      initialEntries: ['/play/practice/og'],
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider
          value={{
            client: null,
            service: null,
            user: null,
            status: 'unconfigured',
            identity: { kind: 'guest' },
          }}
        >
          <PlayerStateContext.Provider
            value={{
              progression: {
                xp: 0,
                coins: 0,
                rewardedGameIds: [],
                unlockedDailies: [],
                appliedUnlockIds: [],
              },
              persistenceAvailable: true,
              economyPending: false,
              reward: async () => false,
              unlockDaily: async () => 'invalid',
              promoteDailyUnlock: () => false,
              purchaseConsumable: async () => ({ ok: false, code: 'unavailable' }),
              consumeConsumable: async () => ({ ok: false, code: 'unavailable' }),
              spendCoins: async () => ({ ok: false, code: 'unavailable' }),
            }}
          >
            <RouterProvider router={router} />
          </PlayerStateContext.Provider>
        </AuthContext.Provider>
      </QueryClientProvider>,
    );
    const initialAttempts = (
      await screen.findByText(/\d+ attempts remaining/i, {}, { timeout: 5_000 })
    ).textContent;
    fireEvent.keyDown(window, { key: 'x' });
    expect(screen.getByRole('button', { name: 'X' })).toHaveAttribute('data-pressed', 'true');
    fireEvent.keyUp(window, { key: 'x' });
    expect(screen.getByRole('button', { name: 'X' })).not.toHaveAttribute('data-pressed');
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(await screen.findByRole('status')).toHaveTextContent('exactly 5 letters');
    expect(screen.getByText(initialAttempts ?? '')).toBeInTheDocument();
    expect(sound).toHaveBeenCalledWith('keyboard-click', true);
    expect(sound).toHaveBeenCalledWith('invalid', true);
  });
});
