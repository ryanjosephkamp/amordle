import type { IdentityScope, LoadResult, VersionedLocalRepository } from './local-repository';

export type DurableCoordinatorErrorCode =
  | 'corrupt_state'
  | 'storage_unavailable'
  | 'revision_conflict'
  | 'revision_regression'
  | 'invalid_mutation';

export interface DurableCoordinatorError {
  readonly code: DurableCoordinatorErrorCode;
  readonly message: string;
  readonly observedRevision: number;
}

export type DurableCoordinatorSnapshot<T> =
  | {
      readonly status: 'ready';
      readonly value: T;
      readonly revision: number;
    }
  | {
      readonly status: 'error';
      readonly value: T;
      readonly revision: number;
      readonly error: DurableCoordinatorError;
    };

export interface DurableTransition<T, R> {
  readonly applied: boolean;
  readonly value: T;
  readonly result: R;
}

export type DurableTransactionResult<T, R> =
  | {
      readonly ok: true;
      readonly applied: boolean;
      readonly result: R;
      readonly snapshot: DurableCoordinatorSnapshot<T> & { readonly status: 'ready' };
    }
  | {
      readonly ok: false;
      readonly snapshot: DurableCoordinatorSnapshot<T> & { readonly status: 'error' };
    };

function loadError<T>(
  loaded: Exclude<LoadResult<T>, { readonly status: 'ok' } | { readonly status: 'empty' }>,
  observedRevision: number,
): DurableCoordinatorError {
  return loaded.status === 'corrupt'
    ? {
        code: 'corrupt_state',
        message: `Durable state is corrupt (${loaded.reason}); no replacement was attempted.`,
        observedRevision,
      }
    : {
        code: 'storage_unavailable',
        message: 'Durable storage is unavailable; no mutation was confirmed.',
        observedRevision,
      };
}

/**
 * Serializes pure state transitions through a versioned repository. Every
 * transaction reloads current authority, uses compare-and-swap, and retains an
 * explicit last-good value when storage fails. The observed revision can never
 * move backward during one coordinator lifetime.
 */
export class DurableStateCoordinator<T> {
  private current: DurableCoordinatorSnapshot<T>;

  constructor(
    private readonly repository: VersionedLocalRepository<T>,
    private readonly owner: IdentityScope,
    private readonly initialValue: () => T,
  ) {
    this.current = { status: 'ready', value: initialValue(), revision: 0 };
  }

  snapshot(): DurableCoordinatorSnapshot<T> {
    return this.current;
  }

  private fail(
    error: DurableCoordinatorError,
    value = this.current.value,
  ): DurableCoordinatorSnapshot<T> & { readonly status: 'error' } {
    this.current = {
      status: 'error',
      value,
      revision: Math.max(this.current.revision, error.observedRevision),
      error: {
        ...error,
        observedRevision: Math.max(this.current.revision, error.observedRevision),
      },
    };
    return this.current;
  }

  hydrate(): DurableCoordinatorSnapshot<T> {
    const loaded = this.repository.load(this.owner);
    if (loaded.status === 'corrupt' || loaded.status === 'unavailable') {
      return this.fail(loadError(loaded, this.current.revision));
    }
    const revision = loaded.status === 'ok' ? loaded.envelope.revision : 0;
    if (revision < this.current.revision) {
      return this.fail({
        code: 'revision_regression',
        message: `Durable revision regressed from ${this.current.revision} to ${revision}.`,
        observedRevision: this.current.revision,
      });
    }
    this.current = {
      status: 'ready',
      value: loaded.status === 'ok' ? loaded.envelope.payload : this.initialValue(),
      revision,
    };
    return this.current;
  }

  transact<R>(
    reducer: (current: T) => DurableTransition<T, R>,
    options: { readonly updatedAt?: string } = {},
  ): DurableTransactionResult<T, R> {
    const loaded = this.repository.load(this.owner);
    if (loaded.status === 'corrupt' || loaded.status === 'unavailable') {
      const snapshot = this.fail(loadError(loaded, this.current.revision));
      return { ok: false, snapshot };
    }
    const revision = loaded.status === 'ok' ? loaded.envelope.revision : 0;
    const value = loaded.status === 'ok' ? loaded.envelope.payload : this.initialValue();
    if (revision < this.current.revision) {
      const snapshot = this.fail(
        {
          code: 'revision_regression',
          message: `Durable revision regressed from ${this.current.revision} to ${revision}.`,
          observedRevision: this.current.revision,
        },
        this.current.value,
      );
      return { ok: false, snapshot };
    }

    let transition: DurableTransition<T, R>;
    try {
      transition = reducer(value);
    } catch (error) {
      const snapshot = this.fail(
        {
          code: 'invalid_mutation',
          message: error instanceof Error ? error.message : 'Durable mutation was invalid.',
          observedRevision: revision,
        },
        value,
      );
      return { ok: false, snapshot };
    }
    if (!transition.applied) {
      this.current = { status: 'ready', value, revision };
      return { ok: true, applied: false, result: transition.result, snapshot: this.current };
    }

    let saved: ReturnType<VersionedLocalRepository<T>['save']>;
    try {
      saved = this.repository.save(this.owner, transition.value, {
        expectedRevision: revision,
        ...(options.updatedAt !== undefined ? { updatedAt: options.updatedAt } : {}),
      });
    } catch (error) {
      const snapshot = this.fail(
        {
          code: 'invalid_mutation',
          message: error instanceof Error ? error.message : 'Durable mutation was invalid.',
          observedRevision: revision,
        },
        value,
      );
      return { ok: false, snapshot };
    }
    if (!saved.ok) {
      const latest = this.repository.load(this.owner);
      const latestRevision =
        latest.status === 'ok'
          ? latest.envelope.revision
          : Math.max(revision, saved.currentRevision ?? revision);
      const latestValue = latest.status === 'ok' ? latest.envelope.payload : value;
      const code =
        saved.reason === 'conflict'
          ? 'revision_conflict'
          : saved.reason === 'corrupt'
            ? 'corrupt_state'
            : 'storage_unavailable';
      const snapshot = this.fail(
        {
          code,
          message:
            saved.reason === 'conflict'
              ? 'A newer durable revision won the mutation race.'
              : saved.reason === 'corrupt'
                ? 'Durable state is corrupt; no replacement was attempted.'
                : 'Durable storage is unavailable; no mutation was confirmed.',
          observedRevision: latestRevision,
        },
        latestValue,
      );
      return { ok: false, snapshot };
    }
    if (saved.envelope.revision <= revision || saved.envelope.revision < this.current.revision) {
      const snapshot = this.fail(
        {
          code: 'revision_regression',
          message: 'A successful durable mutation did not advance the revision.',
          observedRevision: Math.max(revision, saved.envelope.revision),
        },
        value,
      );
      return { ok: false, snapshot };
    }
    this.current = {
      status: 'ready',
      value: saved.envelope.payload,
      revision: saved.envelope.revision,
    };
    return { ok: true, applied: true, result: transition.result, snapshot: this.current };
  }
}
