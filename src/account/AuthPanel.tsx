import { useMemo, useState } from 'react'
import { Button, Panel } from '../ui'
import { getSupabaseRuntimeConfig } from './supabaseClient'

type AuthMethod = 'magic-link' | 'password'

interface AuthPanelProps {
  readonly authEmail?: string
  readonly authStatus: 'anonymous' | 'authenticated' | 'unconfigured'
  readonly onSendMagicLink?: (email: string) => void
  readonly onSignInWithPassword?: (email: string, password: string) => void
  readonly onSignUpWithPassword?: (email: string, password: string) => void
  readonly onRequestPasswordReset?: (email: string) => void
  readonly onSignOut?: () => void
  readonly authMessage?: string
}

export function AuthPanel({
  authEmail,
  authStatus,
  authMessage,
  onSendMagicLink,
  onSignInWithPassword,
  onSignUpWithPassword,
  onRequestPasswordReset,
  onSignOut,
}: AuthPanelProps) {
  const [method, setMethod] = useState<AuthMethod>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const config = useMemo(() => getSupabaseRuntimeConfig(), [])

  if (!config.isConfigured || authStatus === 'unconfigured') {
    return (
      <Panel className="space-y-2 text-sm leading-6 text-slate-300" tone="muted">
        <h3 className="text-xl font-bold text-white">Account sync setup</h3>
        <p>Supabase is not configured in this environment. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to enable sign-in and cloud sync.</p>
      </Panel>
    )
  }

  if (authStatus === 'authenticated') {
    return (
      <Panel className="space-y-3 text-sm leading-6 text-slate-300" tone="muted">
        <h3 className="text-xl font-bold text-white">Signed in</h3>
        <p>{authEmail ?? 'Authenticated Supabase user'}</p>
        <Button onClick={onSignOut} variant="secondary">Sign out</Button>
      </Panel>
    )
  }

  return (
    <Panel className="space-y-3 text-sm leading-6 text-slate-300" tone="muted">
      <h3 className="text-xl font-bold text-white">Sign in for sync</h3>

      <div role="tablist" aria-label="Sign-in method" className="flex flex-wrap gap-2">
        <Button
          aria-selected={method === 'password'}
          isActive={method === 'password'}
          onClick={() => setMethod('password')}
          role="tab"
          size="sm"
          variant="secondary"
        >
          Email + password
        </Button>
        <Button
          aria-selected={method === 'magic-link'}
          isActive={method === 'magic-link'}
          onClick={() => setMethod('magic-link')}
          role="tab"
          size="sm"
          variant="secondary"
        >
          Magic link
        </Button>
      </div>

      <label className="grid gap-1 font-semibold text-cyan-100">
        Email address
        <input
          autoComplete="email"
          className="rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]"
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          value={email}
        />
      </label>

      {method === 'magic-link' ? (
        <>
          <p className="text-xs text-slate-400">We will email you a one-time sign-in link for this amordle site.</p>
          <Button onClick={() => onSendMagicLink?.(email)} variant="primary">Send magic link</Button>
        </>
      ) : (
        <>
          <label className="grid gap-1 font-semibold text-cyan-100">
            Password
            <div className="flex gap-2">
              <input
                aria-label="Password"
                autoComplete="current-password"
                className="flex-1 rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]"
                onChange={(event) => setPassword(event.target.value)}
                type={showPassword ? 'text' : 'password'}
                value={password}
              />
              <Button
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((current) => !current)}
                size="sm"
                variant="secondary"
              >
                {showPassword ? 'Hide' : 'Show'}
              </Button>
            </div>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => onSignInWithPassword?.(email, password)} variant="primary">
              Sign in
            </Button>
            <Button onClick={() => onSignUpWithPassword?.(email, password)} variant="secondary">
              Create account
            </Button>
            {onRequestPasswordReset ? (
              <Button onClick={() => onRequestPasswordReset(email)} size="sm" variant="ghost">
                Forgot password?
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-slate-400">
            Passwords must be at least 8 characters. New accounts may need email confirmation before sign-in.
          </p>
        </>
      )}

      {authMessage ? (
        <p aria-live="polite" className="text-sm text-rose-200">{authMessage}</p>
      ) : null}
    </Panel>
  )
}
