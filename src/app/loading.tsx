import { SkeletonRows } from '@/components/workbench';

/*
 * V7-11. The App Router had no `loading.tsx` anywhere, so a route segment that
 * suspended showed whatever the layout's Suspense fallback happened to be — the literal
 * string "Loading…" with no styling and no accessible status role. This renders the
 * skeleton primitive the app already ships, inside the same route frame the real page
 * uses, so the transition is a placeholder for the page rather than a jump to bare text.
 *
 * It deliberately renders no `<main>` and no `<h1>`: the shell already owns the main
 * landmark, and announcing a heading of "Loading" would displace the real route title
 * for anyone navigating by heading.
 */
export default function RouteLoading() {
  return (
    <div className="route-frame" aria-busy="true">
      <SkeletonRows label="Loading this route…" rows={4} />
    </div>
  );
}
