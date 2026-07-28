'use client';

import { useQuery } from '@tanstack/react-query';
import { listPublicLive } from '@/adapters/supabase/combat';
import type { SpectatorGame } from '@/adapters/supabase/combat';
import { SkeletonRows } from '@/components/route-states';

export function LiveGames() {
  const games = useQuery({
    queryKey: ['combat', 'live'],
    queryFn: () => listPublicLive(),
    refetchInterval: 5_000,
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
      <div className="dual-board">
        {game.players.map((player) => (
          <section key={player.seat}>
            <h3>
              {player.label}
              {game.current_turn_seat === player.seat ? ' · turn' : ''}
            </h3>
            <div className="compact-board">
              {game.moves
                .filter((move) => move.seat === player.seat)
                .map((move, moveIndex) => (
                  <div
                    className="board-row"
                    role="row"
                    key={`${player.seat}:${move.puzzleIndex}:${moveIndex}`}
                  >
                    {move.tiles.map((tile, tileIndex) => {
                      const glyph =
                        tile.state === 'correct' ? '✓' : tile.state === 'present' ? '~' : '×';
                      return (
                        <div
                          className={`tile is-${tile.state}`}
                          role="cell"
                          aria-label={`${tile.letter}, ${tile.state}`}
                          key={`${tileIndex}:${tile.letter}`}
                        >
                          <span className="tile-letter">{tile.letter.toUpperCase()}</span>
                          <span className="tile-evidence" aria-hidden="true">
                            {glyph}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}
            </div>
          </section>
        ))}
      </div>
      <footer className="mono">
        {game.progress.moveCount} moves · puzzle {game.progress.currentPuzzleIndex + 1}
      </footer>
    </article>
  );
}
