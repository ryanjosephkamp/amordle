import { RouteHeader, WorkbenchRegion } from '@/components/route-states';
import { HistoryPanel } from '@/features/account/history-panel';

export default function HistoryPage() {
  return (
    <div className="route-frame">
      <RouteHeader title="History">
        <p>Your completed signed-in games. Rejected guesses never appear here.</p>
      </RouteHeader>
      <WorkbenchRegion title="COMPLETED GAMES" status="NEWEST FIRST">
        <HistoryPanel />
      </WorkbenchRegion>
    </div>
  );
}
