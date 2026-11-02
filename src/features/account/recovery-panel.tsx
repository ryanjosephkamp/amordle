'use client';

import { useState } from 'react';
import { getBrowserSupabase } from '@/adapters/supabase/browser';

export function RecoveryPanel() {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  return (
    <form
      className="form-panel field-stack"
      onSubmit={(event) => {
        event.preventDefault();
        const client = getBrowserSupabase();
        if (!client) {
          setMessage('Account services are unavailable.');
          return;
        }
        void client.auth.updateUser({ password }).then(({ error }) => {
          setMessage(error ? 'That password could not be updated.' : 'Your password is updated.');
        });
      }}
    >
      <h2>NEW PASSWORD</h2>
      <label>
        New password
        <input
          required
          minLength={8}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <button className="primary">UPDATE PASSWORD</button>
      <p aria-live="polite">{message}</p>
    </form>
  );
}
