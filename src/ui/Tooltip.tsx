import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { classNames } from './classNames'

interface TooltipProps {
  /** Accessible label for the trigger, e.g. "More information about Difficulty". */
  readonly label: string
  /** Tooltip body content shown on hover/focus. */
  readonly children: ReactNode
  readonly className?: string
}

/**
 * Accessible information tooltip. The trigger is a real `<button>` so it is
 * reachable by keyboard and announced by screen readers; the popup is linked
 * via `aria-describedby` and is revealed on hover and on focus, and dismissed
 * on blur, mouse-leave, or Escape. No hover-only behaviour, so it works for
 * keyboard and touch users alike.
 */
export function Tooltip({ label, children, className }: TooltipProps) {
  const tooltipId = useId()
  const [open, setOpen] = useState(false)
  const [bubbleStyle, setBubbleStyle] = useState<CSSProperties>({})
  const buttonRef = useRef<HTMLButtonElement>(null)
  const bubbleRef = useRef<HTMLSpanElement>(null)
  const rootRef = useRef<HTMLSpanElement>(null)

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape' && open) {
      event.stopPropagation()
      setOpen(false)
    }
  }

  useEffect(() => {
    if (!open) {
      return undefined
    }

    function updatePosition() {
      const trigger = buttonRef.current
      if (!trigger || typeof window === 'undefined') {
        return
      }
      const rect = trigger.getBoundingClientRect()
      if (window.innerWidth < 640) {
        setBubbleStyle({
          bottom: '1rem',
          left: '1rem',
          right: '1rem',
        })
        return
      }
      const width = 240
      const edgeGap = 16
      const left = Math.min(
        window.innerWidth - edgeGap - width / 2,
        Math.max(edgeGap + width / 2, rect.left + rect.width / 2),
      )
      const top = Math.min(window.innerHeight - edgeGap - 96, rect.bottom + 8)
      setBubbleStyle({ left, top })
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target
      if (target instanceof Node && rootRef.current?.contains(target)) {
        return
      }
      if (target instanceof Node && bubbleRef.current?.contains(target)) {
        return
      }
      setOpen(false)
    }

    updatePosition()
    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  const bubble = open ? (
    <span
      className="pointer-events-none fixed z-[100] max-h-[min(16rem,calc(100vh-2rem))] w-60 max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-y-auto rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-left text-xs font-normal leading-relaxed text-slate-200 opacity-100 max-sm:w-auto max-sm:translate-x-0 max-sm:text-sm"
      id={tooltipId}
      ref={bubbleRef}
      role="tooltip"
      style={bubbleStyle}
    >
      {children}
    </span>
  ) : null

  return (
    <span className={classNames('relative inline-flex', className)} ref={rootRef}>
      <button
        aria-describedby={open ? tooltipId : undefined}
        aria-label={label}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-600 bg-slate-900/80 text-[0.65rem] font-bold text-slate-200 transition hover:border-[var(--color-ice-300)] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]"
        ref={buttonRef}
        onBlur={() => { setOpen(false) }}
        onClick={() => { setOpen(true) }}
        onFocus={() => { setOpen(true) }}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => { setOpen(true) }}
        onMouseLeave={() => { setOpen(false) }}
        type="button"
      >
        <span aria-hidden="true">?</span>
      </button>
      {typeof document === 'undefined' ? bubble : createPortal(bubble, document.body)}
    </span>
  )
}
