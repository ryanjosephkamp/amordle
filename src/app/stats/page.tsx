import { RouteHeader, WorkbenchRegion } from '@/components/route-states';
import { PrivateStats } from '@/features/account/private-stats';

export default function StatsPage() {
  return (
    <div className="route-frame">
      <RouteHeader title="Your stats">
        <p>Progress and completed-game measures for your current account.</p>
      </RouteHeader>
      <WorkbenchRegion title="PLAYER SUMMARY" status="PRIVATE">
        <PrivateStats />
      </WorkbenchRegion>
    </div>
  );
}
