import { MatchController } from '@/features/combat/match-controller';
import '@/features/board/board-surface.css';
import '@/features/solo/solo-game.css';

export default async function CombatMatchPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  return (
    <div className="route-frame game-route">
      <MatchController gameId={matchId} />
    </div>
  );
}
