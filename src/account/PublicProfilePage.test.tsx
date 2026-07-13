import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PublicProfileCard, PublicProfilePage } from './PublicProfilePage'
import type { PublicPlayerProfile } from './publicProfile'
import type { PrivateMatchRequestResult } from '../multiplayer/multiplayerRepository'

const hookStateOverrides = vi.hoisted(() => ({
  loadResult: undefined as unknown,
  privateMatchState: undefined as unknown,
}))

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  const useState = ((initialState: unknown) => {
    const initialValue = typeof initialState === 'function'
      ? (initialState as () => unknown)()
      : initialState
    if (
      hookStateOverrides.loadResult
      && typeof initialValue === 'object'
      && initialValue !== null
      && 'status' in initialValue
      && initialValue.status === 'unavailable'
    ) {
      return [hookStateOverrides.loadResult, () => undefined]
    }
    if (
      hookStateOverrides.privateMatchState
      && typeof initialValue === 'object'
      && initialValue !== null
      && 'busy' in initialValue
      && 'requestVersion' in initialValue
    ) {
      return [hookStateOverrides.privateMatchState, () => undefined]
    }
    return actual.useState(initialState)
  }) as typeof actual.useState

  return { ...actual, useState }
})

const PROFILE: PublicPlayerProfile = {
  accentColor: 'aurora',
  avatarUrl: 'https://example.invalid/public/avatar.png',
  bio: 'Ranked word nerd.',
  createdAt: '2026-06-21T00:00:00.000Z',
  displayName: 'Public Ada',
  flairKey: 'none',
  publicProfileId: '123e4567-e89b-42d3-a456-426614174000',
  updatedAt: '2026-06-21T00:01:00.000Z',
}

function privateRequest(overrides: Partial<PrivateMatchRequestResult> = {}): PrivateMatchRequestResult {
  return {
    created: false,
    createdAt: '2026-07-10T12:00:00.000Z',
    expired: false,
    expiresAt: '2026-07-11T12:00:00.000Z',
    hardMode: false,
    idempotent: false,
    mode: 'og',
    opponent: { displayName: 'Public Ada', identityAvailable: true },
    requestId: 'private-request-opaque-1',
    requester: { displayName: 'Requester', identityAvailable: true },
    requestStatus: 'requested',
    updatedAt: '2026-07-10T12:00:00.000Z',
    viewerCanAccept: false,
    viewerCanCancel: true,
    viewerCanDecline: false,
    viewerRole: 'requester',
    wordLength: 5,
    ...overrides,
  }
}

describe('PublicProfileCard', () => {
  it('renders public-safe profile fields without exposing opaque or private identifiers', () => {
    const html = renderToStaticMarkup(<PublicProfileCard profile={PROFILE} status="ready" />)

    expect(html).toContain('Player profile')
    expect(html).toContain('Public Ada')
    expect(html).toContain('Ranked word nerd.')
    expect(html).toContain('Active public profile')
    expect(html).toContain('Public ranked multiplayer metadata')
    expect(html).toContain('Sign in to view public ranked multiplayer metadata')
    expect(html).toContain('Updated Jun')
    expect(html).not.toContain(PROFILE.publicProfileId)
    expect(html).not.toContain('user_id')
    expect(html).not.toContain('email')
    expect(html).not.toContain('rating_transaction_id')
    expect(html).not.toContain('queue_id')
    expect(html).not.toContain('serialized_session')
  })

  it('renders safe public ranked Practice metadata without exposing leaderboard internals', () => {
    const html = renderToStaticMarkup(
      <PublicProfileCard
        authStatus="authenticated"
        profile={PROFILE}
        ratingMetadata={[{
          bucketLabel: 'OG ranked Practice',
          gamesLabel: '12 rated',
          latestMovementLabel: '+18 from last settlement',
          peakLabel: 'Peak 1290',
          provisionalLabel: 'Established',
          rankBandLabel: 'Silver',
          rankLabel: '#4',
          ratingLabel: '1260',
          recordLabel: '8-3-1',
          updatedLabel: '9 Jul, 12:05 UTC',
        }]}
        ratingMetadataStatus="ready"
        status="ready"
      />,
    )

    expect(html).toContain('Public ranked multiplayer metadata')
    expect(html).toContain('OG ranked Practice')
    expect(html).toContain('#4 · Silver band')
    expect(html).toContain('1260')
    expect(html).toContain('8-3-1')
    expect(html).toContain('+18 from last settlement')
    expect(html).toContain('Peak 1290')
    expect(html).toContain('Leaderboard freshness')
    expect(html).not.toContain(PROFILE.publicProfileId)
    expect(html).not.toContain('publicProfileId')
    expect(html).not.toContain('user_id')
    expect(html).not.toContain('email')
    expect(html).not.toContain('match_id')
    expect(html).not.toContain('queue_id')
    expect(html).not.toContain('rating_transaction_id')
  })

  it('renders Daily rating metadata as public ranked multiplayer metadata', () => {
    const html = renderToStaticMarkup(
      <PublicProfileCard
        authStatus="authenticated"
        profile={PROFILE}
        ratingMetadata={[{
          bucketLabel: 'OG ranked Daily',
          gamesLabel: '4 rated',
          latestMovementLabel: '+12 from last settlement',
          peakLabel: 'Peak 1240',
          provisionalLabel: 'Provisional',
          rankBandLabel: 'Silver',
          rankLabel: '#8',
          ratingLabel: '1230',
          recordLabel: '3-1-0',
          updatedLabel: '10 Jul, 12:05 UTC',
        }]}
        ratingMetadataStatus="ready"
        status="ready"
      />,
    )

    expect(html).toContain('Public ranked multiplayer metadata')
    expect(html).toContain('OG ranked Daily')
    expect(html).not.toContain(PROFILE.publicProfileId)
    expect(html).not.toContain('user_id')
  })

  it('shows authenticated private Practice request controls without exposing profile ids', () => {
    const html = renderToStaticMarkup(
      <PublicProfileCard
        authStatus="authenticated"
        onRequestPrivateMatch={() => undefined}
        privateMatchMessage="Private Practice match request sent."
        privateMatchRequestsAvailable
        profile={PROFILE}
        status="ready"
      />,
    )

    expect(html).toContain('Private Practice match')
    expect(html).toContain('Private Practice mode')
    expect(html).toContain('Private Practice word length')
    expect(html).toContain('Private Practice time control')
    expect(html).toContain('Private Practice Hard Mode')
    expect(html).toContain('Current request: OG, 5 letters, Hard Mode off, no clock')
    expect(html).toContain('Request Practice match')
    expect(html).toContain('Private Practice match request sent.')
    expect(html).not.toContain(PROFILE.publicProfileId)
    expect(html).not.toContain('user_id')
    expect(html).not.toContain('playerUserIds')
  })

  it('summarizes selected private Practice GO settings without exposing profile ids', () => {
    const html = renderToStaticMarkup(
      <PublicProfileCard
        authStatus="authenticated"
        onRequestPrivateMatch={() => undefined}
        privateMatchRequestsAvailable
        privatePracticeSettings={{
          goPuzzleCount: 5,
          hardMode: true,
          mode: 'go',
          timeLimitMs: 300_000,
          wordLength: 7,
        }}
        profile={PROFILE}
        status="ready"
      />,
    )

    expect(html).toContain('Current request: GO, 7 letters, 5 puzzles, Hard Mode on, 5:00 per side')
    expect(html).not.toContain(PROFILE.publicProfileId)
    expect(html).not.toContain('user_id')
    expect(html).not.toContain('playerUserIds')
  })

  it('shows direct Practice routing for a retained request and exact entry only when created', () => {
    const requested = renderToStaticMarkup(
      <PublicProfileCard
        authStatus="authenticated"
        onGoToPracticeMultiplayer={() => undefined}
        onRequestPrivateMatch={() => undefined}
        privateMatchRequest={privateRequest()}
        privateMatchRequestsAvailable
        profile={PROFILE}
        status="ready"
      />,
    )
    const created = renderToStaticMarkup(
      <PublicProfileCard
        authStatus="authenticated"
        onEnterPrivateMatch={() => undefined}
        onGoToPracticeMultiplayer={() => undefined}
        onRequestPrivateMatch={() => undefined}
        privateMatchRequest={privateRequest({
          created: true,
          createdGameId: 'private-game-opaque-1',
          requestStatus: 'created',
        })}
        privateMatchRequestsAvailable
        profile={PROFILE}
        status="ready"
      />,
    )

    expect(requested).toContain('Private Practice request pending')
    expect(requested).toContain('Go to Practice Multiplayer')
    expect(requested).not.toContain('Enter private match')
    expect(created).toContain('Private Practice match created')
    expect(created).toContain('Go to Practice Multiplayer')
    expect(created).toContain('Enter private match')
    for (const html of [requested, created]) {
      expect(html).not.toContain('private-request-opaque-1')
      expect(html).not.toContain('private-game-opaque-1')
      expect(html).not.toContain(PROFILE.publicProfileId)
    }
  })

  it('renders declined, cancelled, and expired request lifecycle states without route actions or ids', () => {
    for (const [requestStatus, expected] of [
      ['declined', 'Private Practice request declined.'],
      ['cancelled', 'Private Practice request cancelled.'],
      ['expired', 'Private Practice request expired.'],
    ] as const) {
      const html = renderToStaticMarkup(
        <PublicProfileCard
          authStatus="authenticated"
          onRequestPrivateMatch={() => undefined}
          privateMatchRequest={privateRequest({
            expired: requestStatus === 'expired',
            requestStatus,
          })}
          privateMatchRequestsAvailable
          profile={PROFILE}
          status="ready"
        />,
      )

      expect(html).toContain(expected)
      expect(html).not.toContain('Enter private match')
      expect(html).not.toContain('private-request-opaque-1')
    }
  })

  it('keeps private Practice requests signed-in only', () => {
    const html = renderToStaticMarkup(
      <PublicProfileCard authStatus="anonymous" profile={PROFILE} status="ready" />,
    )

    expect(html).toContain('Sign in to send private Practice match requests.')
    expect(html).not.toContain('Request Practice match')
  })

  it('uses a single unavailable fallback for hidden, private, suspended, missing, or invalid profiles', () => {
    const html = renderToStaticMarkup(<PublicProfileCard status="unavailable" />)

    expect(html).toContain('This public profile is unavailable')
    expect(html).toContain('private, hidden, suspended, missing')
    expect(html).not.toContain('user_id')
    expect(html).not.toContain('email')
  })
})

describe('PublicProfilePage', () => {
  it('accepts contextual return copy without changing the public-profile content boundary', () => {
    const html = renderToStaticMarkup(
      <PublicProfilePage
        backLabel="Back to Multiplayer"
        onBack={() => undefined}
      />,
    )

    expect(html).toContain('Back to Multiplayer')
    expect(html).toContain('Player profile')
  })

  it('renders an unavailable state for malformed profile route ids without calling a repository', () => {
    const html = renderToStaticMarkup(
      <PublicProfilePage
        publicProfileId="raw-auth-id"
        repository={{
          loadPublicProfile: async () => PROFILE,
        }}
      />,
    )

    expect(html).toContain('This public profile is unavailable')
    expect(html).not.toContain('Public Ada')
  })

  it('does not render a retained private request after the viewer session changes', () => {
    hookStateOverrides.loadResult = {
      profile: PROFILE,
      publicProfileId: PROFILE.publicProfileId,
      status: 'ready',
    }
    hookStateOverrides.privateMatchState = {
      busy: false,
      publicProfileId: PROFILE.publicProfileId,
      request: privateRequest(),
      requestVersion: 4,
      viewerSessionKey: 'viewer-session-a',
    }

    try {
      const html = renderToStaticMarkup(
        <PublicProfilePage
          authStatus="authenticated"
          onGoToPracticeMultiplayer={() => undefined}
          privateMatchActions={{
            createPrivateMatchRequest: async () => privateRequest(),
            listPrivateMatchRequests: async () => [],
          }}
          privateMatchViewerSessionKey="viewer-session-b"
          publicProfileId={PROFILE.publicProfileId}
          repository={{
            loadPublicProfile: async () => PROFILE,
          }}
        />,
      )

      expect(html).not.toContain('Private Practice request pending.')
      expect(html).not.toContain('Go to Practice Multiplayer')
    } finally {
      hookStateOverrides.loadResult = undefined
      hookStateOverrides.privateMatchState = undefined
    }
  })
})
