import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';

type Tone = 'primary' | 'secondary' | 'danger' | 'quiet';

export function Button({
  tone = 'secondary',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button className={`button button--${tone} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function ButtonLink({
  tone = 'secondary',
  className = '',
  children,
  ...props
}: LinkProps & { tone?: Tone; children: ReactNode }) {
  return (
    <Link className={`button button--${tone} ${className}`} {...props}>
      {children}
    </Link>
  );
}
