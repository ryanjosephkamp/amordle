import { classNames } from './classNames'

type ToastTone = 'info' | 'success' | 'warning' | 'error'

export interface ToastMessage {
  readonly id: string
  readonly message: string
  readonly title: string
  readonly tone?: ToastTone
}

interface ToastRegionProps {
  readonly messages: readonly ToastMessage[]
}

const toneClasses: Record<ToastTone, string> = {
  info: 'border-cyan-300/30 bg-cyan-950/70 text-cyan-50',
  success: 'border-emerald-300/30 bg-emerald-950/70 text-emerald-50',
  warning: 'border-amber-300/40 bg-amber-950/70 text-amber-50',
  error: 'border-rose-300/40 bg-rose-950/70 text-rose-50',
}

export function ToastRegion({ messages }: ToastRegionProps) {
  if (messages.length === 0) {
    return null
  }

  return (
    <aside aria-label="Notifications" aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-40 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3" role="status">
      {messages.map((message) => (
        <div className={classNames('rounded-2xl border p-4 shadow-xl shadow-slate-950/40', toneClasses[message.tone ?? 'info'])} key={message.id}>
          <p className="text-sm font-semibold">{message.title}</p>
          <p className="mt-1 text-sm leading-6 opacity-90">{message.message}</p>
        </div>
      ))}
    </aside>
  )
}
