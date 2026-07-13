import { useId, useState } from 'react'
import { Button, Dialog } from '../ui'

interface PasswordResetModalProps {
  readonly busy?: boolean
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly onUpdatePassword: (password: string) => void
  readonly statusMessage?: string
}

export function PasswordResetModal({
  busy = false,
  isOpen,
  onClose,
  onUpdatePassword,
  statusMessage,
}: PasswordResetModalProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [validationError, setValidationError] = useState<string | undefined>(undefined)
  const statusId = useId()

  const [lastIsOpen, setLastIsOpen] = useState(isOpen)
  if (lastIsOpen !== isOpen) {
    setLastIsOpen(isOpen)
    if (!isOpen) {
      setPassword('')
      setConfirmPassword('')
      setShowPassword(false)
      setValidationError(undefined)
    }
  }

  function submit() {
    setValidationError(undefined)
    if (password.length < 8) {
      setValidationError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setValidationError('Passwords do not match.')
      return
    }
    onUpdatePassword(password)
  }

  const message = validationError ?? statusMessage

  return (
    <Dialog
      description="Create a new password for this signed-in account."
      isOpen={isOpen}
      onClose={onClose}
      title="Choose a new password"
    >
      <div className="space-y-3">
        <label className="grid gap-1 font-semibold text-cyan-100">
          New password
          <div className="flex gap-2">
            <input
              autoComplete="new-password"
              className="flex-1 rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]"
              onChange={(event) => { setPassword(event.target.value); setValidationError(undefined) }}
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

        <label className="grid gap-1 font-semibold text-cyan-100">
          Confirm password
          <input
            autoComplete="new-password"
            className="rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]"
            onChange={(event) => { setConfirmPassword(event.target.value); setValidationError(undefined) }}
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
          />
        </label>

        <p className="text-xs text-slate-400">Passwords must be at least 8 characters.</p>

        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={submit} variant="primary">Update password</Button>
          <Button disabled={busy} onClick={onClose} variant="ghost">Close</Button>
        </div>

        {message ? (
          <p aria-live="polite" className="text-sm text-cyan-100" id={statusId}>
            {message}
          </p>
        ) : null}
      </div>
    </Dialog>
  )
}
