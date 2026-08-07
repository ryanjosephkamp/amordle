import Link from 'next/link';
import { RouteHeader } from '@/components/route-states';

const lanes = [
  {
    href: '/combat/practice',
    title: 'Practice',
    description: 'Create an open match or find a compatible ranked opponent.',
  },
  {
    href: '/combat/daily',
    title: 'Daily',
    description: 'Play today’s shared five-letter puzzle in UTC lanes.',
  },
  {
    href: '/combat/active',
    title: 'Active',
    description: 'Resume waiting, playing, and recently completed games.',
  },
  {
    href: '/combat/lobby',
    title: 'Lobby',
    description: 'Send and manage private Practice requests.',
  },
  {
    href: '/combat/live',
    title: 'Live',
    description: 'Watch public Practice matches in read-only mode.',
  },
] as const;

export default function CombatPage() {
  return (
    <div className="route-frame">
      <RouteHeader title="COMBAT">
        <p>Welcome to amordle COMBAT!</p>
        <p>
          Hard-core, competitive, turn-based multiplayer &ndash; like online chess, but for Wordle.
        </p>
        <ul>
          <li>Play Practice to hone your skills.</li>
          <li>Play Daily to earn your streak.</li>
          <li>Play Ranked to climb the leaderboards.</li>
        </ul>
        <p>
          Looking for Private Practice?
          <br />
          Find a player in <Link href="/players">Players</Link> and send your request.
        </p>
      </RouteHeader>
      <div className="route-grid">
        {lanes.map((lane) => (
          <Link className="route-link" href={lane.href} key={lane.href}>
            <strong>{lane.title}</strong>
            <span>{lane.description}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
