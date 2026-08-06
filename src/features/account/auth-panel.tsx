'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/providers';
import { SkeletonRows, WorkbenchRegion } from '@/components/workbench';

export function AuthPanel() {
  const auth = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // W-9: `auth.status === 'loading'` is also set by ordinary session restore, so it
  // cannot stand in for "this form is submitting" without showing "Working…" during
  // unrelated hydration. The account-scope transition coordinator is untouched.
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  if (!mounted) {
    return (
      <WorkbenchRegion title="ACCOUNT ACCESS" status="RESTORING">
        <SkeletonRows rows={3} />
      </WorkbenchRegion>
    );
  }

  if (auth.status === 'signed-in') {
    return (
      <section className="form-panel">
        <h2>ACCOUNT STATUS</h2>
        <p className="prose">
          You are signed in as <strong>{auth.user?.email}</strong>.
        </p>
        <div className="action-row">
          <button type="button" onClick={() => void auth.signOut()}>
            SIGN OUT
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="form-panel" aria-labelledby="auth-form-heading">
      <h2 id="auth-form-heading">ACCOUNT ACCESS</h2>
      <div className="segmented" aria-label="Account action">
        <button type="button" aria-pressed={mode === 'signin'} onClick={() => setMode('signin')}>
          SIGN IN
        </button>
        <button
          type="button"
          aria-pressed={mode === 'register'}
          onClick={() => setMode('register')}
        >
          CREATE ACCOUNT
        </button>
      </div>
      <p className="form-intro">{mode === 'signin' ? 'Welcome back.' : 'Create your account.'}</p>
      <form
        className="field-stack"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitting(true);
          void (async () => {
            try {
              if (mode === 'signin') {
                const signedIn = await auth.signIn(email, password);
                // ANNOT-10: ordinary interactive sign-in lands on Home instead of
                // leaving the player on the account page. `replace`, not `push`, so
                // Back does not return to a stale /auth. Only navigate on an actual
                // session — a rejected credential must stay put and show its message.
                // Registration awaiting email confirmation and the recovery flow are
                // deliberately excluded; both must keep showing their own next step.
                if (signedIn) {
                  setSubmitting(false);
                  router.replace('/');
                  return;
                }
                return;
              }
              await auth.register(email, password);
            } finally {
              setSubmitting(false);
            }
          })();
        }}
      >
        <label>
          Email
          <input
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Password
          <input
            required
            minLength={8}
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button className="primary" disabled={submitting}>
          {submitting ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>
      <p className="form-message" aria-live="polite">
        {auth.message}
      </p>
      <p className="form-note">Guest games stay separate.</p>
      <details>
        <summary>Forgot your password?</summary>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            void auth.requestRecovery(email);
          }}
        >
          <span>Enter your email above, then</span>
          <button type="submit">SEND RECOVERY LINK</button>
        </form>
      </details>
    </section>
  );
}
