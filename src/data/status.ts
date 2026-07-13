export type DataStatusKind = 'loading' | 'ready' | 'stale' | 'failed' | 'fallback'

export interface DataStatus {
  readonly kind: DataStatusKind
  readonly message: string
  readonly playable: boolean
}

export const DATA_STATUS = {
  loading: { kind: 'loading', message: 'Loading word data…', playable: false },
  ready: { kind: 'ready', message: 'Word data is ready.', playable: true },
  stale: { kind: 'stale', message: 'Bundled word data is playable but may be outdated.', playable: true },
  failed: { kind: 'failed', message: 'Word data could not be loaded.', playable: false },
  fallback: { kind: 'fallback', message: 'Using bundled fallback word data.', playable: true },
} as const satisfies Readonly<Record<DataStatusKind, DataStatus>>

export function getDataStatus(kind: DataStatusKind): DataStatus {
  return DATA_STATUS[kind]
}
