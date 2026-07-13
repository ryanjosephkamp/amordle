export interface FetchJsonOptions {
  readonly fetcher?: typeof fetch
  readonly timeoutMs?: number
}

export const DEFAULT_DEFINITION_TIMEOUT_MS = 3_000

function getFetcher(fetcher?: typeof fetch): typeof fetch {
  if (fetcher) {
    return fetcher
  }

  if (typeof fetch === 'undefined') {
    throw new Error('Fetch is unavailable in this environment.')
  }

  return fetch
}

export async function fetchJson(url: string, options: FetchJsonOptions = {}): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_DEFINITION_TIMEOUT_MS)

  try {
    const response = await getFetcher(options.fetcher)(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}.`)
    }

    return await response.json()
  } finally {
    clearTimeout(timeout)
  }
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown definition lookup error.'
}
