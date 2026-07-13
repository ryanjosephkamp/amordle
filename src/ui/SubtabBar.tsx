import type { KeyboardEvent } from 'react'
import { Button } from './Button'

export interface SubtabOption<TSubtabId extends string> {
  readonly id: TSubtabId
  readonly label: string
  readonly description?: string
  readonly attention?: {
    readonly ariaLabel: string
    readonly label: string
    readonly tone?: 'neutral' | 'attention' | 'urgent'
  }
}

interface SubtabBarProps<TSubtabId extends string> {
  readonly activeId: TSubtabId
  readonly label: string
  readonly onSelect: (id: TSubtabId) => void
  readonly options: readonly SubtabOption<TSubtabId>[]
}

function focusTab(tablist: HTMLElement | null, index: number): void {
  const tabs = tablist?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
  const tab = tabs?.[index]
  if (!tab) {
    return
  }

  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => tab.focus())
    return
  }

  tab.focus()
}

export function SubtabBar<TSubtabId extends string>({ activeId, label, onSelect, options }: SubtabBarProps<TSubtabId>) {
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const lastIndex = options.length - 1
    let nextIndex: number | undefined

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = index === lastIndex ? 0 : index + 1
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = index === 0 ? lastIndex : index - 1
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = lastIndex
    }

    if (nextIndex === undefined) {
      return
    }

    event.preventDefault()
    const nextOption = options[nextIndex]
    if (nextOption) {
      onSelect(nextOption.id)
      focusTab(event.currentTarget.parentElement, nextIndex)
    }
  }

  return (
    <div aria-label={label} className="flex flex-wrap gap-2 rounded-lg border border-white/10 bg-slate-950 p-1" role="tablist">
      {options.map((option, index) => {
        const isActive = option.id === activeId
        const attentionDescriptionId = option.attention
          ? `subtab-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${option.id}-attention`
          : undefined

        return (
          <Button
            aria-describedby={attentionDescriptionId}
            aria-label={option.label}
            aria-selected={isActive}
            isActive={isActive}
            key={option.id}
            onClick={() => onSelect(option.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            role="tab"
            size="sm"
            tabIndex={isActive ? 0 : -1}
            title={option.description}
            variant="secondary"
          >
            <span>{option.label}</span>
            {option.attention ? (
              <>
                <span className="sr-only" id={attentionDescriptionId}>
                  {option.attention.ariaLabel}
                </span>
                <span
                  aria-hidden="true"
                  className="brrrdle-attention-badge"
                  data-active={isActive ? 'true' : undefined}
                  data-tone={option.attention.tone ?? 'attention'}
                >
                  {option.attention.label}
                </span>
              </>
            ) : null}
          </Button>
        )
      })}
    </div>
  )
}
