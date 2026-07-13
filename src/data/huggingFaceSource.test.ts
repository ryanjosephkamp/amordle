import { describe, expect, it } from 'vitest'
import {
  HUGGING_FACE_DATASET_FOLDER,
  HUGGING_FACE_DATASET_ID,
  HUGGING_FACE_EXPECTED_FILE_COUNT,
  HUGGING_FACE_EXPECTED_LENGTHS,
  HUGGING_FACE_RAW_BASE,
  buildHuggingFaceFileUrl,
  defaultHuggingFaceFilename,
  fetchHuggingFaceRemoteMetadata,
} from './huggingFaceSource.js'

describe('Hugging Face source configuration', () => {
  it('targets the latest/brrrdle folder of the approved dataset', () => {
    expect(HUGGING_FACE_DATASET_ID).toBe('ryanjosephkamp/english-openlist')
    expect(HUGGING_FACE_DATASET_FOLDER).toBe('latest/brrrdle')
    expect(HUGGING_FACE_RAW_BASE).toBe(
      'https://huggingface.co/datasets/ryanjosephkamp/english-openlist/resolve/main',
    )
  })

  it('expects 34 length-indexed dictionaries from length 2 through 35 inclusive', () => {
    expect(HUGGING_FACE_EXPECTED_FILE_COUNT).toBe(34)
    expect(HUGGING_FACE_EXPECTED_LENGTHS[0]).toBe(2)
    expect(HUGGING_FACE_EXPECTED_LENGTHS[HUGGING_FACE_EXPECTED_LENGTHS.length - 1]).toBe(35)
    expect(HUGGING_FACE_EXPECTED_LENGTHS).toHaveLength(34)
  })

  it('builds raw file URLs under latest/brrrdle/ with the default filename', () => {
    expect(defaultHuggingFaceFilename(5)).toBe('words_length_5.json')
    expect(buildHuggingFaceFileUrl(5)).toBe(
      'https://huggingface.co/datasets/ryanjosephkamp/english-openlist/resolve/main/latest/brrrdle/words_length_5.json',
    )
  })

  it('allows callers to override the raw base and filename builder', () => {
    expect(
      buildHuggingFaceFileUrl(35, {
        rawBase: 'https://example.test/dataset',
        filename: (length) => `length-${length}.json`,
      }),
    ).toBe('https://example.test/dataset/latest/brrrdle/length-35.json')
  })
})

describe('fetchHuggingFaceRemoteMetadata', () => {
  it('projects the Hugging Face dataset info onto RemoteWordListMetadata', async () => {
    const metadata = await fetchHuggingFaceRemoteMetadata(async () => ({
      sha: 'abc123',
      lastModified: '2026-05-25T23:05:00Z',
    }))
    expect(metadata.version).toBe('abc123')
    expect(metadata.generatedAt).toBe('2026-05-25T23:05:00Z')
    expect(metadata.lengths).toHaveLength(34)
    expect(metadata.lengths[0]).toBe(2)
    expect(metadata.lengths[33]).toBe(35)
  })

  it('throws a clear error when the dataset info payload is malformed', async () => {
    await expect(
      fetchHuggingFaceRemoteMetadata(async () => ({ not: 'valid' })),
    ).rejects.toThrowError(/malformed/)
  })

  it('propagates network errors from the fetcher', async () => {
    await expect(
      fetchHuggingFaceRemoteMetadata(async () => {
        throw new Error('offline')
      }),
    ).rejects.toThrowError('offline')
  })
})
