import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AdminDashboard,
  AdminRefreshOperation,
  LockedAdmin,
} from '../../src/features/admin/AdminPage';
import '../../src/styles/global.css';

afterEach(cleanup);

describe('injected Admin presentation states', () => {
  it.each(['unconfigured', 'anonymous', 'denied'] as const)(
    'renders the role-first %s lock without a runtime query switch',
    (state) => {
      render(<LockedAdmin state={state} />);
      expect(screen.getByRole('alert')).toBeVisible();
      expect(screen.getByRole('heading', { name: 'Developer operations locked' })).toBeVisible();
    },
  );

  it('renders only the supplied bounded operational projection', () => {
    render(
      <AdminDashboard
        onConfirm={vi.fn()}
        data={{
          accounts_total: 4,
          public_profiles_total: 3,
          generated_at: '2026-07-23T16:00:00.000Z',
        }}
      />,
    );
    expect(screen.getByRole('list', { name: 'Approved aggregate metrics' })).toBeVisible();
    expect(screen.getByText('4')).toBeVisible();
    expect(screen.queryByText(/secret|auth id|email/i)).not.toBeInTheDocument();
  });

  it('renders refresh success and failure only from an injected receipt', () => {
    const onState = vi.fn();
    const { rerender } = render(
      <AdminRefreshOperation
        state="success"
        onState={onState}
        receipt={{
          revision: 'abcdef0123456789',
          generatedAt: '2026-07-23T16:00:00.000Z',
          lengthsRefreshed: 34,
          persistence: 'manifest-published',
        }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Refresh succeeded');

    rerender(
      <AdminRefreshOperation
        state="failure"
        onState={onState}
        receipt={{ detail: 'The previous manifest pointer remains active.' }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The previous manifest pointer remains active.',
    );
  });
});
