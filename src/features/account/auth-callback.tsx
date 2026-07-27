'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getBrowserSupabase } from '@/adapters/supabase/browser';

export function AuthCallback() {
  const search = useSearchParams();
  const [state, setState] = useState<'working' | 'done' | 'error'>('working');

  useEffect(() => {
    const code = search.get('code');
    const client = getBrowserSupabase();
    if (!client || !code) {
      queueMicrotask(() => setState('error'));
      return;
    }
    let active = true;
    void client.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (active) setState(error ? 'error' : 'done');
    });
    return () => {
      active = false;
    };
  }, [search]);

  return (
    <section className="status-panel" aria-live="polite">
      <h2>
        {state === 'working'
          ? 'Finishing sign in…'
          : state === 'done'
            ? 'You are signed in'
            : 'This sign-in link could not be used'}
      </h2>
      {state !== 'working' && (
        <Link className="button primary" href={state === 'done' ? '/profile' : '/auth'}>
          {state === 'done' ? 'Open profile' : 'Return to sign in'}
        </Link>
      )}
    </section>
  );
}
