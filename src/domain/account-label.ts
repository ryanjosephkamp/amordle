/**
 * Resolution for the toolbar Account trigger (ANNOT-11).
 *
 * Kept pure so every branch is covered by vectors rather than by driving the shell.
 * The label is deliberately bounded: the toolbar must not grow, collide, or overflow
 * at any supported width, and it must never show a stale identity while an account
 * transition is in flight.
 */

export const guestAccountLabel = 'guest';
export const unknownAccountLabel = 'account';

/**
 * Characters of the email local part shown when an account has no player name yet.
 * Ten keeps the owner's own address recognizable ("ragnargran…") while staying inside
 * the toolbar's width budget.
 */
export const emailFallbackLength = 10;

export interface AccountLabelInput {
  /** Auth lifecycle, not request state: `loading` covers hydration and sign-in. */
  status: 'loading' | 'signed-out' | 'signed-in' | 'unavailable' | 'error';
  /** Validated public display name for the current account, when one exists. */
  displayName?: string | null | undefined;
  /** Owner-visible email for the current account. */
  email?: string | null | undefined;
  /** True once the profile lookup has settled, successfully or not. */
  profileResolved?: boolean;
}

export interface AccountLabel {
  /** Bounded visible text. */
  text: string;
  /** Full accessible name, which may be longer than the visible text. */
  accessibleName: string;
  /** Which branch produced the label, for tests and evidence. */
  source: 'player-name' | 'email' | 'guest' | 'pending';
}

function truncatedEmailLocalPart(email: string): string | null {
  const localPart = email.trim().split('@')[0]?.trim();
  if (!localPart) return null;
  return localPart.length > emailFallbackLength
    ? `${localPart.slice(0, emailFallbackLength)}…`
    : localPart;
}

export function resolveAccountLabel(input: AccountLabelInput): AccountLabel {
  // Never render a stale identity mid-transition. `account` is neutral and stable,
  // so switching accounts cannot flash the previous account's name (ACC-01.b).
  if (input.status === 'loading') {
    return { text: unknownAccountLabel, accessibleName: 'Account menu', source: 'pending' };
  }

  if (input.status !== 'signed-in') {
    return {
      text: guestAccountLabel,
      // Preserves the sign-in affordance for assistive technology even though the
      // visible label now describes the current state instead of the action.
      accessibleName: 'Sign in — currently browsing as guest',
      source: 'guest',
    };
  }

  const displayName = input.displayName?.trim();
  if (displayName) {
    return {
      text: displayName,
      accessibleName: `Account menu for ${displayName}`,
      source: 'player-name',
    };
  }

  // Only fall back to the email once the profile lookup has actually settled; a
  // pending or failed lookup must not imply the account has no player name.
  if (input.profileResolved) {
    const fallback = input.email ? truncatedEmailLocalPart(input.email) : null;
    if (fallback) {
      return {
        text: fallback,
        accessibleName: `Account menu for ${fallback}`,
        source: 'email',
      };
    }
  }

  return { text: unknownAccountLabel, accessibleName: 'Account menu', source: 'pending' };
}
