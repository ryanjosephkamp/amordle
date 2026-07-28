import Link from 'next/link';
import { RouteHeader, WorkbenchRegion } from '@/components/route-states';
import { HomeAttention } from '@/features/home/home-attention';

export default function HomePage() {
  return (
    <div className="route-frame home-workspace">
      <RouteHeader title="Choose your next game">
        <p>Pick a mode and get to work.</p>
      </RouteHeader>
      <div className="home-layout">
        <WorkbenchRegion title="GAME COMMANDS" status="SELECT ONE" className="home-commands">
          <div className="command-list">
            <Link className="command-row is-primary" href="/play/solo/practice/og">
              <span className="command-code">SOLO / PRACTICE</span>
              <span>One puzzle or a linked GO run.</span>
              <strong>START SOLO</strong>
            </Link>
            <Link className="command-row" href="/calendar">
              <span className="command-code">DAILY / LOCAL DATE</span>
              <span>Return to today or inspect a past puzzle.</span>
              <strong>PLAY DAILY</strong>
            </Link>
            <Link className="command-row" href="/combat">
              <span className="command-code">COMBAT / ALTERNATING TURNS</span>
              <span>Join a public lane or resume a match.</span>
              <strong>OPEN COMBAT</strong>
            </Link>
          </div>
        </WorkbenchRegion>
        <WorkbenchRegion title="RIGHT NOW" status="ACCOUNT ATTENTION">
          <HomeAttention />
        </WorkbenchRegion>
      </div>
    </div>
  );
}
