'use client';

import { StatusPanel } from '@/components/workbench';
import type { ServiceFailureKind } from '@/domain/service-failure';
import { serviceFailureIsRetryable } from '@/domain/service-failure';

/*
 * A plain anchor rather than next/link: this panel is what a player sees when the match
 * failed to load, so a full navigation that re-bootstraps the app is the safer exit.
 * PlayerIdentityLink already links this way for the same reason.
 */
const COPY: Record<
  ServiceFailureKind,
  { title: string; body: string; href: string; hrefLabel: string }
> = {
  auth: {
    title: 'Sign in to open this match',
    body: 'Your session ended. Signing in again returns you to this match — nothing you played is lost.',
    href: '/auth',
    hrefLabel: 'Sign in',
  },
  'not-found': {
    title: 'Match not found',
    body: 'No match exists at this address. Check the link, or open ACTIVE for your current and recent games.',
    href: '/combat/active',
    hrefLabel: 'Active games',
  },
  forbidden: {
    title: 'Match is private to its players',
    body: 'Only the two seated players can open this match. Public Practice games can be watched from LIVE.',
    href: '/combat/live',
    hrefLabel: 'Watch live',
  },
  offline: {
    title: 'You are offline',
    body: 'This match loads again when the connection returns. Nothing you played is lost.',
    href: '/combat/active',
    hrefLabel: 'Active games',
  },
  unavailable: {
    title: 'COMBAT services are unavailable',
    body: 'The match service did not respond. Your match is safe on the server; try again in a moment.',
    href: '/combat/active',
    hrefLabel: 'Active games',
  },
  unsupported: {
    title: 'This match needs a reload',
    body: 'The match returned data this version of the app does not understand. Reloading picks up the current release.',
    href: '/combat/active',
    hrefLabel: 'Active games',
  },
  unknown: {
    title: 'Match could not load',
    body: 'Something went wrong reading this match. Your match is safe on the server; try again.',
    href: '/combat/active',
    hrefLabel: 'Active games',
  },
};

export function MatchUnavailable({
  kind,
  gameId,
  onRetry,
}: {
  kind: ServiceFailureKind;
  gameId: string;
  onRetry(): void;
}) {
  const copy = COPY[kind];
  return (
    <StatusPanel
      title={copy.title}
      action={
        <>
          {serviceFailureIsRetryable(kind) && (
            <button type="button" onClick={onRetry}>
              Try again
            </button>
          )}
          <a className="button" href={copy.href}>
            {copy.hrefLabel}
          </a>
        </>
      }
    >
      <p>{copy.body}</p>
      {/* Names the failure so a screenshot of it is diagnosable without a repro. */}
      <p className="mono" data-match-failure={kind}>
        MATCH {gameId} · {kind.toUpperCase()}
      </p>
    </StatusPanel>
  );
}
