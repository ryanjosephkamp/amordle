import { RouteHeader } from '@/components/route-states';
import { LeaderboardTable } from '@/features/community/leaderboard-table';

export default function LeaderboardsPage() {
  return (
    <div className="route-frame">
      <RouteHeader title="Leaderboards">
        <p>Public ranked Practice results. Provisional ratings are labeled.</p>
      </RouteHeader>
      <LeaderboardTable />
    </div>
  );
}
