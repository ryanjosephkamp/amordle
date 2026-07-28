import { RouteHeader } from '@/components/route-states';
import { MatchController } from '@/features/combat/match-controller';

export default async function CombatMatchPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  return (
    <div className="route-frame game-route">
      <RouteHeader title="COMBAT match">
        <p>Your board, the opponent board, and the next valid action stay together.</p>
      </RouteHeader>
      <MatchController gameId={matchId} />
    </div>
  );
}
