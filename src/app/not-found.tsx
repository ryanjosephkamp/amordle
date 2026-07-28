import Link from 'next/link';
import { RouteHeader, StatusPanel } from '@/components/route-states';

export default function NotFound() {
  return (
    <div className="route-frame">
      <RouteHeader title="Page unavailable">
        <p>The link may be incomplete or the game may no longer be reachable.</p>
      </RouteHeader>
      <StatusPanel
        title="NOT FOUND"
        action={
          <Link className="button primary" href="/">
            RETURN HOME
          </Link>
        }
      >
        <p>Choose a known destination to continue.</p>
      </StatusPanel>
    </div>
  );
}
