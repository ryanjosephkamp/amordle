import { RouteHeader } from '@/components/route-states';
import { PrivateStats } from '@/features/account/private-stats';

export default function StatsPage() {
  return (
    <div className="route-frame">
      <RouteHeader title="Your stats">
        <p>Private progression and completed-game measures for your current account.</p>
      </RouteHeader>
      <PrivateStats />
    </div>
  );
}
