'use client';

import { useState } from 'react';
import { useAuth } from '@/components/providers';

export function AuthPanel() {
  const auth = useAuth();
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (auth.status === 'signed-in') {
    return (
      <section className="form-panel">
        <h2>Signed in</h2>
        <p className="prose">
          You are signed in as <strong>{auth.user?.email}</strong>.
        </p>
        <button type="button" onClick={() => void auth.signOut()}>
          Sign out
        </button>
      </section>
    );
  }

  return (
    <section className="form-panel" aria-labelledby="auth-form-heading">
      <div className="segmented" aria-label="Account action">
        <button type="button" aria-pressed={mode === 'signin'} onClick={() => setMode('signin')}>
          Sign in
        </button>
        <button
          type="button"
          aria-pressed={mode === 'register'}
          onClick={() => setMode('register')}
        >
          Create account
        </button>
      </div>
      <h2 id="auth-form-heading">{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h2>
      <form
        className="field-stack"
        onSubmit={(event) => {
          event.preventDefault();
          void (mode === 'signin' ? auth.signIn(email, password) : auth.register(email, password));
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
        <button className="primary" disabled={auth.status === 'loading'}>
          {auth.status === 'loading'
            ? 'Working…'
            : mode === 'signin'
              ? 'Sign in'
              : 'Create account'}
        </button>
      </form>
      <p className="form-message" aria-live="polite">
        {auth.message}
      </p>
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
          <button type="submit">Send recovery link</button>
        </form>
      </details>
    </section>
  );
}
