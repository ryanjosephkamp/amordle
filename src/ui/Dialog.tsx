import { useEffect, useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'

interface DialogProps {
  readonly children: ReactNode
  readonly description?: string
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly title: string
}

export function Dialog({ children, description, isOpen, onClose, title }: DialogProps) {
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) {
    return null
  }

  const dialog = (
    <div
      className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-slate-950/90 p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
      role="presentation"
    >
      <section
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-lg border border-[var(--color-ice-300)]/30 bg-slate-950 p-6 text-slate-100"
        onPointerDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white" id={titleId}>{title}</h2>
            {description ? <p className="text-sm leading-6 text-slate-300" id={descriptionId}>{description}</p> : null}
          </div>
          <Button aria-label="Close dialog" onClick={onClose} size="sm" variant="ghost">×</Button>
        </div>
        <div className="mt-5 text-sm leading-6 text-slate-300">{children}</div>
      </section>
    </div>
  )

  if (typeof document === 'undefined') {
    return dialog
  }

  return createPortal(
    dialog,
    document.body,
  )
}
