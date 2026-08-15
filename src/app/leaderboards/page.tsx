import Link from 'next/link';
import { RouteHeader, WorkbenchRegion } from '@/components/route-states';
import { LeaderboardTable } from '@/features/community/leaderboard-table';

export default function LeaderboardsPage() {
  return (
    <div className="route-frame">
      <RouteHeader title="Leaderboards">
        <p>
          Public ranked Practice results. Provisional ratings are labeled.{' '}
          <Link href="/methodology">How ratings are calculated</Link>.
        </p>
      </RouteHeader>
      <WorkbenchRegion title="RANKED PRACTICE" status="PUBLIC">
        <LeaderboardTable />
      </WorkbenchRegion>
    </div>
  );
}
