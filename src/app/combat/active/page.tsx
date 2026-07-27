import { RouteHeader } from '@/components/route-states';
import { ActiveGames } from '@/features/combat/active-games';

export default function CombatActivePage() {
  return (
    <div className="route-frame">
      <RouteHeader title="Active COMBAT">
        <p>
          Resume participant-owned games after navigation, refresh, or a fresh signed-in context.
        </p>
      </RouteHeader>
      <ActiveGames />
    </div>
  );
}
