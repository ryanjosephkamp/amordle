import { RouteHeader } from '@/components/route-states';
import { RequestCenter } from '@/features/combat/request-center';

export default function CombatLobbyPage() {
  return (
    <div className="route-frame">
      <RouteHeader title="COMBAT lobby">
        <p>Send, accept, decline, cancel, or block private Practice requests.</p>
      </RouteHeader>
      <RequestCenter />
    </div>
  );
}
