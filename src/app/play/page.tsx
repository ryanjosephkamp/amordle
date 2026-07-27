import Link from 'next/link';

export const metadata = { title: 'Play' };

export default function PlayPage() {
  return (
    <div className="route-frame">
      <header className="route-header">
        <h1>Choose how to play.</h1>
        <p>
          Solo games work for guests and signed-in players. COMBAT uses your account so both players
          can recover the same match.
        </p>
      </header>
      <div className="data-list">
        <div className="data-row">
          <div>
            <strong>Solo</strong>
            <p className="prose">Practice on demand or play by local date.</p>
          </div>
          <Link className="button primary" href="/play/solo">
            Set up Solo
          </Link>
        </div>
        <div className="data-row">
          <div>
            <strong>COMBAT</strong>
            <p className="prose">Public, ranked, Daily, private, and rematch lanes.</p>
          </div>
          <Link className="button" href="/combat">
            Open COMBAT
          </Link>
        </div>
      </div>
    </div>
  );
}
