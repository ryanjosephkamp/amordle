import { RouteHeader } from '@/components/route-states';
import { CalendarView } from '@/features/solo/calendar-view';

export default function CalendarPage() {
  return (
    <div className="route-frame calendar-route">
      <RouteHeader title="Daily calendar" />
      <CalendarView />
    </div>
  );
}
