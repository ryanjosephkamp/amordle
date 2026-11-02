import { RouteHeader, WorkbenchRegion } from '@/components/route-states';
import { PlayerDirectory } from '@/features/community/player-directory';

export default function PlayersPage() {
  return (
    <div className="route-frame">
      <RouteHeader title="Players">
        <p>Find public players, inspect their COMBAT record, or send a private challenge.</p>
      </RouteHeader>
      <WorkbenchRegion title="PLAYER DIRECTORY" status="PUBLIC">
        <PlayerDirectory />
      </WorkbenchRegion>
    </div>
  );
}
