import Link from 'next/link';
import { RouteHeader, WorkbenchRegion } from '@/components/route-states';
import { HomeAttention } from '@/features/home/home-attention';
import { getOwnerNamespace } from '@/server/identity';

export default async function HomePage() {
  const ownerNamespace = await getOwnerNamespace();
  return (
    <div className="route-frame home-workspace">
      <RouteHeader title="Choose your next game">
        <p>A word game for exact minds. Pick a mode; every row is a real destination.</p>
      </RouteHeader>
      <div className="home-layout">
        <WorkbenchRegion title="game commands" status="select one" className="home-commands">
          <div className="command-list">
            <Link className="command-row is-primary" href="/play/solo">
              <span className="command-code">
                <i aria-hidden="true">❯</i> solo practice
              </span>
              <span>Play an unranked puzzle or linked GO run.</span>
              <strong>[1]</strong>
            </Link>
            <Link className="command-row" href="/calendar">
              <span className="command-code">
                <i aria-hidden="true"> </i> daily
              </span>
              <span>Play today or inspect a past puzzle.</span>
              <strong>[2]</strong>
            </Link>
            <Link className="command-row" href="/combat">
              <span className="command-code">
                <i aria-hidden="true"> </i> combat
              </span>
              <span>Join another player or resume a match.</span>
              <strong>[3]</strong>
            </Link>
            <Link className="command-row" href="/words">
              <span className="command-code">
                <i aria-hidden="true"> </i> words
              </span>
              <span>Explore the public word bank.</span>
              <strong>[4]</strong>
            </Link>
            <Link className="command-row" href="/history">
              <span className="command-code">
                <i aria-hidden="true"> </i> history
              </span>
              <span>Review completed account games.</span>
              <strong>[5]</strong>
            </Link>
          </div>
        </WorkbenchRegion>
        <WorkbenchRegion title="right now" status="account attention">
          <HomeAttention ownerNamespace={ownerNamespace} />
        </WorkbenchRegion>
      </div>
    </div>
  );
}
