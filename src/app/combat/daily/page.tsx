import { RouteHeader } from '@/components/route-states';
import { DailyLobby } from '@/features/combat/daily-lobby';

export default function CombatDailyPage() {
  return (
    <div className="route-frame">
      <RouteHeader title="Daily COMBAT">
        <p>Five-letter UTC Daily lanes. The database selects answers and owns every turn.</p>
      </RouteHeader>
      <DailyLobby />
    </div>
  );
}
