import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';

import { AuthContext } from '../../src/app/auth-context';
import { PlayerStateContext } from '../../src/app/player-state-context';
import { GameBoard, Keyboard } from '../../src/components/GameBoard';
import { emptyRow, tiles } from '../../src/components/gameBoardData';
import { SoloGamePage } from '../../src/features/play/SoloGamePage';
import { wordListProvider } from '../../src/services/word-list-provider';

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
});

describe('interactive Solo proof', () => {
  it('uses domain validation and does not consume an invalid attempt', async () => {
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
              reward: () => undefined,
              unlockDaily: () => 'invalid',
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
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(await screen.findByRole('status')).toHaveTextContent('exactly 5 letters');
    expect(screen.getByText(initialAttempts ?? '')).toBeInTheDocument();
  });
});
