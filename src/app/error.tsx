'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
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
 *
 * v8.2-P4. It now reports what actually went wrong, because it did not.
 *
 * The owner hit this on the Daily tab and could tell me only that the page had failed —
 * the message here is the same sentence whatever the cause, and the real error went to a
 * console nobody had open. A whole tab was unusable and there was nothing to act on.
 *
 * The technical detail sits behind a disclosure so an ordinary player still meets the calm
 * version first, and the copy button exists because the alternative is asking someone to
 * transcribe a stack trace from a phone.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    console.error('Route render failed', error);
  }, [error]);

  /*
   * `digest` is the only identifier that survives a production build, where names are
   * minified and stacks are rewritten — so it is reported even when the message is not.
   */
  const report = [
    `Amordle route error`,
    `page: ${typeof window === 'undefined' ? 'unknown' : window.location.pathname}`,
    `build: ${process.env.NEXT_PUBLIC_BUILD_ID || 'dev'}`,
    error.digest ? `digest: ${error.digest}` : null,
    `message: ${error.message || '(no message)'}`,
    error.stack ? `stack: ${error.stack.split('\n').slice(0, 6).join('\n')}` : null,
  ]
    .filter(Boolean)
    .join('\n');

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
        <details className="error-report">
          <summary>What went wrong</summary>
          <pre className="error-report-detail">{report}</pre>
          <div className="action-row">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(report)
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false));
              }}
            >
              {copied ? 'COPIED' : 'COPY DETAILS'}
            </button>
          </div>
          <p className="footnote">
            Sending this text to us is what turns a broken page into a fix. It contains no account
            details.
          </p>
        </details>
      </StatusPanel>
    </div>
  );
}
