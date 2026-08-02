import { RouteHeader } from '@/components/route-states';
import { OpenLobbies } from '@/features/combat/open-lobbies';
import { RequestCenter } from '@/features/combat/request-center';

export default function CombatLobbyPage() {
  return (
    <div className="route-frame">
      <RouteHeader title="COMBAT lobby">
        <p>Join an open public game or manage a private Practice request.</p>
      </RouteHeader>
      <div className="combat-lobby-region combat-lobby-region--public">
        <OpenLobbies />
      </div>
      <section
        className="combat-lobby-region combat-lobby-region--private"
        aria-labelledby="private-matches-heading"
      >
        <div className="section-heading combat-lobby-region-heading">
          <div>
            <h2 id="private-matches-heading">Private matches</h2>
            <p>Send and manage direct Practice requests.</p>
          </div>
        </div>
        <RequestCenter />
      </section>
    </div>
  );
}
