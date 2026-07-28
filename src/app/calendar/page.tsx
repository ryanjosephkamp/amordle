import { RouteHeader, WorkbenchRegion } from '@/components/route-states';
import { CalendarView } from '@/features/solo/calendar-view';

export default function CalendarPage() {
  return (
    <div className="route-frame">
      <RouteHeader title="Daily calendar">
        <p>
          Solo follows your local date. COMBAT follows UTC. Every past Solo date can be inspected
          before any purchase.
        </p>
      </RouteHeader>
      <WorkbenchRegion title="LOCAL DAILY CALENDAR" status="RECENT 35 DAYS">
        <CalendarView />
      </WorkbenchRegion>
    </div>
  );
}
