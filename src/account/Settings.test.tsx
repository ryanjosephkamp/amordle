import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createSyncStatus } from './syncStatus'
import { createDefaultGuestProgress } from './storageSchema'
import { Settings } from './Settings'
import type { AuthState } from './auth'

const anonymousAuthState: AuthState = {
  status: 'anonymous',
}

const authenticatedAuthState: AuthState = {
  status: 'authenticated',
  user: {
    email: 'player@example.com',
    id: 'user-1',
    roles: [],
  },
}

describe('Settings', () => {
  it('orders current sections as Gameplay, Sound effects, Notifications, Account management', () => {
    const html = renderToStaticMarkup(
      <Settings
        authState={authenticatedAuthState}
        guestProgress={createDefaultGuestProgress()}
        onOpenPasswordChange={() => undefined}
        onOpenProfilePanel={() => undefined}
        onResetProgress={() => undefined}
        onSignOut={() => undefined}
        onSyncNow={() => undefined}
        onToggleSound={() => undefined}
        onUpdateSettings={() => undefined}
        syncStatus={createSyncStatus('idle')}
      />,
    )

    const gameplayIndex = html.indexOf('Gameplay')
    const soundIndex = html.indexOf('Sound effects')
    const notificationsIndex = html.indexOf('Notifications')
    const accountIndex = html.indexOf('Account management')

    expect(gameplayIndex).toBeGreaterThan(-1)
    expect(soundIndex).toBeGreaterThan(gameplayIndex)
    expect(notificationsIndex).toBeGreaterThan(soundIndex)
    expect(accountIndex).toBeGreaterThan(notificationsIndex)
    expect(html).toContain('Sync now')
    expect(html).not.toContain('Sound Effects')
  })

  it('renders cloud-synced in-app notification controls without browser permission prompts', () => {
    const html = renderToStaticMarkup(
      <Settings
        authState={anonymousAuthState}
        guestProgress={{
          ...createDefaultGuestProgress(),
          settings: {
            ...createDefaultGuestProgress().settings,
            browserNotificationsEnabled: false,
            inAppNotificationMode: 'important-only',
            inAppNotificationsEnabled: true,
            notificationSoundMode: 'important-only',
          },
        }}
        onResetProgress={() => undefined}
        onUpdateSettings={() => undefined}
        syncStatus={createSyncStatus('idle')}
      />,
    )

    expect(html).toContain('Notifications')
    expect(html).toContain('Show in-app notifications')
    expect(html).toContain('In-app notification level')
    expect(html).toContain('Important only')
    expect(html).toContain('Notification sound mode')
    expect(html).toContain('Master sound is currently off')
    expect(html).toContain('Browser notification controls')
    expect(html).toContain('Ask this browser for permission')
    expect(html).toContain('foreground browser notifications after this browser grants permission')
    expect(html).toContain('no service worker, push delivery, or background cross-device delivery is used')
    expect(html).toContain('Preferences follow the current guest or signed-in progress scope')
    expect(html).toContain('Read and dismissed item state stays local to this browser')
    expect(html).not.toContain('service worker script')
  })

  it('does not render the large Help and tutorials doorway inside Settings', () => {
    const html = renderToStaticMarkup(
      <Settings
        authState={anonymousAuthState}
        guestProgress={createDefaultGuestProgress()}
        onResetProgress={() => undefined}
        syncStatus={createSyncStatus('idle')}
      />,
    )

    expect(html).not.toContain('Help and tutorials')
    expect(html).not.toContain('Open Help')
    expect(html).not.toContain('modes, multiplayer, public profiles, ranked Practice, settings, stats, history, and feedback')
  })

  it('renders signed-in account management with a password-change affordance and email-change gate copy', () => {
    const html = renderToStaticMarkup(
      <Settings
        authState={authenticatedAuthState}
        guestProgress={createDefaultGuestProgress()}
        onOpenPasswordChange={() => undefined}
        onOpenProfilePanel={() => undefined}
        onResetProgress={() => undefined}
        syncStatus={createSyncStatus('idle')}
      />,
    )

    expect(html).toContain('Account management')
    expect(html).toContain('Profile is where you edit player identity')
    expect(html).toContain('Settings is the account-management home for Sign out, password changes, cloud sync, progress export, reset, and gated account actions')
    expect(html).toContain('Open Profile tab')
    expect(html).toContain('Change password')
    expect(html).toContain('Email changes remain gated until Supabase email confirmation and redirect settings are verified')
    expect(html).toContain('Password changes use the signed-in Supabase account session')
    expect(html).toContain('Danger Zone actions stay separated from Profile saves')
  })

  it('consolidates signed-in email and sign-out into Account management', () => {
    const html = renderToStaticMarkup(
      <Settings
        authMessage="Account action failed."
        authState={authenticatedAuthState}
        guestProgress={createDefaultGuestProgress()}
        onOpenPasswordChange={() => undefined}
        onOpenProfilePanel={() => undefined}
        onResetProgress={() => undefined}
        onSignOut={() => undefined}
        syncStatus={createSyncStatus('idle')}
      />,
    )

    expect(html).toContain('Account management')
    expect(html).toContain('Signed in')
    expect(html).toContain('player@example.com')
    expect(html).toContain('Sign out')
    expect(html).toContain('Account action failed.')
    expect(html.indexOf('Signed in')).toBeGreaterThan(html.indexOf('Account management'))
  })

  it('keeps signed-out account access in Account management', () => {
    const html = renderToStaticMarkup(
      <Settings
        authState={anonymousAuthState}
        guestProgress={createDefaultGuestProgress()}
        onOpenAuthModal={() => undefined}
        onResetProgress={() => undefined}
        syncStatus={createSyncStatus('idle')}
      />,
    )

    expect(html).toContain('Account management')
    expect(html).toContain('Sign in to Awordle')
    expect(html).toContain('Sign in / Create account')
    expect(html.indexOf('Sign in to Awordle')).toBeGreaterThan(html.indexOf('Account management'))
  })

  it('keeps unconfigured account setup copy in Account management', () => {
    const html = renderToStaticMarkup(
      <Settings
        authState={{ status: 'unconfigured' }}
        guestProgress={createDefaultGuestProgress()}
        onResetProgress={() => undefined}
        syncStatus={createSyncStatus('idle')}
      />,
    )

    expect(html).toContain('Account management')
    expect(html).toContain('Account sync setup')
    expect(html).toContain('Supabase is not configured in this environment')
    expect(html.indexOf('Account sync setup')).toBeGreaterThan(html.indexOf('Account management'))
  })
})
