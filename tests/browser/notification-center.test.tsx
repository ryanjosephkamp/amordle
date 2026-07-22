import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AppShell } from '../../src/app/AppShell';
import { AuthContext } from '../../src/app/auth-context';
import {
  ingestSourceNotifications,
  type NotificationEvent,
} from '../../src/features/supporting/notification-repository';
import { guestIdentity } from '../../src/features/play/solo-session-repository';
import '../../src/styles/global.css';

const event: NotificationEvent = {
  id: 'request-1',
  fingerprint: 'private-request:request-1:pending',
  kind: 'private-request',
  title: 'Private Practice request',
  body: 'A public player invited you to a Practice match.',
  target: '/combat/lobby?request=request-1',
  createdAt: '2026-07-22T12:00:00.000Z',
};

function renderShell() {
  const router = createMemoryRouter(
    [
      {
        Component: AppShell,
        children: [
          { index: true, element: <p>Home route</p> },
          { path: 'combat/lobby', element: <p>Lobby route</p> },
        ],
      },
    ],
    { initialEntries: ['/'] },
  );
  render(
    <AuthContext.Provider
      value={{
        client: null,
        service: null,
        user: null,
        status: 'guest',
        identity: guestIdentity,
      }}
    >
      <RouterProvider router={router} />
    </AuthContext.Provider>,
  );
  return router;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('notification center interaction distinctions', () => {
  it('marks read and hides without navigating', async () => {
    ingestSourceNotifications(guestIdentity, [event]);
    const user = userEvent.setup();
    const router = renderShell();

    await user.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));
    await user.click(screen.getByRole('button', { name: 'Mark read' }));
    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeVisible();
    expect(screen.getByText(event.title)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Hide' }));
    expect(router.state.location.pathname).toBe('/');
    expect(screen.getByText('No source-derived notifications are available.')).toBeVisible();
  });

  it('opens the exact internal target and collapses the center', async () => {
    ingestSourceNotifications(guestIdentity, [event]);
    const user = userEvent.setup();
    const router = renderShell();

    await user.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(router.state.location.pathname).toBe('/combat/lobby');
    expect(router.state.location.search).toBe('?request=request-1');
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument();
  });

  it('closes on Escape and outside click', async () => {
    ingestSourceNotifications(guestIdentity, [event]);
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Notifications, 1 unread' }));
    fireEvent.mouseDown(document.querySelector('.popover-backdrop')!);
    expect(screen.queryByRole('dialog', { name: 'Notifications' })).not.toBeInTheDocument();
  });
});
