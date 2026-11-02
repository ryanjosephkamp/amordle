import { RouteHeader } from '@/components/route-states';
import { LiveGames } from '@/features/combat/live-games';

export default function CombatLivePage() {
  return (
    <div className="route-frame">
      <RouteHeader title="Live COMBAT">
        <p>Watch public Practice games in a read-only view with player privacy intact.</p>
      </RouteHeader>
      <LiveGames />
    </div>
  );
}
