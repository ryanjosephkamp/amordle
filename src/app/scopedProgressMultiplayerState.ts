import type { ActiveProgressScope, GuestProgressState } from '../account'
import { createEmptyMultiplayerState, type MultiplayerState } from '../multiplayer'

export interface SelectScopedProgressMultiplayerStateInput {
  readonly currentAuthorityUserId?: string
  readonly currentMultiplayerState: MultiplayerState
  readonly nextProgress: GuestProgressState
  readonly nextScope: ActiveProgressScope
}

export function selectScopedProgressMultiplayerState(
  input: SelectScopedProgressMultiplayerStateInput,
): MultiplayerState {
  const nextAuthenticatedUserId = input.nextScope.kind === 'authenticated'
    ? input.nextScope.userId
    : undefined
  if (nextAuthenticatedUserId) {
    if (input.currentAuthorityUserId === nextAuthenticatedUserId) {
      return input.currentMultiplayerState
    }
    // Authenticated progress is loaded for nextAuthenticatedUserId and guarded
    // by the current hydration request in App. Use its Multiplayer projection
    // only while this account's repository is still pending. As soon as the
    // repository publishes, currentAuthorityUserId is set and later progress
    // hydration can no longer replace that authoritative snapshot.
    return input.nextProgress.multiplayer ?? createEmptyMultiplayerState()
  }

  return input.nextProgress.multiplayer ?? createEmptyMultiplayerState()
}
