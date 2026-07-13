import { useState } from 'react'
import { Button, Panel } from '../ui'
import type { BrrrdleSupabaseClient } from '../account/supabaseClient'
import {
  requestAdminRefresh,
  type AdminRefreshFailure,
  type AdminRefreshResult,
  type AdminRefreshSuccess,
} from './manualRefresh'

interface ManualRefreshControlsProps {
  readonly supabase: BrrrdleSupabaseClient | undefined
}

type ControlState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'in-flight' }
  | { readonly kind: 'success'; readonly result: AdminRefreshSuccess }
  | { readonly kind: 'failure'; readonly result: AdminRefreshFailure }

const failureMessages: Record<AdminRefreshFailure['reason'], string> = {
  'missing-session': 'No active Supabase session. Sign in again and retry.',
  unauthorized: 'The server rejected the request (401). Sign in again and retry.',
  forbidden: 'Your account does not have the admin role required to refresh word lists (403).',
  'server-error': 'The refresh server returned an error.',
  'network-error': 'Network error while contacting the refresh endpoint.',
}

function formatFailureMessage(result: AdminRefreshFailure): string {
  const base = failureMessages[result.reason]
  const detail = result.message ? ` ${result.message}` : ''
  const stage = result.stage ? ` (stage: ${result.stage})` : ''
  return `${base}${stage}${detail}`
}

function StatusReadout({ state }: { readonly state: ControlState }) {
  if (state.kind === 'idle') {
    return <p className="text-sm leading-6 text-slate-300">Ready to refresh the word lists from Hugging Face.</p>
  }
  if (state.kind === 'in-flight') {
    return <p className="text-sm leading-6 text-slate-300">Refreshing word lists…</p>
  }
  if (state.kind === 'success') {
    const { result } = state
    const lengthCount = result.lengths?.length ?? 0
    return (
      <div className="space-y-2 text-sm leading-6 text-slate-200">
        <p className="font-semibold text-emerald-200">Refresh succeeded.</p>
        <dl className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          <div><dt className="inline font-semibold text-slate-300">Revision: </dt><dd className="inline">{result.revision ?? '—'}</dd></div>
          <div><dt className="inline font-semibold text-slate-300">Generated at: </dt><dd className="inline">{result.generatedAt ?? '—'}</dd></div>
          <div><dt className="inline font-semibold text-slate-300">Fetched at: </dt><dd className="inline">{result.fetchedAt ?? '—'}</dd></div>
          <div><dt className="inline font-semibold text-slate-300">Lengths refreshed: </dt><dd className="inline">{lengthCount}</dd></div>
          <div><dt className="inline font-semibold text-slate-300">Persistence: </dt><dd className="inline">{result.persistence?.status ?? '—'}</dd></div>
        </dl>
      </div>
    )
  }
  return <p className="text-sm leading-6 text-rose-200">{formatFailureMessage(state.result)}</p>
}

export function ManualRefreshControls({ supabase }: ManualRefreshControlsProps) {
  const [state, setState] = useState<ControlState>({ kind: 'idle' })

  const handleRefresh = async () => {
    if (state.kind === 'in-flight') {
      return
    }
    setState({ kind: 'in-flight' })
    let result: AdminRefreshResult
    try {
      result = await requestAdminRefresh({ supabase })
    } catch {
      result = { ok: false, reason: 'network-error' }
    }
    if (result.ok) {
      setState({ kind: 'success', result })
    } else {
      setState({ kind: 'failure', result })
    }
  }

  const handleArm = () => {
    setState({ kind: 'idle' })
  }

  const buttonDisabled = state.kind === 'in-flight' || state.kind === 'success' || !supabase
  const showArm = state.kind === 'success' || state.kind === 'failure'

  return (
    <Panel className="space-y-3 text-sm leading-6 text-slate-200" tone="muted">
      <h3 className="text-lg font-semibold text-white">Manual refresh</h3>
      <p className="text-sm leading-6 text-slate-300">
        Trigger an on-demand refresh of the word lists from Hugging Face. The request is sent to the protected
        <code className="ml-1 mr-1 rounded bg-slate-900 px-1">/api/admin-refresh</code>
        server route with your Supabase access token.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          aria-disabled={buttonDisabled || undefined}
          disabled={buttonDisabled}
          onClick={() => { void handleRefresh() }}
          variant="primary"
        >
          {state.kind === 'in-flight' ? 'Refreshing…' : 'Refresh now'}
        </Button>
        {showArm ? (
          <Button onClick={handleArm} variant="secondary">Reset status</Button>
        ) : null}
      </div>
      <div
        aria-busy={state.kind === 'in-flight' || undefined}
        aria-live="polite"
        className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3"
        data-testid="manual-refresh-status"
        role="status"
      >
        <StatusReadout state={state} />
      </div>
      {!supabase ? (
        <p className="text-xs text-slate-400">Supabase is not configured in this environment, so the refresh endpoint cannot be contacted.</p>
      ) : null}
    </Panel>
  )
}
