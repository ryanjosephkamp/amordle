'use client';

import { useQuery } from '@tanstack/react-query';
import { listPublicLive } from '@/adapters/supabase/combat';
import type { SpectatorGame } from '@/adapters/supabase/combat';
import { SkeletonRows } from '@/components/route-states';
import { MoveBoards } from './combat-transcript';

export function LiveGames() {
  const games = useQuery({
    queryKey: ['combat', 'live'],
    queryFn: () => listPublicLive(),
    refetchInterval: 30_000,
  });
  if (games.isPending) return <SkeletonRows label="Loading live games…" rows={4} />;
  if (games.isError) {
    return (
      <section className="status-panel">
        <h2>Live games unavailable</h2>
        <button onClick={() => void games.refetch()}>Try again</button>
      </section>
    );
  }
  if (!games.data.length) {
    return <p className="prose">No public Practice games are available to watch right now.</p>;
  }
  return (
    <div className="spectator-list">
      {games.data.map((game) => (
        <SpectatorGamePanel game={game} key={game.id} />
      ))}
    </div>
  );
}

function SpectatorGamePanel({ game }: { game: SpectatorGame }) {
  return (
    <article className="spectator-game">
      <header className="section-heading">
        <div>
          <h2>
            {game.mode.toUpperCase()} · {game.word_length} letters
          </h2>
          <p>
            {game.ranked ? 'Ranked Practice' : 'Public Practice'} · {game.outcome.label}
          </p>
        </div>
        <span className="badge">READ ONLY</span>
      </header>
      <p className="spectator-turn" aria-live="polite">
        {game.current_turn_seat
          ? `${game.players.find((player) => player.seat === game.current_turn_seat)?.label ?? 'Next player'}’s turn`
          : game.outcome.label}
      </p>
      <MoveBoards
        length={game.word_length}
        actorLabels={Object.fromEntries(game.players.map((player) => [player.seat, player.label]))}
        moves={game.moves.map((move, index) => ({
          id: `${move.seat}:${move.puzzleIndex}:${index}`,
          seat: move.seat,
          guess: move.guess,
          tiles: move.tiles,
          acceptedAt:
            move.createdAt ?? `${game.created_at.slice(0, 19)}.${String(index).padStart(3, '0')}Z`,
        }))}
      />
      <footer className="mono">
        {game.progress.moveCount} moves · puzzle {game.progress.currentPuzzleIndex + 1}
      </footer>
    </article>
  );
}
