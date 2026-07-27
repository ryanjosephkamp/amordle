import Link from 'next/link';
import { HomeAttention } from '@/features/home/home-attention';

export default function HomePage() {
  return (
    <div className="route-frame">
      <header className="route-header">
        <h1>Your next word is ready.</h1>
        <p>
          Play a focused Solo game, take on today’s challenge, or meet another player in COMBAT.
          Games save as you play.
        </p>
      </header>
      <div className="action-row">
        <Link className="button primary" href="/play/solo/practice/og">
          Start Solo Practice
        </Link>
        <Link className="button" href="/calendar">
          Play Daily
        </Link>
        <Link className="button" href="/combat">
          Open COMBAT
        </Link>
      </div>
      <section aria-labelledby="attention-heading" style={{ marginTop: '3rem' }}>
        <h2 id="attention-heading" className="mono">
          Right now
        </h2>
        <HomeAttention />
      </section>
    </div>
  );
}
