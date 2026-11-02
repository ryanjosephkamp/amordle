'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  confirmAccountDangerAction,
  prepareAccountDangerAction,
} from '@/adapters/cloud/account-management';
import { dismissOnBackdrop, useModalScrollLock } from '@/application/modal-dialog';
import {
  clearCompetitiveAccountLocalState,
  clearDeletedAccountLocalState,
  clearSoloAccountLocalState,
} from '@/application/account-local-cleanup';
import { useAuth } from '@/components/providers';
import {
  accountDangerCopy,
  type AccountDangerAction,
  type DangerChallenge,
} from '@/domain/account-lifecycle';

const actions: AccountDangerAction[] = [
  'delete-solo-history',
  'restart-competitive-profile',
  'delete-account',
];

export function AccountDangerZone() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [action, setAction] = useState<AccountDangerAction | null>(null);
  const [message, setMessage] = useState('');

  if (auth.status !== 'signed-in' || !auth.user) {
    return <p className="settings-description">Sign in to manage account data.</p>;
  }

  return (
    <div className="danger-zone">
      <div className="danger-zone-warning" role="note">
        <strong>IRREVERSIBLE ACCOUNT ACTIONS</strong>
        <p>Each action requires your current password and a separate final confirmation.</p>
      </div>
      <div className="danger-action-list">
        {actions.map((entry) => {
          const copy = accountDangerCopy[entry];
          return (
            <article key={entry}>
              <div>
                <h3>{copy.title}</h3>
                <p>{copy.summary}</p>
              </div>
              <button className="danger-action" type="button" onClick={() => setAction(entry)}>
                REVIEW ACTION
              </button>
            </article>
          );
        })}
      </div>
      <p className="form-message" aria-live="polite">
        {message}
      </p>
      <DangerActionDialog
        action={action}
        userId={auth.user.id}
        onClose={() => setAction(null)}
        onComplete={async (completedAction) => {
          if (completedAction === 'delete-solo-history') {
            await clearSoloAccountLocalState(auth.user!.id);
          } else if (completedAction === 'restart-competitive-profile') {
            clearCompetitiveAccountLocalState(auth.user!.id);
          } else {
            await clearDeletedAccountLocalState(auth.user!.id);
          }
          queryClient.clear();
          setAction(null);
          if (completedAction === 'delete-account') {
            await auth.signOut();
          } else {
            setMessage(
              completedAction === 'delete-solo-history'
                ? 'Solo history and progress were deleted.'
                : 'Competitive profile restarted.',
            );
          }
        }}
      />
    </div>
  );
}

function DangerActionDialog({
  action,
  userId,
  onClose,
  onComplete,
}: {
  action: AccountDangerAction | null;
  userId: string;
  onClose(): void;
  onComplete(action: AccountDangerAction): Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<DangerChallenge | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const challengeOwner = useRef(userId);

  useEffect(() => {
    if (action && !dialog.current?.open) dialog.current?.showModal();
    if (!action && dialog.current?.open) dialog.current.close();
  }, [action]);
  useModalScrollLock(action !== null);

  function clearAndClose() {
    setPassword('');
    setChallenge(null);
    setPending(false);
    setError('');
    challengeOwner.current = userId;
    onClose();
  }

  if (!action) return <dialog ref={dialog} onClose={clearAndClose} />;
  const copy = accountDangerCopy[action];

  async function prepare() {
    setPending(true);
    setError('');
    challengeOwner.current = userId;
    try {
      const prepared = await prepareAccountDangerAction(action!, password);
      setChallenge(prepared);
      setPassword('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The password could not be verified.');
    } finally {
      setPending(false);
    }
  }

  async function confirm() {
    if (!challenge || challenge.action !== action || challengeOwner.current !== userId) {
      setError('This confirmation is no longer valid. Start again.');
      setChallenge(null);
      return;
    }
    setPending(true);
    setError('');
    try {
      await confirmAccountDangerAction({ action, confirmationToken: challenge.confirmationToken });
      await onComplete(action);
      dialog.current?.close();
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'The action could not be completed.';
      setError(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="app-modal account-action-dialog danger-dialog"
      aria-labelledby="danger-dialog-title"
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
          void (challenge ? confirm() : prepare());
        }}
      >
        <div className="section-heading">
          <h2 id="danger-dialog-title">{copy.title}</h2>
          <button
            type="button"
            aria-label="Close danger action"
            disabled={pending}
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </div>
        <div className="danger-disclosure">
          <section>
            <h3>THIS WILL DELETE OR RESET</h3>
            <ul>
              {copy.deletes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3>THIS WILL RETAIN</h3>
            <ul>
              {copy.retains.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </div>
        {challenge ? (
          <div className="danger-final-confirmation">
            <p>
              Password verified. This one-time confirmation expires at{' '}
              <time dateTime={challenge.expiresAt}>
                {new Date(challenge.expiresAt).toLocaleTimeString()}
              </time>
              .
            </p>
            <button className="danger-action danger-action--final" disabled={pending}>
              {pending ? 'WORKING…' : copy.finalLabel.toUpperCase()}
            </button>
          </div>
        ) : (
          <>
            <label>
              Current password
              <input
                required
                type="password"
                autoComplete="current-password"
                value={password}
                disabled={pending}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <button className="danger-action" disabled={pending}>
              {pending ? 'VERIFYING…' : 'VERIFY PASSWORD'}
            </button>
          </>
        )}
        <p className="field-error" role="alert">
          {error}
        </p>
        {error.toLowerCase().includes('active combat') ? (
          <Link href="/combat/active">OPEN ACTIVE COMBAT</Link>
        ) : null}
        <button type="button" disabled={pending} onClick={() => dialog.current?.close()}>
          CANCEL
        </button>
      </form>
    </dialog>
  );
}
