import { RouteHeader } from '@/components/route-states';
import { LiveGames } from '@/features/combat/live-games';

export default function CombatLivePage() {
  return (
    <div className="route-frame">
      <RouteHeader title="Live COMBAT">
        <p>
          Watch public Practice games. Spectator projections cannot mutate, queue, notify, forfeit,
          or reveal private identifiers.
        </p>
      </RouteHeader>
      <LiveGames />
    </div>
  );
}
