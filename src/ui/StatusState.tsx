import type { ReactNode } from 'react'
import { Panel } from './Panel'

interface LoadingStateProps {
  readonly label: string
}

interface ErrorStateProps {
  readonly action?: ReactNode
  readonly message: string
  readonly title: string
}

export function LoadingState({ label }: LoadingStateProps) {
  return (
    <div className="flex items-center gap-3 text-sm text-slate-300" role="status">
      <span className="h-4 w-4 rounded-full border-2 border-cyan-200/30 border-t-cyan-100 motion-safe:animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export function ErrorState({ action, message, title }: ErrorStateProps) {
  return (
    <Panel aria-live="assertive" className="space-y-3" role="alert" tone="danger">
      <h2 className="text-xl font-bold text-rose-50">{title}</h2>
      <p className="text-sm leading-6 text-rose-100/90">{message}</p>
      {action ? <div>{action}</div> : null}
    </Panel>
  )
}
