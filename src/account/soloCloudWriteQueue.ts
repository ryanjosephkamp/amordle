export interface SoloCloudWriteQueue {
  readonly enqueue: <T>(ownerKey: string, task: () => Promise<T>) => Promise<T>
  readonly hasPending: (ownerKey?: string) => boolean
  readonly waitFor: (ownerKey: string) => Promise<void>
}

export function createSoloCloudWriteQueue(): SoloCloudWriteQueue {
  const pendingCounts = new Map<string, number>()
  const tails = new Map<string, Promise<void>>()

  return {
    enqueue<T>(ownerKey: string, task: () => Promise<T>): Promise<T> {
      const previous = tails.get(ownerKey) ?? Promise.resolve()
      pendingCounts.set(ownerKey, (pendingCounts.get(ownerKey) ?? 0) + 1)
      const result = previous.catch(() => undefined).then(task)
      const tail = result.then(
        () => undefined,
        () => undefined,
      ).finally(() => {
        const remaining = Math.max(0, (pendingCounts.get(ownerKey) ?? 1) - 1)
        if (remaining === 0) {
          pendingCounts.delete(ownerKey)
          if (tails.get(ownerKey) === tail) {
            tails.delete(ownerKey)
          }
        } else {
          pendingCounts.set(ownerKey, remaining)
        }
      })
      tails.set(ownerKey, tail)
      return result
    },
    hasPending(ownerKey?: string): boolean {
      if (ownerKey !== undefined) {
        return (pendingCounts.get(ownerKey) ?? 0) > 0
      }
      return pendingCounts.size > 0
    },
    waitFor(ownerKey: string): Promise<void> {
      return tails.get(ownerKey) ?? Promise.resolve()
    },
  }
}
