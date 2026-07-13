import { describe, expect, it } from 'vitest'
import type { RefreshSuccess } from './refresh.js'
import {
  FailingInMemoryWordListStore,
  InMemoryWordListStore,
  projectManifest,
} from './refreshStore.js'
import type { WordListFile } from './types.js'

function makeFile(length: number, word: string): WordListFile {
  return {
    metadata: {
      length,
      source: 'huggingface:ryanjosephkamp/english-openlist',
      version: 'rev-test',
      generatedAt: '2026-05-26T00:00:00Z',
    },
    answers: [{ word }],
    validGuesses: [word],
  }
}

function refreshFixture(revision = 'rev-test'): RefreshSuccess {
  const files = [makeFile(2, 'go'), makeFile(5, 'crane')]
  return {
    ok: true,
    source: { datasetId: 'ryanjosephkamp/english-openlist', revision, generatedAt: '2026-05-26T00:00:00Z' },
    files: files.map((file) => ({ length: file.metadata.length, ok: true as const, file })),
    fetchedAt: '2026-05-26T00:01:00.000Z',
  }
}

describe('projectManifest', () => {
  it('builds a manifest with per-length URLs from a successful refresh', () => {
    const manifest = projectManifest(refreshFixture(), (length) => `https://example.test/words/${length}.json`)
    expect(manifest.revision).toBe('rev-test')
    expect(manifest.entries).toHaveLength(2)
    expect(manifest.entries[0]).toMatchObject({ length: 2, url: 'https://example.test/words/2.json', status: 'served' })
    expect(manifest.entries[1]).toMatchObject({ length: 5, url: 'https://example.test/words/5.json' })
    expect(manifest.source.datasetId).toBe('ryanjosephkamp/english-openlist')
  })
})

describe('InMemoryWordListStore', () => {
  it('starts with no manifest and an empty key set', async () => {
    const store = new InMemoryWordListStore()
    await expect(store.loadManifest()).resolves.toBeNull()
    expect(store.listKeys()).toEqual([])
  })

  it('persists every length under a revision-prefixed key before updating the manifest pointer', async () => {
    const store = new InMemoryWordListStore()
    const result = await store.atomicSwap({ refresh: refreshFixture('rev-a') })
    expect(result.status).toBe('swapped')
    if (result.status !== 'swapped') return
    expect(result.previousRevision).toBeUndefined()
    expect(result.manifest.revision).toBe('rev-a')
    expect([...store.listKeys()].sort()).toEqual([
      'rev-a/words_length_2.json',
      'rev-a/words_length_5.json',
    ])
  })

  it('reports the prior revision when a subsequent swap supersedes a manifest', async () => {
    const store = new InMemoryWordListStore()
    await store.atomicSwap({ refresh: refreshFixture('rev-a') })
    const result = await store.atomicSwap({ refresh: refreshFixture('rev-b') })
    expect(result.status).toBe('swapped')
    if (result.status !== 'swapped') return
    expect(result.previousRevision).toBe('rev-a')
    expect((await store.loadManifest())?.revision).toBe('rev-b')
  })
})

describe('FailingInMemoryWordListStore (atomic-rollback contract)', () => {
  it('leaves the previously-served manifest intact when a per-length upload fails', async () => {
    const store = new FailingInMemoryWordListStore(5)
    const result = await store.atomicSwap({ refresh: refreshFixture('rev-failure') })
    expect(result.status).toBe('failed')
    if (result.status !== 'failed') return
    expect(result.stage).toBe('upload-length')
    expect(result.failedLength).toBe(5)
    expect(result.previousServedSetIntact).toBe(true)
    expect(await store.loadManifest()).toBeNull()
  })
})
