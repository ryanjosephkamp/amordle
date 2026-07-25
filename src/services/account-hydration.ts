import type { AccountDocumentSnapshot } from './account-repository';
import { ServiceError } from './service-error';
import type { Json } from '../types/database';

export type AccountHydrationStage = 'progress' | 'settings';

export type AccountHydrationResult = {
  readonly progress: { readonly progress: Json; readonly updatedAt: string } | null;
  readonly settings: AccountDocumentSnapshot | null;
};

type AccountHydrationRepository = {
  loadProgressSnapshot(
    userId: string,
  ): Promise<{ readonly progress: Json; readonly updatedAt: string } | null>;
  loadSettingsSnapshot(userId: string): Promise<AccountDocumentSnapshot | null>;
};

export class AccountHydrationError extends ServiceError {
  constructor(
    readonly stage: AccountHydrationStage,
    cause: unknown,
  ) {
    super(
      'persistence',
      stage === 'settings'
        ? 'Account settings could not be restored.'
        : 'Account progress could not be restored.',
      { cause },
    );
    this.name = 'AccountHydrationError';
  }
}

export async function hydrateAccountScope(
  repository: AccountHydrationRepository,
  userId: string,
): Promise<AccountHydrationResult> {
  const [progress, settings] = await Promise.allSettled([
    repository.loadProgressSnapshot(userId),
    repository.loadSettingsSnapshot(userId),
  ]);

  if (progress.status === 'rejected') {
    throw new AccountHydrationError('progress', progress.reason);
  }
  if (settings.status === 'rejected') {
    throw new AccountHydrationError('settings', settings.reason);
  }

  return {
    progress: progress.value,
    settings: settings.value,
  };
}
