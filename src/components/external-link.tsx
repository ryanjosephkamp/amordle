import type { PropsWithChildren } from 'react';

/*
 * One outbound-link treatment for the whole app.
 *
 * There were two before this, and they disagreed: SEARCH WEB in the word
 * definition panel carried `rel="noopener noreferrer"`, OPEN GITHUB ISSUE
 * carried a bare `rel="noreferrer"`, and nothing offered an inline outbound
 * link at all. About and Methodology are mostly outbound links, so the choice
 * was to add a third pattern or to settle it. This settles it.
 *
 * `noopener` is the one that matters — it denies the opened page a handle back
 * to this one — and modern engines imply it for `target="_blank"`, but stating
 * it costs nothing and does not depend on the engine being modern.
 *
 * No icon or glyph convention: the shell has none, and inventing one here would
 * put a mark next to every link on two link-dense pages.
 *
 * A plain function component with no state, so it stays a server component and
 * these pages keep prerendering as static documents.
 */
export function ExternalLink({
  href,
  variant = 'inline',
  children,
}: PropsWithChildren<{ href: string; variant?: 'inline' | 'button' | 'button-primary' }>) {
  const className =
    variant === 'button' ? 'button' : variant === 'button-primary' ? 'button primary' : undefined;
  return (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
