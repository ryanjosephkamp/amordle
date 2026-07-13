import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProfileEditor, ProfilePanel } from './ProfilePanel'
import type { AuthState } from './auth'

function noop() {}

const authState: AuthState = {
  status: 'authenticated',
  user: {
    id: 'u1',
    email: 'ada@example.com',
    roles: [],
    profile: {
      accentColor: 'ice',
      displayName: 'Ada',
      email: 'ada@example.com',
      gradient: 'from-cyan-500 to-sky-700',
      initials: 'A',
      label: 'Ada',
    },
  },
}

describe('ProfilePanel', () => {
  it('renders nothing when closed', () => {
    const html = renderToStaticMarkup(
      <ProfilePanel authState={authState} isOpen={false} onClose={noop} onSave={noop} onSignOut={noop} />,
    )
    expect(html).toBe('')
  })

  it('renders one public Player name, email, Save/Cancel controls, and separated account actions', () => {
    const html = renderToStaticMarkup(
      <ProfilePanel authState={authState} isOpen onClose={noop} onOpenSettings={noop} onSave={noop} onSignOut={noop} />,
    )
    expect(html).toContain('Your profile')
    expect(html).toContain('Player identity')
    expect(html).toContain('This one Player name appears on the account chip')
    expect(html).toContain('Player name')
    expect(html).toContain('emoji and symbols are not supported')
    expect(html).toContain('Accent color')
    expect(html).toContain('ada@example.com')
    expect(html).toContain('Save player profile')
    expect(html).toContain('Cancel')
    expect(html).toContain('Account management')
    expect(html).toContain('Open Settings')
    expect(html).toContain('Settings remains the home for sign out')
    expect(html).toContain('>Sign out</button>')
    expect(html.indexOf('>Sign out</button>')).toBeGreaterThan(html.indexOf('Account management'))
  })

  it('renders the no-storage hint when the Supabase client is missing', () => {
    const html = renderToStaticMarkup(
      <ProfilePanel authState={authState} isOpen onClose={noop} onSave={noop} onSignOut={noop} />,
    )
    expect(html).toContain('Image upload is unavailable')
    expect(html).not.toContain('type="file"')
  })

  it('renders an accent radio group with allow-listed swatches', () => {
    const html = renderToStaticMarkup(
      <ProfilePanel authState={authState} isOpen onClose={noop} onSave={noop} onSignOut={noop} />,
    )
    expect(html).toMatch(/role="radio"/)
    expect(html).toContain('aria-label="Accent color"')
    expect(html).toContain('ice')
    expect(html).toContain('aurora')
  })

  it('uses the selected accent for the initials avatar preview', () => {
    const html = renderToStaticMarkup(
      <ProfilePanel
        authState={{
          ...authState,
          user: {
            ...authState.user!,
            profile: {
              ...authState.user!.profile!,
              accentColor: 'rose',
              gradient: 'from-emerald-500 to-teal-700',
            },
          },
        }}
        isOpen
        onClose={noop}
        onSave={noop}
        onSignOut={noop}
      />,
    )

    expect(html).toContain('from-rose-300 to-pink-700')
    expect(html).not.toContain('from-emerald-500 to-teal-700')
  })

  it('renders player-card details only when the public save seam is supplied', () => {
    const hiddenHtml = renderToStaticMarkup(
      <ProfilePanel authState={authState} isOpen onClose={noop} onSave={noop} onSignOut={noop} />,
    )
    expect(hiddenHtml).not.toContain('Player card')

    const html = renderToStaticMarkup(
      <ProfilePanel
        authState={authState}
        isOpen
        onClose={noop}
        onSave={noop}
        onSavePublicProfile={noop}
        onSignOut={noop}
        publicProfile={{
          accentColor: 'cyan',
          bio: 'Word-game enjoyer',
          createdAt: '2026-06-21T00:00:00.000Z',
          displayName: 'Public Ada',
          flairKey: 'none',
          moderationStatus: 'active',
          publicProfileId: '123e4567-e89b-42d3-a456-426614174000',
          updatedAt: '2026-06-21T00:01:00.000Z',
          visibility: 'public',
        }}
      />,
    )
    expect(html).toContain('Player card')
    expect(html).toContain('The Player name above is the only name shown to other players')
    expect(html).not.toContain('Opt-in public profile')
    expect(html).not.toContain('Public player name')
    expect(html).not.toContain('Leave blank to use Player name')
    expect(html).not.toContain('Visibility')
    expect(html).toContain('Bio')
    expect(html).toContain('Ada')
    expect(html).toContain('from-cyan-300 to-sky-600')
    expect(html).not.toContain('123e4567-e89b-42d3-a456-426614174000')
    expect(html).not.toContain('Save public profile')
    expect(html).toContain('Save player profile')
  })

  it('renders the reusable route editor with account actions but without modal-only cancel chrome', () => {
    const html = renderToStaticMarkup(
      <ProfileEditor
        authState={authState}
        onOpenSettings={noop}
        onSave={noop}
        onSavePublicProfile={noop}
        onSignOut={noop}
        publicProfile={{
          accentColor: 'ice',
          createdAt: '2026-06-21T00:00:00.000Z',
          displayName: 'Route Ada',
          flairKey: 'none',
          moderationStatus: 'active',
          publicProfileId: '123e4567-e89b-42d3-a456-426614174001',
          updatedAt: '2026-06-21T00:01:00.000Z',
          visibility: 'private',
        }}
      />,
    )

    expect(html).toContain('Signed in as')
    expect(html).toContain('Player identity')
    expect(html).not.toContain('Route Ada')
    expect(html).not.toContain('Save public profile')
    expect(html).toContain('Save player profile')
    expect(html).toContain('Account management')
    expect(html).toContain('Open Settings')
    expect(html).toContain('>Sign out</button>')
    expect(html).not.toContain('Cancel')
  })

  it('omits account actions from the reusable editor when handlers are absent', () => {
    const html = renderToStaticMarkup(
      <ProfileEditor
        authState={authState}
        onSave={noop}
      />,
    )

    expect(html).toContain('Player identity')
    expect(html).not.toContain('Open Settings')
    expect(html).not.toContain('>Sign out</button>')
  })
})
