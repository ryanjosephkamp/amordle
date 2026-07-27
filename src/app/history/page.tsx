import { RouteHeader } from '@/components/route-states';
import { HistoryPanel } from '@/features/account/history-panel';

export default function HistoryPage() {
  return (
    <div className="route-frame">
      <RouteHeader title="History">
        <p>Accepted, terminal signed-in games. Rejected guesses never create an entry.</p>
      </RouteHeader>
      <HistoryPanel />
    </div>
  );
}
