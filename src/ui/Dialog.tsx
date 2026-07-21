import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'

interface DialogProps {
  readonly children: ReactNode
  readonly description?: string
  readonly isOpen: boolean
  readonly onClose: () => void
  readonly title: string
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => (
      !element.hasAttribute('hidden')
      && element.getAttribute('aria-hidden') !== 'true'
      && element.getClientRects().length > 0
    ))
}

export function Dialog({ children, description, isOpen, onClose, title }: DialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const closeHandlerRef = useRef(onClose)
  const dialogRef = useRef<HTMLElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    closeHandlerRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    const dialog = dialogRef.current
    const overlay = overlayRef.current
    if (!dialog || !overlay) {
      return undefined
    }

    const invoker = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const bodyOverflow = document.body.style.overflow
    const isolatedElements = Array.from(document.body.children)
      .filter((element): element is HTMLElement => (
        element instanceof HTMLElement && element !== overlay
      ))
      .map((element) => ({
        ariaHidden: element.getAttribute('aria-hidden'),
        element,
        hadAriaHidden: element.hasAttribute('aria-hidden'),
        inert: element.inert,
      }))

    document.body.style.overflow = 'hidden'
    for (const isolated of isolatedElements) {
      isolated.element.inert = true
      isolated.element.setAttribute('aria-hidden', 'true')
    }

    // Consumers may mark one descendant for initial focus. Otherwise the
    // named dialog surface itself receives focus without guessing at intent.
    const initialFocus = dialog.querySelector<HTMLElement>('[data-dialog-initial-focus]') ?? dialog
    const focusFrame = window.requestAnimationFrame(() => initialFocus.focus())

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeHandlerRef.current()
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const focusableElements = getFocusableElements(dialog!)
      if (focusableElements.length === 0) {
        event.preventDefault()
        dialog!.focus()
        return
      }

      const firstElement = focusableElements[0]
      const lastElement = focusableElements.at(-1)
      const activeElement = document.activeElement

      if (event.shiftKey && (activeElement === firstElement || !dialog!.contains(activeElement))) {
        event.preventDefault()
        lastElement?.focus()
      } else if (!event.shiftKey && (activeElement === lastElement || !dialog!.contains(activeElement))) {
        event.preventDefault()
        firstElement?.focus()
      }
    }

    function handleFocusIn(event: FocusEvent) {
      if (!dialog!.contains(event.target as Node)) {
        const [firstElement] = getFocusableElements(dialog!)
        ;(firstElement ?? dialog!).focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('focusin', handleFocusIn, true)

    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('focusin', handleFocusIn, true)
      document.body.style.overflow = bodyOverflow
      for (const isolated of isolatedElements) {
        isolated.element.inert = isolated.inert
        if (isolated.hadAriaHidden) {
          isolated.element.setAttribute('aria-hidden', isolated.ariaHidden ?? '')
        } else {
          isolated.element.removeAttribute('aria-hidden')
        }
      }
      if (invoker?.isConnected) {
        invoker.focus()
      }
    }
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  const dialog = (
    <div
      className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto overscroll-contain bg-slate-950/90 p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          closeHandlerRef.current()
        }
      }}
      ref={overlayRef}
      role="presentation"
    >
      <section
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className="max-h-[calc(100dvh-2rem)] min-w-0 w-full max-w-lg overflow-x-hidden overflow-y-auto rounded-lg border border-[var(--color-ice-300)]/30 bg-slate-950 p-6 text-slate-100 [overflow-wrap:anywhere]"
        onPointerDown={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white" id={titleId}>{title}</h2>
            {description ? <p className="text-sm leading-6 text-slate-300" id={descriptionId}>{description}</p> : null}
          </div>
          <Button
            aria-label="Close dialog"
            data-dialog-close
            onClick={() => closeHandlerRef.current()}
            size="sm"
            variant="ghost"
          >
            ×
          </Button>
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
