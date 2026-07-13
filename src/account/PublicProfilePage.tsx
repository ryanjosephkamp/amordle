import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_GO_PUZZLE_COUNT } from '../game/constants'
import type { GameMode } from '../game/types'
import {
  PUBLIC_RANKED_LEADERBOARD_BUCKETS,
  type PublicRankedLeaderboardRepository,
} from '../leaderboards/publicRankedLeaderboard'
import {
  PRACTICE_MULTIPLAYER_TIME_LIMIT_OPTIONS,
  type PracticeMultiplayerTimeLimitMs,
} from '../multiplayer/multiplayer'
import { Button, LoadingState, Panel } from '../ui'
import { classNames } from '../ui/classNames'
import {
  normalizePublicProfileId,
  type OwnerPublicProfile,
  type PublicPlayerProfile,
  type PublicProfileRepository,
} from './publicProfile'
import {
  createPrivatePracticeRequestIdempotencyKey,
  getPrivateMatchRequestErrorMessage,
  getPrivatePracticeRequestSettingsLabel,
  isOwnerPublicProfileEligibleForPrivateMatch,
  normalizePrivatePracticeRequestSettings,
  PRIVATE_MATCH_REQUESTER_PUBLIC_PROFILE_REQUIRED_MESSAGE,
  type PrivatePracticeRequestSettings,
} from './publicProfilePrivateMatch'
import {
  createPublicProfileRatingMetadata,
  type PublicProfileRatingMetadata,
} from './publicProfileRatingMetadata'
import type {
  MultiplayerRepository,
  PrivateMatchRequestResult,
} from '../multiplayer/multiplayerRepository'

export type PublicProfilePageStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error'
export type PublicProfileRatingMetadataStatus = 'idle' | 'loading' | 'ready' | 'error'

type PrivateMatchActions = Pick<MultiplayerRepository, 'createPrivateMatchRequest' | 'listPrivateMatchRequests'>
  & Partial<Pick<MultiplayerRepository, 'listPrivateRequestBlocks' | 'setPrivateRequestBlock'>>
type PublicProfilePageRepository = Pick<PublicProfileRepository, 'loadPublicProfile'> & Partial<Pick<PublicProfileRepository, 'loadMine'>>
type PublicProfileAuthStatus = 'anonymous' | 'authenticated' | 'unconfigured'

const PRIVATE_MATCH_REQUEST_POLL_INTERVAL_MS = 5_000

function isPrivateMatchRequestTerminal(request: PrivateMatchRequestResult): boolean {
  return request.expired || request.requestStatus !== 'requested'
}

function formatPrivateMatchRequestLifecycleMessage(request: PrivateMatchRequestResult): string {
  switch (request.requestStatus) {
    case 'created':
      return 'Private Practice match created.'
    case 'declined':
      return 'Private Practice request declined.'
    case 'cancelled':
      return 'Private Practice request cancelled.'
    case 'expired':
      return 'Private Practice request expired.'
    case 'requested':
      return request.expired ? 'Private Practice request expired.' : 'Private Practice request pending.'
  }
}

function findPrivateMatchRequestById(
  requests: readonly PrivateMatchRequestResult[],
  requestId: string,
): PrivateMatchRequestResult | undefined {
  return requests.find((request) => request.requestId === requestId)
}

const DEFAULT_PRIVATE_PRACTICE_REQUEST_SETTINGS: PrivatePracticeRequestSettings = {
  hardMode: false,
  mode: 'og',
  timeLimitMs: null,
  wordLength: 5,
}

export interface PublicProfilePageProps {
  readonly authStatus?: PublicProfileAuthStatus
  readonly backLabel?: string
  readonly privateMatchActions?: PrivateMatchActions
  readonly privateMatchViewerSessionKey?: string
  readonly onBack?: () => void
  readonly onEnterPrivateMatch?: (gameId: string) => void
  readonly onGoToPracticeMultiplayer?: () => void
  readonly publicProfileId?: string
  readonly publicRankedLeaderboardRepository?: PublicRankedLeaderboardRepository
  readonly repository?: PublicProfilePageRepository
}

interface PublicProfileCardProps {
  readonly authStatus?: PublicProfileAuthStatus
  readonly backLabel?: string
  readonly errorMessage?: string
  readonly privateMatchBusy?: boolean
  readonly privateMatchMessage?: string
  readonly privateMatchRequest?: PrivateMatchRequestResult
  readonly privateMatchRequestsAvailable?: boolean
  readonly privatePracticeSettings?: PrivatePracticeRequestSettings
  readonly onPrivatePracticeSettingsChange?: (settings: PrivatePracticeRequestSettings) => void
  readonly onEnterPrivateMatch?: (gameId: string) => void
  readonly onGoToPracticeMultiplayer?: () => void
  readonly onRequestPrivateMatch?: () => void
  readonly blockedForPrivateRequests?: boolean
  readonly onTogglePrivateRequestBlock?: () => void
  readonly onBack?: () => void
  readonly profile?: PublicPlayerProfile
  readonly ratingMetadata?: readonly PublicProfileRatingMetadata[]
  readonly ratingMetadataStatus?: PublicProfileRatingMetadataStatus
  readonly status: PublicProfilePageStatus
}

const accentAvatarClasses = {
  amber: 'from-amber-300 to-orange-700 text-slate-950',
  aurora: 'from-emerald-300 to-cyan-700 text-slate-950',
  cyan: 'from-cyan-200 to-sky-700 text-slate-950',
  ice: 'from-slate-100 to-cyan-500 text-slate-950',
  rose: 'from-rose-200 to-fuchsia-700 text-slate-950',
  violet: 'from-violet-200 to-indigo-700 text-slate-950',
} as const

function formatPublicProfileUpdatedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Unknown'
  }
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(date)
}

function getInitials(displayName: string): string {
  const parts = displayName.split(/[\s._-]+/u).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]!.charAt(0)}${parts[parts.length - 1]!.charAt(0)}`.toLocaleUpperCase('en-US')
  }
  return displayName.charAt(0).toLocaleUpperCase('en-US') || '?'
}

function PublicProfileAvatar({ profile }: { readonly profile: PublicPlayerProfile }) {
  if (profile.avatarUrl) {
    return (
      <img
        alt={`${profile.displayName} public avatar`}
        className="h-16 w-16 rounded-2xl border border-white/15 object-cover"
        loading="lazy"
        referrerPolicy="no-referrer"
        src={profile.avatarUrl}
      />
    )
  }

  return (
    <span className={classNames(
      'flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br text-xl font-black shadow-inner shadow-white/20',
      accentAvatarClasses[profile.accentColor],
    )}>
      {getInitials(profile.displayName)}
    </span>
  )
}

export function PublicProfileCard({
  authStatus = 'unconfigured',
  backLabel = 'Back to leaderboard',
  errorMessage,
  privateMatchBusy = false,
  privateMatchMessage,
  privateMatchRequest,
  privateMatchRequestsAvailable = false,
  privatePracticeSettings = DEFAULT_PRIVATE_PRACTICE_REQUEST_SETTINGS,
  onPrivatePracticeSettingsChange,
  onEnterPrivateMatch,
  onGoToPracticeMultiplayer,
  onRequestPrivateMatch,
  blockedForPrivateRequests = false,
  onTogglePrivateRequestBlock,
  onBack,
  profile,
  ratingMetadata = [],
  ratingMetadataStatus = 'idle',
  status,
}: PublicProfileCardProps) {
  const updatedLabel = profile ? formatPublicProfileUpdatedAt(profile.updatedAt) : undefined
  const canRequestPrivateMatch = authStatus === 'authenticated' && privateMatchRequestsAvailable && onRequestPrivateMatch
  const privatePracticeSettingsLabel = getPrivatePracticeRequestSettingsLabel(privatePracticeSettings)
  const effectivePrivateMatchMessage = privateMatchMessage ?? (privateMatchRequest
    ? formatPrivateMatchRequestLifecycleMessage(privateMatchRequest)
    : undefined)
  const updatePrivatePracticeSettings = (settings: PrivatePracticeRequestSettings) => {
    onPrivatePracticeSettingsChange?.(settings)
  }

  return (
    <section className="space-y-4" aria-labelledby="public-profile-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--color-ice-200)]">public profile</p>
          <h2 id="public-profile-title" className="text-3xl font-bold text-white">Player profile</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            This display-only profile uses active opt-in public fields. Private account data, raw auth identity, game sessions, queues, rating internals, and tokens stay hidden.
          </p>
        </div>
        {onBack ? (
          <Button onClick={onBack} size="sm" variant="secondary">
            {backLabel}
          </Button>
        ) : null}
      </div>

      <Panel className="space-y-4 text-sm leading-6 text-slate-300" tone="muted">
        {status === 'loading' ? <LoadingState label="Loading public profile..." /> : null}

        {status === 'error' ? (
          <p className="rounded-lg border border-rose-300/30 bg-rose-950/20 p-4 text-rose-100" role="alert">
            {errorMessage ?? 'Unable to load this public profile right now.'}
          </p>
        ) : null}

        {status === 'unavailable' || status === 'idle' ? (
          <p className="rounded-lg border border-white/10 bg-black/25 p-4 text-slate-300">
            This public profile is unavailable. The player may be private, hidden, suspended, missing, or no longer visible.
          </p>
        ) : null}

        {status === 'ready' && profile ? (
          <div className="space-y-4">
            <div className="flex min-w-0 items-center gap-4">
              <PublicProfileAvatar profile={profile} />
              <div className="min-w-0">
                <p className="break-words text-2xl font-black text-white">{profile.displayName}</p>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Updated {updatedLabel}</p>
              </div>
            </div>

            {profile.bio ? (
              <p className="rounded-lg border border-white/10 bg-black/25 p-4 text-slate-200">{profile.bio}</p>
            ) : (
              <p className="rounded-lg border border-white/10 bg-black/25 p-4 text-slate-400">No public bio yet.</p>
            )}

            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-black/25 p-3">
                <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Flair</dt>
                <dd className="mt-1 font-semibold text-cyan-50">{profile.flairKey === 'none' ? 'None' : profile.flairKey}</dd>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/25 p-3">
                <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">Profile visibility</dt>
                <dd className="mt-1 font-semibold text-cyan-50">Active public profile</dd>
              </div>
            </dl>

            <div className="rounded-lg border border-white/10 bg-black/25 p-4">
              <p className="font-bold text-white">Public ranked multiplayer metadata</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                These rows are derived only from public ranked Practice and Daily leaderboards. They are not private Solo stats, full match history, queue internals, or raw account data.
              </p>
              {authStatus !== 'authenticated' ? (
                <p className="mt-3 rounded-md border border-white/10 bg-black/25 p-3 text-xs text-slate-300">
                  Sign in to view public ranked multiplayer metadata for visible public profiles.
                </p>
              ) : ratingMetadataStatus === 'loading' ? (
                <LoadingState label="Loading public ranked multiplayer metadata..." />
              ) : ratingMetadataStatus === 'error' ? (
                <p className="mt-3 rounded-md border border-rose-300/30 bg-rose-950/20 p-3 text-xs text-rose-100" role="alert">
                  Unable to load public ranked multiplayer metadata right now.
                </p>
              ) : ratingMetadata.length > 0 ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {ratingMetadata.map((metadata) => (
                    <article className="rounded-lg border border-white/10 bg-black/30 p-3" key={metadata.bucketLabel}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-cyan-100">{metadata.bucketLabel}</p>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{metadata.rankLabel} · {metadata.rankBandLabel} band</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-black text-white">{metadata.ratingLabel}</p>
                          <p className="text-xs text-slate-400">{metadata.provisionalLabel}</p>
                        </div>
                      </div>
                      <dl className="mt-3 grid gap-2 text-xs text-slate-300">
                        <div className="flex justify-between gap-3">
                          <dt>Record</dt>
                          <dd className="font-semibold text-slate-100">{metadata.recordLabel}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt>Games</dt>
                          <dd className="font-semibold text-slate-100">{metadata.gamesLabel}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt>Movement</dt>
                          <dd className="font-semibold text-slate-100">{metadata.latestMovementLabel}</dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt>Peak</dt>
                          <dd className="font-semibold text-slate-100">{metadata.peakLabel}</dd>
                        </div>
                      </dl>
                      <p className="mt-3 text-xs text-slate-500">Leaderboard freshness: {metadata.updatedLabel}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-3 rounded-md border border-white/10 bg-black/25 p-3 text-xs text-slate-300">
                  No public ranked multiplayer metadata is visible for this player yet.
                </p>
              )}
            </div>

            <div className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 p-4">
              <p className="font-bold text-cyan-50">Private Practice match</p>
              <p className="mt-1 text-xs leading-5 text-cyan-100">
                Send an authenticated, unranked Practice request with the selected settings. Private requests are visible only to the two signed-in players and never expose raw account ids.
              </p>
              {canRequestPrivateMatch ? (
                <div className="mt-3 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-cyan-100">
                      <span>Mode</span>
                      <select
                        aria-label="Private Practice mode"
                        className="w-full rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-cyan-50"
                        disabled={privateMatchBusy}
                        onChange={(event) => {
                          const mode = event.currentTarget.value as GameMode
                          updatePrivatePracticeSettings({
                            ...privatePracticeSettings,
                            goPuzzleCount: mode === 'go' ? privatePracticeSettings.goPuzzleCount ?? DEFAULT_GO_PUZZLE_COUNT : undefined,
                            mode,
                          })
                        }}
                        value={privatePracticeSettings.mode}
                      >
                        <option value="og">OG</option>
                        <option value="go">GO</option>
                      </select>
                    </label>

                    <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-cyan-100">
                      <span>Word length</span>
                      <input
                        aria-label="Private Practice word length"
                        className="w-full rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-cyan-50"
                        disabled={privateMatchBusy}
                        inputMode="numeric"
                        max={35}
                        min={2}
                        onChange={(event) => {
                          updatePrivatePracticeSettings({
                            ...privatePracticeSettings,
                            wordLength: Number(event.currentTarget.value || 5),
                          })
                        }}
                        type="number"
                        value={privatePracticeSettings.wordLength}
                      />
                    </label>

                    <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-cyan-100">
                      <span>Time control</span>
                      <select
                        aria-label="Private Practice time control"
                        className="w-full rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-cyan-50"
                        disabled={privateMatchBusy}
                        onChange={(event) => {
                          updatePrivatePracticeSettings({
                            ...privatePracticeSettings,
                            timeLimitMs: event.currentTarget.value === ''
                              ? null
                              : Number(event.currentTarget.value) as PracticeMultiplayerTimeLimitMs,
                          })
                        }}
                        value={privatePracticeSettings.timeLimitMs ?? ''}
                      >
                        {PRACTICE_MULTIPLAYER_TIME_LIMIT_OPTIONS.map((option) => (
                          <option key={option.value ?? 'none'} value={option.value ?? ''}>{option.label}</option>
                        ))}
                      </select>
                    </label>

                    <label className="flex min-h-12 items-center gap-2 rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm font-semibold text-cyan-50">
                      <input
                        aria-label="Private Practice Hard Mode"
                        checked={privatePracticeSettings.hardMode}
                        disabled={privateMatchBusy}
                        onChange={(event) => {
                          updatePrivatePracticeSettings({
                            ...privatePracticeSettings,
                            hardMode: event.currentTarget.checked,
                          })
                        }}
                        type="checkbox"
                      />
                      Hard Mode
                    </label>
                  </div>

                  <p className="rounded-md border border-white/10 bg-black/20 p-2 text-xs font-semibold text-cyan-50">
                    Current request: {privatePracticeSettingsLabel}
                  </p>

                  <Button disabled={privateMatchBusy} onClick={onRequestPrivateMatch} size="sm" variant="primary">
                    {privateMatchBusy ? 'Sending request' : 'Request Practice match'}
                  </Button>
                </div>
              ) : (
                <p className="mt-3 rounded-md border border-white/10 bg-black/20 p-2 text-xs text-cyan-100">
                  {authStatus === 'authenticated'
                    ? 'Private match requests require authenticated Supabase multiplayer.'
                    : 'Sign in to send private Practice match requests.'}
                </p>
              )}
              {effectivePrivateMatchMessage ? (
                <p className="mt-3 rounded-md border border-white/10 bg-black/20 p-2 font-semibold text-cyan-50" role="status">
                  {effectivePrivateMatchMessage}
                </p>
              ) : null}
              {privateMatchRequest ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {onGoToPracticeMultiplayer ? (
                    <Button onClick={onGoToPracticeMultiplayer} size="sm" variant="secondary">
                      Go to Practice Multiplayer
                    </Button>
                  ) : null}
                  {privateMatchRequest.requestStatus === 'created'
                    && privateMatchRequest.createdGameId
                    && onEnterPrivateMatch ? (
                      <Button
                        onClick={() => onEnterPrivateMatch(privateMatchRequest.createdGameId!)}
                        size="sm"
                        variant="primary"
                      >
                        Enter private match
                      </Button>
                    ) : null}
                </div>
              ) : null}
              {authStatus === 'authenticated' && onTogglePrivateRequestBlock ? (
                <div className="mt-3 border-t border-white/10 pt-3">
                  <Button disabled={privateMatchBusy} onClick={onTogglePrivateRequestBlock} size="sm" variant="secondary">
                    {blockedForPrivateRequests ? 'Unblock private requests' : 'Block private requests'}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </Panel>
    </section>
  )
}

export function PublicProfilePage({
  authStatus = 'unconfigured',
  backLabel,
  privateMatchActions,
  privateMatchViewerSessionKey,
  onBack,
  onEnterPrivateMatch,
  onGoToPracticeMultiplayer,
  publicProfileId,
  publicRankedLeaderboardRepository,
  repository,
}: PublicProfilePageProps) {
  const normalizedPublicProfileId = useMemo(() => normalizePublicProfileId(publicProfileId), [publicProfileId])
  const [loadResult, setLoadResult] = useState<{
    readonly errorMessage?: string
    readonly profile?: PublicPlayerProfile
    readonly publicProfileId?: string
    readonly status: Exclude<PublicProfilePageStatus, 'idle' | 'loading'>
  }>({ status: 'unavailable' })
  const [privateMatchState, setPrivateMatchState] = useState<{
    readonly busy: boolean
    readonly errorMessage?: string
    readonly publicProfileId?: string
    readonly request?: PrivateMatchRequestResult
    readonly requestVersion: number
    readonly viewerSessionKey?: string
  }>({
    busy: false,
    requestVersion: 0,
    viewerSessionKey: privateMatchViewerSessionKey,
  })
  const privateMatchRequestVersionRef = useRef(0)
  const privateMatchContextRef = useRef({
    authStatus,
    publicProfileId: normalizedPublicProfileId,
    viewerSessionKey: privateMatchViewerSessionKey,
  })
  const [privatePracticeSettings, setPrivatePracticeSettings] = useState<PrivatePracticeRequestSettings>(DEFAULT_PRIVATE_PRACTICE_REQUEST_SETTINGS)
  const [blockedForPrivateRequests, setBlockedForPrivateRequests] = useState(false)
  const [ratingMetadataResult, setRatingMetadataResult] = useState<{
    readonly metadata: readonly PublicProfileRatingMetadata[]
    readonly publicProfileId?: string
    readonly status: PublicProfileRatingMetadataStatus
  }>({ metadata: [], status: 'idle' })

  useEffect(() => {
    if (!normalizedPublicProfileId || !repository) {
      return undefined
    }

    let cancelled = false
    void repository.loadPublicProfile(normalizedPublicProfileId)
      .then((nextProfile) => {
        if (cancelled) {
          return
        }
        setLoadResult({
          profile: nextProfile,
          publicProfileId: normalizedPublicProfileId,
          status: nextProfile ? 'ready' : 'unavailable',
        })
      })
      .catch(() => {
        if (cancelled) {
          return
        }
        setLoadResult({
          errorMessage: 'Unable to load this public profile right now.',
          publicProfileId: normalizedPublicProfileId,
          status: 'error',
        })
      })

    return () => {
      cancelled = true
    }
  }, [normalizedPublicProfileId, repository])

  useLayoutEffect(() => {
    const requestVersion = privateMatchRequestVersionRef.current + 1
    privateMatchRequestVersionRef.current = requestVersion
    privateMatchContextRef.current = {
      authStatus,
      publicProfileId: normalizedPublicProfileId,
      viewerSessionKey: privateMatchViewerSessionKey,
    }
    setPrivateMatchState({
      busy: false,
      requestVersion,
      viewerSessionKey: privateMatchViewerSessionKey,
    })
  }, [authStatus, normalizedPublicProfileId, privateMatchViewerSessionKey])

  useEffect(() => {
    const profile = loadResult.status === 'ready' && loadResult.publicProfileId === normalizedPublicProfileId
      ? loadResult.profile
      : undefined
    if (!profile || authStatus !== 'authenticated' || !publicRankedLeaderboardRepository) {
      return undefined
    }

    let cancelled = false
    void Promise.all(PUBLIC_RANKED_LEADERBOARD_BUCKETS.map((bucket) => (
      publicRankedLeaderboardRepository.loadRankedPracticeLeaderboard({ bucket, limit: 100 })
    )))
      .then((rowsByBucket) => {
        if (cancelled) {
          return
        }
        setRatingMetadataResult({
          metadata: createPublicProfileRatingMetadata(rowsByBucket.flat(), profile.publicProfileId),
          publicProfileId: profile.publicProfileId,
          status: 'ready',
        })
      })
      .catch(() => {
        if (cancelled) {
          return
        }
        setRatingMetadataResult({
          metadata: [],
          publicProfileId: profile.publicProfileId,
          status: 'error',
        })
      })

    return () => {
      cancelled = true
    }
  }, [authStatus, loadResult, normalizedPublicProfileId, publicRankedLeaderboardRepository])

  const status: PublicProfilePageStatus = !normalizedPublicProfileId || !repository
    ? 'unavailable'
    : loadResult.publicProfileId === normalizedPublicProfileId
      ? loadResult.status
      : 'loading'
  const profile = status === 'ready' ? loadResult.profile : undefined
  const errorMessage = status === 'error' ? loadResult.errorMessage : undefined
  const privateMatchStateMatchesViewer = privateMatchState.publicProfileId === profile?.publicProfileId
    && privateMatchState.viewerSessionKey === privateMatchViewerSessionKey
  const privateMatchRequest = privateMatchStateMatchesViewer
    ? privateMatchState.request
    : undefined
  const privateMatchMessage = privateMatchStateMatchesViewer
    ? privateMatchState.errorMessage ?? (privateMatchRequest
      ? formatPrivateMatchRequestLifecycleMessage(privateMatchRequest)
      : undefined)
    : undefined
  const privateMatchBusy = privateMatchStateMatchesViewer
    ? privateMatchState.busy
    : false
  const ratingMetadataStatus: PublicProfileRatingMetadataStatus = authStatus !== 'authenticated' || !profile || !publicRankedLeaderboardRepository
    ? 'idle'
    : ratingMetadataResult.publicProfileId === profile.publicProfileId
      ? ratingMetadataResult.status
      : 'loading'
  const ratingMetadata = ratingMetadataStatus === 'ready'
    ? ratingMetadataResult.metadata
    : []

  useEffect(() => {
    if (!profile || !privateMatchActions?.listPrivateRequestBlocks || authStatus !== 'authenticated') {
      setBlockedForPrivateRequests(false)
      return undefined
    }
    let active = true
    void privateMatchActions.listPrivateRequestBlocks().then((blocks) => {
      if (active) setBlockedForPrivateRequests(blocks.some((block) => block.publicProfileId === profile.publicProfileId))
    }).catch(() => { if (active) setBlockedForPrivateRequests(false) })
    return () => { active = false }
  }, [authStatus, privateMatchActions, profile])

  useEffect(() => {
    const request = privateMatchState.publicProfileId === normalizedPublicProfileId
      && privateMatchState.viewerSessionKey === privateMatchViewerSessionKey
      ? privateMatchState.request
      : undefined
    if (
      authStatus !== 'authenticated'
      || !privateMatchActions
      || !request
      || isPrivateMatchRequestTerminal(request)
    ) {
      return undefined
    }

    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const requestId = request.requestId
    const requestVersion = privateMatchState.requestVersion
    const targetPublicProfileId = privateMatchState.publicProfileId
    const viewerSessionKey = privateMatchState.viewerSessionKey
    const contextIsCurrent = () => (
      !cancelled
      && privateMatchRequestVersionRef.current === requestVersion
      && privateMatchContextRef.current.publicProfileId === targetPublicProfileId
      && privateMatchContextRef.current.viewerSessionKey === viewerSessionKey
      && privateMatchContextRef.current.authStatus === 'authenticated'
    )

    const scheduleNextRefresh = () => {
      if (contextIsCurrent()) {
        timeoutId = setTimeout(() => { void refreshRequest() }, PRIVATE_MATCH_REQUEST_POLL_INTERVAL_MS)
      }
    }
    const refreshRequest = async () => {
      try {
        const requests = await privateMatchActions.listPrivateMatchRequests({ limit: 50 })
        if (!contextIsCurrent()) {
          return
        }
        const nextRequest = findPrivateMatchRequestById(requests, requestId)
        if (nextRequest) {
          setPrivateMatchState((current) => (
            current.requestVersion === requestVersion
              && current.publicProfileId === targetPublicProfileId
              && current.viewerSessionKey === viewerSessionKey
              && current.request?.requestId === requestId
              ? { ...current, request: nextRequest }
              : current
          ))
          if (isPrivateMatchRequestTerminal(nextRequest)) {
            return
          }
        }
      } catch {
        // Keep the last participant-safe state and retry at the normal restrained cadence.
      }
      scheduleNextRefresh()
    }

    scheduleNextRefresh()
    return () => {
      cancelled = true
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId)
      }
    }
  }, [
    authStatus,
    normalizedPublicProfileId,
    privateMatchActions,
    privateMatchState.publicProfileId,
    privateMatchState.request,
    privateMatchState.requestVersion,
    privateMatchState.viewerSessionKey,
    privateMatchViewerSessionKey,
  ])

  const requestPrivatePracticeMatch = async () => {
    if (!profile || authStatus !== 'authenticated' || !privateMatchActions) {
      return
    }
    const targetPublicProfileId = profile.publicProfileId
    const viewerSessionKey = privateMatchViewerSessionKey
    const requestVersion = privateMatchRequestVersionRef.current + 1
    privateMatchRequestVersionRef.current = requestVersion
    const contextIsCurrent = () => (
      privateMatchRequestVersionRef.current === requestVersion
      && privateMatchContextRef.current.publicProfileId === targetPublicProfileId
      && privateMatchContextRef.current.viewerSessionKey === viewerSessionKey
      && privateMatchContextRef.current.authStatus === 'authenticated'
    )
    setPrivateMatchState({
      busy: true,
      publicProfileId: targetPublicProfileId,
      requestVersion,
      viewerSessionKey,
    })
    try {
      let requesterProfile: OwnerPublicProfile | undefined
      if (repository?.loadMine) {
        requesterProfile = await repository.loadMine()
        if (!contextIsCurrent()) {
          return
        }
        if (!isOwnerPublicProfileEligibleForPrivateMatch(requesterProfile)) {
          setPrivateMatchState({
            busy: false,
            errorMessage: PRIVATE_MATCH_REQUESTER_PUBLIC_PROFILE_REQUIRED_MESSAGE,
            publicProfileId: targetPublicProfileId,
            requestVersion,
            viewerSessionKey,
          })
          return
        }
      }
      const normalizedSettings = normalizePrivatePracticeRequestSettings(privatePracticeSettings)
      if (!normalizedSettings.ok) {
        setPrivateMatchState({
          busy: false,
          errorMessage: normalizedSettings.message,
          publicProfileId: targetPublicProfileId,
          requestVersion,
          viewerSessionKey,
        })
        return
      }
      const settings = normalizedSettings.settings

      const request = await privateMatchActions.createPrivateMatchRequest({
        ...settings,
        idempotencyKey: createPrivatePracticeRequestIdempotencyKey(targetPublicProfileId, settings),
        targetPublicProfileId,
      })
      if (!contextIsCurrent()) {
        return
      }
      setPrivateMatchState({
        busy: false,
        publicProfileId: targetPublicProfileId,
        request,
        requestVersion,
        viewerSessionKey,
      })
    } catch (error) {
      if (!contextIsCurrent()) {
        return
      }
      setPrivateMatchState({
        busy: false,
        errorMessage: getPrivateMatchRequestErrorMessage(error),
        publicProfileId: targetPublicProfileId,
        requestVersion,
        viewerSessionKey,
      })
    }
  }

  const togglePrivateRequestBlock = async () => {
    if (!profile || !privateMatchActions?.setPrivateRequestBlock || authStatus !== 'authenticated') return
    if (!blockedForPrivateRequests && typeof window !== 'undefined' && !window.confirm(`Block private Practice requests with ${profile.displayName}?`)) return
    setPrivateMatchState((current) => ({ ...current, busy: true, errorMessage: undefined }))
    try {
      const result = await privateMatchActions.setPrivateRequestBlock({ blocked: !blockedForPrivateRequests, targetPublicProfileId: profile.publicProfileId })
      setBlockedForPrivateRequests(result.blocked)
      setPrivateMatchState((current) => ({ ...current, busy: false }))
    } catch (error) {
      setPrivateMatchState((current) => ({ ...current, busy: false, errorMessage: getPrivateMatchRequestErrorMessage(error) }))
    }
  }

  return (
    <PublicProfileCard
      authStatus={authStatus}
      backLabel={backLabel}
      errorMessage={errorMessage}
      privateMatchBusy={privateMatchBusy}
      privateMatchMessage={privateMatchMessage}
      privateMatchRequest={privateMatchRequest}
      privateMatchRequestsAvailable={Boolean(privateMatchActions)}
      privatePracticeSettings={privatePracticeSettings}
      onPrivatePracticeSettingsChange={setPrivatePracticeSettings}
      onEnterPrivateMatch={onEnterPrivateMatch}
      onGoToPracticeMultiplayer={onGoToPracticeMultiplayer}
      onRequestPrivateMatch={() => { void requestPrivatePracticeMatch() }}
      blockedForPrivateRequests={blockedForPrivateRequests}
      onTogglePrivateRequestBlock={privateMatchActions?.setPrivateRequestBlock ? () => { void togglePrivateRequestBlock() } : undefined}
      onBack={onBack}
      profile={profile}
      ratingMetadata={ratingMetadata}
      ratingMetadataStatus={ratingMetadataStatus}
      status={status}
    />
  )
}
