import {
  beginSoloSession,
  initialSoloCompletionLedger,
  settleSoloCompletion,
  soloCompletionLedgerSchema,
  type SoloCompletionLedgerState,
} from '../../domain/solo-completion-ledger';
import type { CompletionRewardInput, ProgressionState } from '../../domain/progression';
import { DurableStateCoordinator } from '../../persistence/durable-state-coordinator';
import {
  createVersionedLocalRepository,
  type IdentityScope,
} from '../../persistence/local-repository';

function repositoryForLane(lane: string) {
  const safeLane = encodeURIComponent(lane).slice(0, 300);
  return createVersionedLocalRepository<SoloCompletionLedgerState>({
    schema: soloCompletionLedgerSchema,
    storage: () => {
      try {
        return window.localStorage;
      } catch {
        return undefined;
      }
    },
    keyPrefix: `amordle:solo-completion:${safeLane}`,
  });
}

export class SoloCompletionCoordinator {
  private readonly durable: DurableStateCoordinator<SoloCompletionLedgerState>;

  constructor(
    identity: IdentityScope,
    lane: string,
    private readonly progression: ProgressionState,
  ) {
    this.durable = new DurableStateCoordinator(repositoryForLane(lane), identity, () =>
      initialSoloCompletionLedger(progression),
    );
  }

  prepare(sessionId: string, startedAt: string): boolean {
    const hydrated = this.durable.hydrate();
    if (hydrated.status !== 'ready') return false;
    if (hydrated.value.retiredSessions[sessionId] === 'completed') return true;
    if (hydrated.value.active?.sessionId === sessionId) return true;
    const sequence = hydrated.value.latestSequence + 1;
    const result = this.durable.transact((state) => {
      const transition = beginSoloSession(state, { sessionId, sequence, startedAt });
      return {
        applied: transition.ok && transition.applied,
        value: transition.state,
        result: transition,
      };
    });
    return result.ok && result.result.ok;
  }

  isCompleted(sessionId: string): boolean {
    const hydrated = this.durable.hydrate();
    return hydrated.status === 'ready' && hydrated.value.retiredSessions[sessionId] === 'completed';
  }

  settle(completion: CompletionRewardInput, completedAt: string): boolean {
    const hydrated = this.durable.hydrate();
    if (hydrated.status !== 'ready') return false;
    if (hydrated.value.retiredSessions[completion.gameId] === 'completed') return true;
    const active = hydrated.value.active;
    if (!active || active.sessionId !== completion.gameId) return false;
    const result = this.durable.transact((state) => {
      const transition = settleSoloCompletion(state, {
        sequence: active.sequence,
        completedAt,
        completion,
      });
      return {
        applied: transition.ok && transition.applied,
        value: transition.state,
        result: transition,
      };
    });
    return result.ok && result.result.ok;
  }
}
