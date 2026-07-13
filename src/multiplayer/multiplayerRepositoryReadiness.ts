import type { MultiplayerRepository, MultiplayerRepositorySnapshot } from './multiplayerRepository'

export async function loadMultiplayerRepositoryWithRetry(
  repository: Pick<MultiplayerRepository, 'load'>,
): Promise<MultiplayerRepositorySnapshot> {
  try {
    return await repository.load()
  } catch {
    return repository.load()
  }
}
