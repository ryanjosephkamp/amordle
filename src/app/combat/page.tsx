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
        <p>Alternating-turn word games that stay safe through refreshes and reconnects.</p>
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
