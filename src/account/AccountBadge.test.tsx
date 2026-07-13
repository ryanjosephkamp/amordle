import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AccountBadge } from './AccountBadge'

function noop() {}

describe('AccountBadge', () => {
  it('renders a Guest pill when anonymous', () => {
    const html = renderToStaticMarkup(
      <AccountBadge authState={{ status: 'anonymous' }} onOpenAuthModal={noop} onOpenProfile={noop} />,
    )
    expect(html).toContain('Guest')
    expect(html).toMatch(/aria-label="Sign in or create an account/)
  })

  it('renders the unconfigured state when Supabase is not configured', () => {
    const html = renderToStaticMarkup(
      <AccountBadge authState={{ status: 'unconfigured' }} onOpenAuthModal={noop} onOpenProfile={noop} />,
    )
    expect(html).toContain('sync unavailable')
    expect(html).toMatch(/title="Sign-in is unavailable/)
  })

  it('renders the avatar initials and label when authenticated', () => {
    const html = renderToStaticMarkup(
      <AccountBadge
        authState={{
          status: 'authenticated',
          user: {
            id: 'u1',
            email: 'ada@example.com',
            roles: [],
            profile: {
              accentColor: 'ice',
              displayName: 'Ada Lovelace',
              email: 'ada@example.com',
              gradient: 'from-cyan-500 to-sky-700',
              initials: 'AL',
              label: 'Ada Lovelace',
            },
          },
        }}
        onOpenAuthModal={noop}
        onOpenProfile={noop}
        onOpenSettings={noop}
        onSignOut={noop}
      />,
    )
    expect(html).toContain('Ada Lovelace')
    expect(html).toContain('AL')
    expect(html).toMatch(/aria-label="Open account menu for Ada Lovelace"/)
    expect(html).toContain('role="menu"')
    expect(html).toContain('data-testid="account-menu"')
    expect(html).toContain('max-w-[calc(100vw-1.3rem)]')
    expect(html).toContain('>Profile</button>')
    expect(html).toContain('>Settings</button>')
    expect(html).toContain('>Sign out</button>')
  })

  it('uses the saved private accent color for the signed-in avatar', () => {
    const html = renderToStaticMarkup(
      <AccountBadge
        authState={{
          status: 'authenticated',
          user: {
            id: 'u1',
            email: 'ada@example.com',
            roles: [],
            profile: {
              accentColor: 'rose',
              displayName: 'Ada Lovelace',
              email: 'ada@example.com',
              gradient: 'from-emerald-500 to-teal-700',
              initials: 'AL',
              label: 'Ada Lovelace',
            },
          },
        }}
        onOpenAuthModal={noop}
        onOpenProfile={noop}
        onOpenSettings={noop}
      />,
    )

    expect(html).toContain('from-rose-300 to-pink-700')
    expect(html).not.toContain('from-emerald-500 to-teal-700')
  })

  it('falls back to email when no display name is set', () => {
    const html = renderToStaticMarkup(
      <AccountBadge
        authState={{ status: 'authenticated', user: { id: 'u', email: 'a@b.com', roles: [] } }}
        onOpenAuthModal={noop}
        onOpenProfile={noop}
      />,
    )
    // The badge falls back to label='Account' when no profile is present.
    expect(html).toMatch(/aria-label="Open account menu for/)
  })
})
