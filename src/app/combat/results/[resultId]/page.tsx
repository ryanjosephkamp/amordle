import { RouteHeader } from '@/components/route-states';
import { MatchController } from '@/features/combat/match-controller';

export default async function CombatResultPage({
  params,
}: {
  params: Promise<{ resultId: string }>;
}) {
  const { resultId } = await params;
  return (
    <div className="route-frame game-route">
      <RouteHeader title="COMBAT result">
        <p>Terminal evidence, revealed answers, points, and settlement state.</p>
      </RouteHeader>
      <MatchController gameId={resultId} />
    </div>
  );
}
