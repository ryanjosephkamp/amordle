'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

/*
 * v9-R4. The one thing in the shell that has to read the query string.
 *
 * `AppShell` called `useSearchParams()` for exactly this — whether `?focus=1` is set. In the
 * App Router that single call forces everything up to the nearest Suspense boundary to be
 * client-rendered, and `layout.tsx` wraps the entire shell in one. So the server rendered a
 * skeleton for every route in the app: the prerendered `/about` document was 19.7 kB with no
 * navigation and no heading in it.
 *
 * Moving the read into a leaf fixes that, because a leaf cannot drag its ancestors into
 * client rendering. It reports the flag UP to the shell rather than providing it downward:
 * a provider would put the shell inside this component's subtree and reintroduce the bailout
 * it exists to remove. The shell keeps every line of its own markup.
 *
 * The agreed cost: the server does not know about Focus Mode, so opening a Focus Mode link
 * cold shows the normal chrome for one frame. Entering it from inside the app is unaffected,
 * because there is no server render involved.
 */
export interface FocusModeState {
  focus: boolean;
  /** Enter Focus Mode, keeping every other parameter the route is carrying. */
  focusHref: string;
  /** Leave it, keeping them too. */
  exitFocusHref: string;
}

export function FocusModeReader({ onChange }: { onChange: (state: FocusModeState) => void }) {
  const search = useSearchParams();
  const pathname = usePathname();
  const focus =
    search.get('focus') === '1' &&
    (pathname.includes('/play/solo/') || pathname.includes('/combat/match/'));

  /*
   * The hrefs are reported from here too, because this is where the query string is known.
   *
   * They were briefly built from the pathname alone, on the assumption that a Focus Mode
   * route carries nothing else worth keeping. That was wrong and the Solo fixture test
   * caught it: `/play/solo/practice/og?generation=19` identifies WHICH game you are in, so
   * dropping it on the way out of Focus Mode sent the player to a different puzzle.
   */
  const href = (withFocus: boolean) => {
    const parameters = new URLSearchParams(search.toString());
    if (withFocus) parameters.set('focus', '1');
    else parameters.delete('focus');
    const query = parameters.toString();
    return `${pathname}${query ? `?${query}` : ''}`;
  };
  const focusHref = href(true);
  const exitFocusHref = href(false);

  useEffect(() => {
    onChange({ focus, focusHref, exitFocusHref });
  }, [exitFocusHref, focus, focusHref, onChange]);

  return null;
}
