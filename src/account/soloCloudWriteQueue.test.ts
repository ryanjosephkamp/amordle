import { describe, expect, it, vi } from 'vitest'
import { createSoloCloudWriteQueue } from './soloCloudWriteQueue'

describe('solo cloud write queue', () => {
  it('does not invoke a later write for the same account until the prior write settles', async () => {
    const queue = createSoloCloudWriteQueue()
    let releaseFirst: (() => void) | undefined
    const first = vi.fn(() => new Promise<void>((resolve) => {
      releaseFirst = resolve
    }))
    const second = vi.fn(async () => undefined)

    const firstResult = queue.enqueue('account-a', first)
    const secondResult = queue.enqueue('account-a', second)

    await Promise.resolve()
    await Promise.resolve()
    expect(first).toHaveBeenCalledOnce()
    expect(second).not.toHaveBeenCalled()
    expect(queue.hasPending('account-a')).toBe(true)

    releaseFirst?.()
    await Promise.all([firstResult, secondResult])

    expect(second).toHaveBeenCalledOnce()
    expect(queue.hasPending('account-a')).toBe(false)
  })

  it('does not let one account block another account queue', async () => {
    const queue = createSoloCloudWriteQueue()
    let releaseFirst: (() => void) | undefined
    const first = queue.enqueue('account-a', () => new Promise<void>((resolve) => {
      releaseFirst = resolve
    }))
    const second = vi.fn(async () => undefined)

    await queue.enqueue('account-b', second)
    await queue.waitFor('account-b')

    expect(second).toHaveBeenCalledOnce()
    expect(queue.hasPending('account-a')).toBe(true)
    expect(queue.hasPending('account-b')).toBe(false)
    releaseFirst?.()
    await first
  })
})
