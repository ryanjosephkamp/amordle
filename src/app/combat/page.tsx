import type { Metadata } from 'next';
import { RouteHeader } from '@/components/route-states';
import { CombatPortal } from '@/features/combat/combat-portal';

export const metadata: Metadata = { title: 'COMBAT' };

/*
 * v8-D. The COMBAT front door.
 *
 * `[4] COMBAT` in the toolbar has always pointed here and there has never been a page
 * at this path — the mode's primary navigation entry did nothing. Five sibling routes
 * carried the whole of multiplayer between them with no way in.
 */
export default function CombatPortalPage() {
  return (
    <div className="route-frame">
      <RouteHeader title="COMBAT">
        <p>
          Play a rated match against another person. Pick a time control to enter its queue —
          ratings are kept separately for each one, so a result only counts against players who
          chose the same game.
        </p>
      </RouteHeader>
      <CombatPortal />
    </div>
  );
}
