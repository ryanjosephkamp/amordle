import { useEffect, useState } from 'react'
import { getBackToTopScrollBehavior, readBackToTopState, type BackToTopState } from './backToTopState'

export function BackToTopButton() {
  const [state, setState] = useState<BackToTopState>(() => readBackToTopState())

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    let animationFrame: number | undefined
    const updateState = () => {
      if (animationFrame !== undefined) {
        window.cancelAnimationFrame(animationFrame)
      }
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = undefined
        setState(readBackToTopState())
      })
    }

    window.addEventListener('resize', updateState)
    window.addEventListener('scroll', updateState, { passive: true })

    return () => {
      if (animationFrame !== undefined) {
        window.cancelAnimationFrame(animationFrame)
      }
      window.removeEventListener('resize', updateState)
      window.removeEventListener('scroll', updateState)
    }
  }, [])

  if (!state.visible) {
    return null
  }

  return (
    <button
      aria-label="Back to top"
      className="brrrdle-back-to-top"
      data-lifted={state.lifted ? 'true' : undefined}
      onClick={() => window.scrollTo({ top: 0, behavior: getBackToTopScrollBehavior() })}
      type="button"
    >
      <span aria-hidden="true">↑</span>
    </button>
  )
}
