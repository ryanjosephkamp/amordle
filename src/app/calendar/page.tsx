import { RouteHeader } from '@/components/route-states';
import { CalendarView } from '@/features/solo/calendar-view';

export default function CalendarPage() {
  return (
    <div className="route-frame">
      <RouteHeader title="Daily Calendar">
        <p>
          Solo follows your local date. COMBAT follows UTC. Every past Solo date can be inspected
          before any purchase.
        </p>
      </RouteHeader>
      <CalendarView />
    </div>
  );
}
