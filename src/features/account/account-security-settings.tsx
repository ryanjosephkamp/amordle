'use client';

import { useEffect, useRef, useState } from 'react';
import { changeAccountEmail, changeAccountPassword } from '@/adapters/cloud/account-management';
import { dismissOnBackdrop, useModalScrollLock } from '@/application/modal-dialog';
import { useAuth } from '@/components/providers';

type SecurityAction = 'email' | 'password';

export function AccountSecuritySettings() {
  const auth = useAuth();
  const [action, setAction] = useState<SecurityAction | null>(null);
  const [message, setMessage] = useState('');

  if (auth.status !== 'signed-in' || !auth.user?.email) {
    return <p className="settings-description">Sign in to manage account credentials.</p>;
  }

  return (
    <div className="account-settings-list">
      <div className="account-setting-card">
        <div>
          <h3>EMAIL ADDRESS</h3>
          <p>Change the address used to sign in. Email verification may be required.</p>
        </div>
        <button type="button" onClick={() => setAction('email')}>
          CHANGE EMAIL
        </button>
      </div>
      <div className="account-setting-card">
        <div>
          <h3>PASSWORD</h3>
          <p>Choose a new password after verifying the current one.</p>
        </div>
        <button type="button" onClick={() => setAction('password')}>
          CHANGE PASSWORD
        </button>
      </div>
      <p className="form-message" aria-live="polite">
        {message}
      </p>
      <SecurityActionDialog
        action={action}
        currentEmail={auth.user.email}
        onClose={() => setAction(null)}
        onSuccess={(next) => {
          setMessage(next);
          setAction(null);
        }}
      />
    </div>
  );
}

function SecurityActionDialog({
  action,
  currentEmail,
  onClose,
  onSuccess,
}: {
  action: SecurityAction | null;
  currentEmail: string;
  onClose(): void;
  onSuccess(message: string): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextValue, setNextValue] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (action && !dialog.current?.open) dialog.current?.showModal();
    if (!action && dialog.current?.open) dialog.current.close();
  }, [action]);
  useModalScrollLock(action !== null);

  function clearAndClose() {
    setCurrentPassword('');
    setNextValue('');
    setConfirmation('');
    setError('');
    setPending(false);
    onClose();
  }

  async function submit() {
    if (!action) return;
    if (nextValue !== confirmation) {
      setError(
        action === 'email'
          ? 'The email addresses do not match.'
          : 'The new passwords do not match.',
      );
      return;
    }
    if (action === 'email' && nextValue.trim().toLowerCase() === currentEmail.toLowerCase()) {
      setError('Enter a different email address.');
      return;
    }
    setPending(true);
    setError('');
    try {
      if (action === 'email') {
        const result = await changeAccountEmail({
          currentEmail,
          currentPassword,
          newEmail: nextValue.trim(),
        });
        onSuccess(
          result.verificationPending
            ? 'Email change requested. Check both addresses if verification is required.'
            : 'Email address changed.',
        );
      } else {
        await changeAccountPassword({ currentEmail, currentPassword, newPassword: nextValue });
        onSuccess('Password changed.');
      }
      setCurrentPassword('');
      setNextValue('');
      setConfirmation('');
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'The account change could not be completed.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="app-modal account-action-dialog"
      aria-labelledby="account-security-dialog-title"
      onCancel={(event) => {
        if (pending) event.preventDefault();
      }}
      onClick={(event) => dismissOnBackdrop(event, { pending })}
      onClose={clearAndClose}
    >
      <form
        method="dialog"
        className="account-action-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="section-heading">
          <h2 id="account-security-dialog-title">
            {action === 'email' ? 'Change email address' : 'Change password'}
          </h2>
          <button
            type="button"
            aria-label="Close account settings"
            disabled={pending}
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </div>
        <label>
          Current password
          <input
            required
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            disabled={pending}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </label>
        <label>
          {action === 'email' ? 'New email address' : 'New password'}
          <input
            required
            type={action === 'email' ? 'email' : 'password'}
            minLength={action === 'password' ? 8 : undefined}
            autoComplete={action === 'email' ? 'email' : 'new-password'}
            value={nextValue}
            disabled={pending}
            onChange={(event) => setNextValue(event.target.value)}
          />
        </label>
        <label>
          {action === 'email' ? 'Confirm new email address' : 'Confirm new password'}
          <input
            required
            type={action === 'email' ? 'email' : 'password'}
            minLength={action === 'password' ? 8 : undefined}
            autoComplete={action === 'email' ? 'email' : 'new-password'}
            value={confirmation}
            disabled={pending}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
        <p className="field-error" role="alert">
          {error}
        </p>
        <div className="action-row">
          <button className="primary" disabled={pending}>
            {pending
              ? 'VERIFYING…'
              : action === 'email'
                ? 'REQUEST EMAIL CHANGE'
                : 'CHANGE PASSWORD'}
          </button>
          <button type="button" disabled={pending} onClick={() => dialog.current?.close()}>
            CANCEL
          </button>
        </div>
      </form>
    </dialog>
  );
}
