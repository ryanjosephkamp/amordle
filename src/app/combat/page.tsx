import Link from 'next/link';
import { RouteHeader } from '@/components/route-states';

const lanes = [
  {
    href: '/combat/practice',
    title: 'Practice',
    description: 'Public unranked matches and compatible ranked matchmaking.',
  },
  {
    href: '/combat/daily',
    title: 'Daily',
    description: 'Five-letter UTC lanes with database-owned answers and turns.',
  },
  {
    href: '/combat/active',
    title: 'Active',
    description: 'Resume participant-owned waiting, playing, and recent terminal games.',
  },
  {
    href: '/combat/lobby',
    title: 'Lobby',
    description: 'Private requests, preferences, blocks, and accepted matches.',
  },
  {
    href: '/combat/live',
    title: 'Live',
    description: 'Sanitized public spectation with participant privacy intact.',
  },
] as const;

export default function CombatPage() {
  return (
    <div className="route-frame">
      <RouteHeader title="COMBAT">
        <p>
          Alternating-turn word games with recoverable state and server-authoritative ranked play.
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
