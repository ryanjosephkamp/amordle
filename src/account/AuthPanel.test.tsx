import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthPanel } from './AuthPanel'

function noop() {}

function stubConfiguredSupabase() {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('AuthPanel', () => {
  it('renders Email + password first and active by default for the embedded Profile sign-in surface', () => {
    stubConfiguredSupabase()

    const html = renderToStaticMarkup(
      <AuthPanel
        authStatus="anonymous"
        onRequestPasswordReset={noop}
        onSendMagicLink={noop}
        onSignInWithPassword={noop}
        onSignUpWithPassword={noop}
      />,
    )

    expect(html).toContain('Sign in for sync')
    expect(html).toContain('Email + password')
    expect(html).toContain('Magic link')
    expect(html.indexOf('Email + password')).toBeLessThan(html.indexOf('Magic link'))
    expect(html).toContain('aria-selected="true"')
    expect(html).toContain('Password')
    expect(html).toContain('Sign in')
    expect(html).toContain('Create account')
    expect(html).toContain('Forgot password?')
    expect(html).not.toContain('Send magic link')
  })

  it('keeps Magic link available as the secondary embedded sign-in method', () => {
    stubConfiguredSupabase()

    const html = renderToStaticMarkup(
      <AuthPanel
        authStatus="anonymous"
        onRequestPasswordReset={noop}
        onSendMagicLink={noop}
        onSignInWithPassword={noop}
        onSignUpWithPassword={noop}
      />,
    )

    expect(html).toMatch(/role="tab"/)
    expect(html).toContain('Magic link')
  })
})
