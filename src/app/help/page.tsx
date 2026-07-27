import { RouteHeader } from '@/components/route-states';

const sections = [
  [
    'OG and scoring',
    'OG has one answer. Each accepted guess receives a tile for every letter. Green means correct position, yellow means the letter occurs elsewhere, and gray means no unmatched copy remains. Repeated letters are scored exact positions first, then by remaining multiplicity.',
  ],
  [
    'GO chains',
    'GO links 5, 7, or 10 Practice puzzles; Daily GO always has five. A solved answer stays visible for two seconds, then becomes labeled evidence against the next answer. Those seeded rows inform Hard Mode but do not count as new guesses or points.',
  ],
  [
    'Practice and Daily',
    'Practice supports 2–35 letters, three nested difficulties, and optional Hard Mode. Solo Daily follows your local date and always uses five letters. COMBAT Daily follows UTC.',
  ],
  [
    'Hard Mode',
    'Keep green letters fixed, reuse every proven positive letter at least as many times as evidence shows, and avoid letters shown only as absent. Yellow letters do not create an invented position ban.',
  ],
  [
    'COMBAT',
    'Players alternate accepted turns. Ranked Practice and current Daily authority live in the database. Refreshing never spends a turn, and rejected guesses change nothing. Public Live views are read-only and sanitized.',
  ],
  [
    'Coins and tools',
    'Reveal One Letter costs 25 coins and Remove Incorrect Letters costs 40. A locked past Daily costs 60. Continuations add exactly one Practice attempt and become more expensive as used; all accepted economy operations are idempotent.',
  ],
  [
    'Access and navigation',
    'Use Tab and Shift+Tab to move, Enter or Space to activate controls, and Escape to close menus or dialogs. Focus Mode keeps the same game and removes surrounding navigation. Tile meaning is announced and never relies on color alone.',
  ],
  [
    'Privacy',
    'Public links use a public profile identifier, not an Auth ID. Spectators never receive private requests, raw identities, hidden answers, or mutation controls. Guest progress stays separate when you sign in.',
  ],
] as const;

export default function HelpPage() {
  return (
    <div className="route-frame is-narrow">
      <RouteHeader title="Help">
        <p>The rules and controls players need, without implementation language.</p>
      </RouteHeader>
      <div className="prose-sections">
        {sections.map(([title, content]) => (
          <section key={title}>
            <h2>{title}</h2>
            <p>{content}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
