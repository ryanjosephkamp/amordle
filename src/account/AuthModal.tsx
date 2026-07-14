import { useEffect, useId, useState } from 'react'
import { Button, Dialog } from '../ui'
import { AUTH_MODAL_PASSWORD_ACTION_LABELS } from './authModalConstants'

type AuthMethod = 'magic-link' | 'password'
type PasswordAction = 'sign-in' | 'sign-up'
type Phase = 'auth' | 'forgot-password'

interface AuthModalProps {
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly authMessage?: string
  readonly busy?: boolean
  readonly onSendMagicLink: (email: string) => void
  readonly onSignInWithPassword: (email: string, password: string) => void
  readonly onSignUpWithPassword: (email: string, password: string) => void
  readonly onRequestPasswordReset: (email: string) => void
  /** Optional, supplied by App so we know when authentication has succeeded. */
  readonly authenticated?: boolean
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u

/**
 * Phase 15.2 — Single, clean Auth Modal.
 *
 * Replaces the duplicate-buttons pattern of the inline AuthPanel with:
 *   - one Email + Password / Magic Link tab pair
 *   - direct password actions ordered as Sign in, Create account, Forgot password
 *   - a Forgot Password inline flow with three states: form, busy, success
 *
 * Errors are shown via the parent-provided `authMessage` which is computed in
 * App with `classifyAuthError`, so this component never surfaces raw provider
 * strings.
 */
export function AuthModal({
  isOpen,
  onClose,
  authMessage,
  busy,
  onSendMagicLink,
  onSignInWithPassword,
  onSignUpWithPassword,
  onRequestPasswordReset,
  authenticated,
}: AuthModalProps) {
  const [method, setMethod] = useState<AuthMethod>('password')
  const [phase, setPhase] = useState<Phase>('auth')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [validationError, setValidationError] = useState<string | undefined>(undefined)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const statusId = useId()

  const [lastIsOpen, setLastIsOpen] = useState(isOpen)
  if (lastIsOpen !== isOpen) {
    setLastIsOpen(isOpen)
    if (!isOpen) {
      setPassword('')
      setShowPassword(false)
      setValidationError(undefined)
      setMagicLinkSent(false)
      setResetSent(false)
      setPhase('auth')
    }
  }

  // Auto-close on successful authentication so the badge update is visible.
  useEffect(() => {
    if (isOpen && authenticated) {
      onClose()
    }
  }, [isOpen, authenticated, onClose])

  const trimmedEmail = email.trim()
  const isEmailValid = EMAIL_RE.test(trimmedEmail)

  function clearStatus() {
    setValidationError(undefined)
    setMagicLinkSent(false)
    setResetSent(false)
  }

  function handleMagicLink() {
    clearStatus()
    if (!isEmailValid) {
      setValidationError('Please enter a valid email address.')
      return
    }
    onSendMagicLink(trimmedEmail)
    setMagicLinkSent(true)
  }

  function handlePasswordAction(action: PasswordAction) {
    clearStatus()
    if (!isEmailValid) {
      setValidationError('Please enter a valid email address.')
      return
    }
    if (!password) {
      setValidationError('Please enter your password.')
      return
    }
    if (action === 'sign-up' && password.length < 8) {
      setValidationError('Password must be at least 8 characters.')
      return
    }
    if (action === 'sign-in') {
      onSignInWithPassword(trimmedEmail, password)
      return
    }
    onSignUpWithPassword(trimmedEmail, password)
  }

  function handleSendReset() {
    clearStatus()
    if (!isEmailValid) {
      setValidationError('Enter the email on your account first.')
      return
    }
    onRequestPasswordReset(trimmedEmail)
    setResetSent(true)
  }

  const statusMessage = validationError
    ?? authMessage
    ?? (magicLinkSent ? 'Magic link sent. Open the link in this same browser to finish signing in.' : undefined)
    ?? (resetSent ? 'Check your email for a password reset link.' : undefined)

  return (
    <Dialog
      description="Sign in to sync progress, level up, and unlock the Admin tools for authorized users."
      isOpen={isOpen}
      onClose={onClose}
      title={phase === 'forgot-password' ? 'Reset your password' : 'Sign in to amordle'}
    >
      {phase === 'forgot-password' ? (
        <div className="space-y-3">
          <label className="grid gap-1 font-semibold text-cyan-100">
            Email address
            <input
              autoComplete="email"
              className="rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]"
              onChange={(event) => { setEmail(event.target.value); clearStatus() }}
              type="email"
              value={email}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSendReset} variant="primary" disabled={busy}>Send reset link</Button>
            <Button onClick={() => { setPhase('auth'); clearStatus() }} variant="ghost">Back</Button>
          </div>
          {statusMessage ? (
            <p aria-live="polite" className="text-sm text-rose-200" id={statusId}>{statusMessage}</p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <div role="tablist" aria-label="Sign-in method" className="flex flex-wrap gap-2">
            <Button
              aria-selected={method === 'password'}
              isActive={method === 'password'}
              onClick={() => { setMethod('password'); clearStatus() }}
              role="tab"
              size="sm"
              variant="secondary"
            >
              Email + password
            </Button>
            <Button
              aria-selected={method === 'magic-link'}
              isActive={method === 'magic-link'}
              onClick={() => { setMethod('magic-link'); clearStatus() }}
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
              onChange={(event) => { setEmail(event.target.value); clearStatus() }}
              type="email"
              value={email}
            />
          </label>

          {method === 'password' ? (
            <>
              <label className="grid gap-1 font-semibold text-cyan-100">
                Password
                <div className="flex gap-2">
                  <input
                    aria-label="Password"
                    autoComplete="current-password"
                    className="flex-1 rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]"
                    onChange={(event) => { setPassword(event.target.value); clearStatus() }}
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

              <p className="text-xs text-slate-400">
                Passwords must be at least 8 characters. New accounts may need email confirmation before sign-in.
              </p>
            </>
          ) : (
            <p className="text-xs text-slate-400">We will email you a one-time sign-in link for this amordle site.</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {method === 'magic-link' ? (
              <Button onClick={handleMagicLink} variant="primary" disabled={busy}>
                Send magic link
              </Button>
            ) : (
              <>
                <Button onClick={() => handlePasswordAction('sign-in')} variant="primary" disabled={busy}>
                  {AUTH_MODAL_PASSWORD_ACTION_LABELS[0]}
                </Button>
                <Button onClick={() => handlePasswordAction('sign-up')} variant="secondary" disabled={busy}>
                  {AUTH_MODAL_PASSWORD_ACTION_LABELS[1]}
                </Button>
                <Button onClick={() => { setPhase('forgot-password'); clearStatus() }} variant="ghost" size="sm" disabled={busy}>
                  {AUTH_MODAL_PASSWORD_ACTION_LABELS[2]}
                </Button>
              </>
            )}
          </div>

          {statusMessage ? (
            <p aria-live="polite" className="text-sm text-rose-200" id={statusId}>{statusMessage}</p>
          ) : null}
        </div>
      )}
    </Dialog>
  )
}
