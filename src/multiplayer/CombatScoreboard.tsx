import type { MultiplayerGame, MultiplayerPlayerId } from './multiplayer'
import {
  getCombatResultPresentation,
  projectCombatScorelines,
} from './combatPresentation'

type CombatRatingMap = Partial<Record<MultiplayerPlayerId, number>>

function formatPoints(points: number): string {
  return `${points} PTS`
}

export function CombatScoreboard({
  game,
  ratings,
  viewerUserId,
}: {
  readonly game: MultiplayerGame
  readonly ratings?: CombatRatingMap
  readonly viewerUserId?: string
}) {
  const scorelines = projectCombatScorelines(game, viewerUserId)
  return (
    <section
      aria-label="COMBAT scoreline"
      className="combat-scoreboard"
      data-combat-scoreline="true"
    >
      <div className="combat-scoreboard-heading">
        <p>COMBAT SCORELINE</p>
        <span>{game.ranked ? 'RANKED' : 'UNRANKED'}</span>
      </div>
      <div className="combat-scoreboard-grid" aria-live="polite">
        {scorelines.map((scoreline) => (
          <article
            className="combat-scoreline"
            data-leading={scoreline.isLeading ? 'true' : undefined}
            data-turn={scoreline.turnState}
            key={scoreline.playerId}
          >
            <div className="min-w-0">
              <p className="combat-scoreline-name">
                {scoreline.label}
                {scoreline.isViewer ? <span>YOU</span> : null}
              </p>
              <p className="combat-scoreline-state">
                {scoreline.turnState === 'active'
                  ? 'ACTIVE TURN'
                  : scoreline.turnState === 'waiting'
                    ? 'WAITING'
                    : scoreline.isLeading
                      ? 'POINTS LEADER'
                      : 'FINAL'}
              </p>
            </div>
            <div className="text-right">
              <p className="combat-scoreline-points">{formatPoints(scoreline.points)}</p>
              <p className="combat-scoreline-rating">
                {typeof ratings?.[scoreline.playerId] === 'number'
                  ? `${ratings[scoreline.playerId]} ELO`
                  : game.ranked ? 'ELO UNAVAILABLE' : 'UNRATED'}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export function CombatResultPanel({
  game,
  ratings,
  viewerUserId,
}: {
  readonly game: MultiplayerGame
  readonly ratings?: CombatRatingMap
  readonly viewerUserId?: string
}) {
  const result = getCombatResultPresentation(game, viewerUserId)
  return (
    <section className="combat-result" data-result-reason={result.reason}>
      <p className="combat-result-kicker">
        {result.viewerOutcome === 'win'
          ? 'VICTORY'
          : result.viewerOutcome === 'loss'
            ? 'DEFEAT'
            : 'MATCH CLOSED'}
      </p>
      <h3>{result.headline}</h3>
      <p>{result.detail}</p>
      <p className="combat-result-settlement">{result.settlementLabel}</p>
      {result.reason === 'cancelled' ? null : (
        <CombatScoreboard game={game} ratings={ratings} viewerUserId={viewerUserId} />
      )}
    </section>
  )
}
