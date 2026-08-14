import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * v9-R4. The server must send the page, not a placeholder.
 *
 * For the whole life of this codebase every route's first paint was a skeleton, because
 * `AppShell` called `useSearchParams()` — one call, for the `?focus=1` flag — and in the App
 * Router that forces everything up to the nearest Suspense boundary to client-render. The
 * boundary was in `layout.tsx`, around the entire shell.
 *
 * Nothing caught it. Every browser test drives a hydrated page, so the skeleton had already
 * been replaced by the time anything looked. This reads the prerendered document itself,
 * which is the only place the defect was visible, and it is the check that would have found
 * it years earlier.
 *
 * It runs after `pnpm build` in the local gate, which is where `dist/` comes from.
 */
const prerendered = (route: string): string =>
  readFileSync(new URL(`../../dist/server/app/${route}.html`, import.meta.url), 'utf8');

describe('server-rendered documents', () => {
  it.each([
    ['about', 'About Amordle'],
    ['help', 'Help'],
  ])('sends real content for /%s rather than a placeholder', (route, heading) => {
    const html = prerendered(route);

    // The route's own heading, which only exists once the page itself has rendered.
    expect(html).toContain(`>${heading}<`);

    /*
     * And the shell around it. A document can carry a heading and still have shipped a
     * shell-less page, so the navigation is asserted separately — it is the part that was
     * missing when the whole tree bailed out.
     */
    expect(html).toMatch(/>home<|\[1\]/);

    /*
     * Size is the crude backstop. The skeleton-only document was 19.7 kB; anything at or
     * below that is a page that did not render, whatever else it happens to contain.
     */
    expect(html.length).toBeGreaterThan(20_000);
  });
});
