import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { classNames } from './classNames'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly children: ReactNode
  readonly isActive?: boolean
  readonly size?: ButtonSize
  readonly variant?: ButtonVariant
}

const baseClasses =
  'inline-flex min-h-10 min-w-0 max-w-full items-center justify-center gap-2 whitespace-normal rounded-md border text-center font-semibold leading-snug transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50'

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'border-[var(--color-ice-200)] bg-[var(--color-ice-200)] text-slate-950 hover:bg-white',
  secondary: 'border-slate-700 bg-slate-950 text-slate-100 hover:border-[var(--color-ice-300)] hover:bg-slate-900 hover:text-white',
  ghost: 'border-transparent bg-transparent text-slate-200 hover:border-slate-700 hover:bg-slate-900/80 hover:text-white',
  danger: 'border-rose-300/70 bg-rose-400/15 text-rose-100 hover:border-rose-200 hover:bg-rose-400/25',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-3 text-base',
}

export function Button({ children, className, isActive = false, size = 'md', type = 'button', variant = 'secondary', ...props }: ButtonProps) {
  return (
    <button
      className={classNames(baseClasses, variantClasses[isActive ? 'primary' : variant], sizeClasses[size], className)}
      type={type}
      {...props}
    >
      {children}
    </button>
  )
}
