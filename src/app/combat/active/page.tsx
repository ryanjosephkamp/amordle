import { RouteHeader } from '@/components/route-states';
import { ActiveGames } from '@/features/combat/active-games';

export default function CombatActivePage() {
  return (
    <div className="route-frame">
      <RouteHeader title="Active COMBAT">
        <p>Resume waiting, active, and recently completed games after navigation or refresh.</p>
      </RouteHeader>
      <ActiveGames />
    </div>
  );
}
