import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AdminPanel } from './AdminPanel'
import { ManualRefreshControls } from './ManualRefreshControls'
import type { BrrrdleSupabaseClient } from '../account/supabaseClient'

function fakeSupabase(): BrrrdleSupabaseClient {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 't' } } }),
    },
  } as unknown as BrrrdleSupabaseClient
}

describe('ManualRefreshControls (structural)', () => {
  it('renders a "Refresh now" button, an aria-live="polite" status region, and the idle copy', () => {
    const html = renderToStaticMarkup(<ManualRefreshControls supabase={fakeSupabase()} />)
    expect(html).toContain('Refresh now')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('Ready to refresh the word lists')
    expect(html).toMatch(/role="status"/)
  })

  it('renders a not-configured hint when the supabase client is undefined and disables the button', () => {
    const html = renderToStaticMarkup(<ManualRefreshControls supabase={undefined} />)
    expect(html).toContain('Supabase is not configured')
    expect(html).toMatch(/disabled=""|disabled/)
  })
})

describe('AdminPanel allowed branch composition', () => {
  it('renders protected dashboard and ManualRefreshControls for admin users', () => {
    const html = renderToStaticMarkup(
      <AdminPanel
        authState={{ status: 'authenticated', user: { id: 'admin', roles: ['admin'] } }}
        supabaseClient={fakeSupabase()}
      />,
    )
    // Existing descriptive copy is preserved.
    expect(html).toContain('Manual refresh requests must be sent through the protected')
    expect(html).toContain('The browser never receives service-role credentials')
    expect(html).toContain('Operational dashboard')
    expect(html).toContain('Refresh now')
    expect(html).toContain('aria-live="polite"')
  })

  it('renders the locked ErrorState for non-admin authenticated users (no leak of refresh button)', () => {
    const html = renderToStaticMarkup(
        <AdminPanel authState={{ status: 'authenticated', user: { id: 'u', roles: [] } }} />,
    )
    expect(html).toContain('Developer operations locked')
    expect(html).not.toContain('Refresh now')
    expect(html).not.toContain('Operational dashboard')
  })

  it('renders the locked ErrorState when unauthenticated', () => {
    const html = renderToStaticMarkup(<AdminPanel authState={{ status: 'anonymous' }} />)
    expect(html).toContain('Developer operations locked')
    expect(html).not.toContain('Refresh now')
    expect(html).not.toContain('Operational dashboard')
  })
})
