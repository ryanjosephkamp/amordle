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
        <p>Review the final boards, answers, points, rating, and available next match.</p>
      </RouteHeader>
      <MatchController gameId={resultId} presentation="review" />
    </div>
  );
}
