import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { ComponentType } from 'react';

import { AuthContext, type AuthContextValue } from '../../src/app/auth-context';
import {
  PlayerStateContext,
  type PlayerStateContextValue,
} from '../../src/app/player-state-context';
import { localDateKey } from '../../src/domain/daily';
import { createOgSession } from '../../src/domain/game';
import type { ProgressionState } from '../../src/domain/progression';
import { CalendarPage } from '../../src/features/calendar/CalendarPage';
import {
  FeedbackPage,
  MarketplacePage,
  ProfilePage,
  StatsPage,
  WordExplorerPage,
} from '../../src/features/more/MorePages';
import { PlayPage } from '../../src/features/play/PlayPage';
import {
  guestIdentity,
  soloSessionRepository,
} from '../../src/features/play/solo-session-repository';
import { wordListProvider } from '../../src/services/word-list-provider';
import { PublicRepository } from '../../src/services/public-repository';
import '../../src/styles/global.css';

const progression: ProgressionState = {
  xp: 120,
  coins: 7,
  rewardedGameIds: [],
  unlockedDailies: [],
  appliedUnlockIds: [],
};

const guestAuth: AuthContextValue = {
  client: null,
  service: null,
  user: null,
  status: 'unconfigured',
  identity: guestIdentity,
};

function renderSupporting(
  Component: ComponentType,
  path: string,
  options: {
    auth?: AuthContextValue;
    routePattern?: string;
    progression?: ProgressionState;
    unlockDaily?: PlayerStateContextValue['unlockDaily'];
  } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
  const router = createMemoryRouter([{ path: options.routePattern ?? '*', Component }], {
    initialEntries: [path],
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={options.auth ?? guestAuth}>
        <PlayerStateContext.Provider
          value={{
            progression: options.progression ?? progression,
            persistenceAvailable: true,
            economyPending: false,
            reward: async () => false,
            unlockDaily: options.unlockDaily ?? (async () => 'invalid'),
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
}

function fixtureWords(count: number): string[] {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  return Array.from({ length: count }, (_, index) => {
    let value = index;
    let suffix = '';
    for (let position = 0; position < 4; position += 1) {
      suffix = `${alphabet[value % alphabet.length]}${suffix}`;
      value = Math.floor(value / alphabet.length);
    }
    return `a${suffix}`;
  });
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('truthful supporting surfaces', () => {
  it('projects only a validated identity-scoped active Solo session', () => {
    const repository = soloSessionRepository('practice:og:active:5l:expert:normal:single');
    repository.save(
      guestIdentity,
      createOgSession({
        id: 'practice:og:active:5l:expert:normal:single:browser-proof',
        answer: 'crane',
        scope: 'practice',
      }),
      { replaceCorrupt: true },
    );

    renderSupporting(PlayPage, '/play');

    expect(screen.getByText('Solo · 1 active')).toBeInTheDocument();
    expect(screen.getByText('Practice Solo · OG · 5L')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Resume OG' })).toHaveAttribute(
      'href',
      '/play/practice/og?length=5&difficulty=expert',
    );
    expect(screen.queryByText(/Puzzle 2\/3|draft 2\/5/)).not.toBeInTheDocument();
  });

  it('shows honest empty stats and the actual local progression projection', () => {
    renderSupporting(StatsPage, '/stats');

    expect(
      screen.getByText('No completed Solo records are available for statistics.'),
    ).toBeVisible();
    expect(within(screen.getByText('XP').closest('.metric')!).getByText('120')).toBeVisible();
    expect(within(screen.getByText('Coins').closest('.metric')!).getByText('7')).toBeVisible();
    expect(screen.queryByText('1535')).not.toBeInTheDocument();
    expect(screen.queryByText('1324')).not.toBeInTheDocument();
  });

  it('does not fabricate guest inventory or COMBAT calendar completion', () => {
    const { unmount } = renderSupporting(MarketplacePage, '/marketplace');
    expect(
      screen.getByText(/Guest coins and inventory remain only in this local namespace/),
    ).toBeVisible();
    expect(screen.getAllByText('Owned 0')).toHaveLength(2);
    expect(screen.queryByText(/Owned [1-9]/)).not.toBeInTheDocument();
    unmount();

    renderSupporting(CalendarPage, '/calendar');
    expect(screen.getAllByRole('img', { name: 'Combat OG: unavailable' })[0]).toBeVisible();
    expect(screen.queryByText(/Current \d|Best \d/)).not.toBeInTheDocument();
  });

  it('lets a low-balance player select an exact past Solo lane without charging', async () => {
    const user = userEvent.setup();
    const unlockDaily = vi
      .fn<PlayerStateContextValue['unlockDaily']>()
      .mockResolvedValue('invalid');
    const past = new Date();
    past.setDate(past.getDate() - 1);
    const pastDateKey = localDateKey(past);

    renderSupporting(CalendarPage, '/calendar', { unlockDaily });

    await user.click(
      screen.getByRole('button', {
        name: `Select Solo OG for ${pastDateKey}; locked`,
      }),
    );

    expect(unlockDaily).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Past Solo Daily' })).toBeVisible();
    expect(screen.getByText(`Solo OG · ${pastDateKey}`)).toBeVisible();
    expect(screen.getByText('7 coins available')).toBeVisible();
    expect(screen.getByText('53 coin shortfall')).toBeVisible();
    expect(
      screen.getByRole('button', { name: `Unlock Solo OG for ${pastDateKey}` }),
    ).toBeDisabled();
  });

  it('charges a sufficient balance only after exact past-lane confirmation', async () => {
    const user = userEvent.setup();
    const unlockDaily = vi
      .fn<PlayerStateContextValue['unlockDaily']>()
      .mockResolvedValue('unlocked');
    const past = new Date();
    past.setDate(past.getDate() - 1);
    const pastDateKey = localDateKey(past);

    renderSupporting(CalendarPage, '/calendar', {
      progression: { ...progression, coins: 100 },
      unlockDaily,
    });

    await user.click(
      screen.getByRole('button', {
        name: `Select Solo GO for ${pastDateKey}; locked`,
      }),
    );
    expect(unlockDaily).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: `Unlock Solo GO for ${pastDateKey}` }));
    expect(unlockDaily).toHaveBeenCalledOnce();
    expect(unlockDaily).toHaveBeenCalledWith('go', pastDateKey, localDateKey());
    expect(screen.getByRole('status')).toHaveTextContent(`GO entitlement saved for ${pastDateKey}`);
  });

  it('paginates valid guesses without exposing answer-pool membership', async () => {
    const validGuesses = fixtureWords(30);
    vi.spyOn(wordListProvider, 'load').mockResolvedValue({
      schemaVersion: 1,
      revision: 'supporting-ui-proof',
      wordLength: 5,
      answers: {
        casual: [validGuesses[0]!],
        standard: [validGuesses[1]!],
        expert: [validGuesses[2]!],
      },
      validGuesses,
    });
    const user = userEvent.setup();
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    renderSupporting(WordExplorerPage, '/word-explorer');

    expect(await screen.findByText('30 matching valid words · page 1 of 2')).toBeVisible();
    expect(screen.getAllByText('Valid game word')).toHaveLength(25);
    expect(screen.queryByText('Answer & valid guess')).not.toBeInTheDocument();
    expect(screen.queryByText('Casual')).not.toBeInTheDocument();
    expect(screen.queryByText('Standard')).not.toBeInTheDocument();
    expect(screen.queryByText('Expert')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Copy word' }));
    expect(copy).toHaveBeenCalledWith(validGuesses[0]);
    expect(screen.getByRole('status')).toHaveTextContent(
      `${validGuesses[0]!.toUpperCase()} copied.`,
    );

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Page 2 of 2')).toBeVisible();
    expect(screen.getAllByText('Valid game word')).toHaveLength(5);
  });

  it('renders only approved public avatar and accent fields', async () => {
    vi.spyOn(PublicRepository.prototype, 'getProfile').mockResolvedValue({
      publicProfileId: '11111111-1111-4111-8111-111111111111',
      displayName: 'Frost Fern',
      accentColor: 'violet',
      flairKey: 'none',
      avatarUrl: 'https://example.com/avatar.png',
      bio: 'Public words only.',
      createdAt: '2026-07-22T12:00:00.000Z',
      updatedAt: '2026-07-22T12:00:00.000Z',
    });
    const auth: AuthContextValue = {
      ...guestAuth,
      client: {} as AuthContextValue['client'],
      status: 'guest',
    };

    renderSupporting(
      () => <ProfilePage publicView />,
      '/players/11111111-1111-4111-8111-111111111111',
      {
        auth,
        routePattern: '/players/:publicProfileId',
      },
    );

    expect(await screen.findByRole('heading', { name: 'Frost Fern' })).toBeVisible();
    const avatar = document.querySelector('.public-avatar');
    expect(avatar).toHaveAttribute('data-accent', 'violet');
    expect(avatar?.querySelector('img')).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(screen.queryByText(/@|raw auth/i)).not.toBeInTheDocument();
  });

  it('snapshots only feedback that passes visible-character sanitization', async () => {
    const user = userEvent.setup();
    renderSupporting(FeedbackPage, '/feedback');
    const field = screen.getByLabelText('What happened?');

    fireEvent.change(field, {
      target: { value: '\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u0007\u0008\u000e' },
    });
    await user.click(screen.getByRole('button', { name: 'Review handoff' }));
    expect(screen.getByRole('alert')).toHaveTextContent('at least 10 visible characters');
    expect(screen.queryByRole('heading', { name: 'Issue preview' })).not.toBeInTheDocument();

    fireEvent.change(field, { target: { value: 'Keyboard\u0000 focus is lost.' } });
    await user.click(screen.getByRole('button', { name: 'Review handoff' }));
    expect(screen.getByText(/Keyboard focus is lost\./)).toBeVisible();
    expect(screen.getByText(/Keyboard focus is lost\./).textContent).not.toContain('\u0000');

    fireEvent.change(field, { target: { value: 'A changed issue description.' } });
    expect(screen.queryByRole('heading', { name: 'Issue preview' })).not.toBeInTheDocument();
  });
});
