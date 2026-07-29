import { RouteHeader } from '@/components/route-states';
import { OpenLobbies } from '@/features/combat/open-lobbies';
import { RequestCenter } from '@/features/combat/request-center';

export default function CombatLobbyPage() {
  return (
    <div className="route-frame">
      <RouteHeader title="COMBAT lobby">
        <p>Join an open public game or manage a private Practice request.</p>
      </RouteHeader>
      <OpenLobbies />
      <RequestCenter />
    </div>
  );
}
