import { useState } from 'react'
import { shareText } from '../game/share'
import { Button } from './Button'

interface ShareButtonProps {
  readonly label?: string
  readonly text: string
}

export function ShareButton({ label = 'Share results', text }: ShareButtonProps) {
  const [status, setStatus] = useState<'idle' | 'shared' | 'unsupported' | 'error'>('idle')

  async function handleShare() {
    try {
      const result = await shareText(text)
      setStatus(result === 'unsupported' ? 'unsupported' : 'shared')
    } catch {
      setStatus('error')
    }
  }

  const message = status === 'shared'
    ? 'Result copied or shared.'
    : status === 'unsupported'
      ? 'Sharing is not supported in this browser.'
      : status === 'error'
        ? 'Sharing failed. You can copy the text manually.'
        : undefined

  return (
    <div className="space-y-2">
      <Button onClick={handleShare} variant="primary">{label}</Button>
      <textarea
        aria-label="Share text"
        className="h-28 w-full rounded-2xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-200"
        readOnly
        value={text}
      />
      {message ? <p aria-live="polite" className="text-sm font-semibold text-cyan-100">{message}</p> : null}
    </div>
  )
}
