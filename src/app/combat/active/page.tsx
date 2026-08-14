import { RouteHeader } from '@/components/route-states';
import { ActiveGames } from '@/features/combat/active-games';

export default function CombatActivePage() {
  return (
    <div className="route-frame">
      {/*
        v9-R3. The sentence promised "recently completed games" and the loader filters
        terminal games out, so the page never showed one. The words were wrong, not the
        list: this page is what you can still act on, and finished games belong to History.
      */}
      <RouteHeader title="Active COMBAT">
        <p>
          Every game waiting on you or on an opponent, kept across navigation and refresh. Finished
          games move to History.
        </p>
      </RouteHeader>
      <ActiveGames />
    </div>
  );
}
