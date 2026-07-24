import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RuntimeStatusPanel } from '../../src/app/RuntimeStatusPanel';
import '../../src/styles/global.css';

afterEach(cleanup);

describe('nonblocking runtime status', () => {
  it('renders nothing during the ordinary online state', () => {
    const { container } = render(
      <RuntimeStatusPanel
        online
        offlineReady={false}
        needRefresh={false}
        onDismissOffline={vi.fn()}
        onUpdate={vi.fn()}
        onLater={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps offline Solo guidance and a prompted update independently dismissible', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const onLater = vi.fn();
    const onDismissOffline = vi.fn();
    render(
      <RuntimeStatusPanel
        online={false}
        offlineReady
        needRefresh
        onDismissOffline={onDismissOffline}
        onUpdate={onUpdate}
        onLater={onLater}
      />,
    );

    expect(screen.getByLabelText('Application status')).toHaveTextContent(
      'saved Solo Practice remains available',
    );
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    await user.click(screen.getByRole('button', { name: 'Update now' }));
    await user.click(screen.getByRole('button', { name: 'Later' }));
    expect(onDismissOffline).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onLater).toHaveBeenCalledOnce();
  });
});
