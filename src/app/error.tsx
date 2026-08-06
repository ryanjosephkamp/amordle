'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { StatusPanel } from '@/components/route-states';

/*
 * V7-11. The app had no error boundary at any level, so a render throw fell through to
 * the framework's own error overlay in development and to a blank document in
 * production. This keeps a failed route inside the product: the shell, the navigation
 * and the player's saved work all stay reachable, and the failure is stated in the
 * app's own voice rather than as a stack trace.
 *
 * `reset()` re-renders the segment, which recovers from a transient failure without a
 * full reload. The Home link is the escape hatch when it does not.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Route render failed', error);
  }, [error]);

  return (
    <div className="route-frame is-narrow">
      <StatusPanel
        title="this route could not be loaded"
        action={
          <>
            <button type="button" className="primary" onClick={reset}>
              TRY AGAIN
            </button>
            <Link className="button" href="/">
              GO TO HOME
            </Link>
          </>
        }
      >
        <p>
          Something went wrong while rendering this page. Your saved games are untouched — they live
          on this device and in your account, not in this view.
        </p>
      </StatusPanel>
    </div>
  );
}
