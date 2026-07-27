import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="route-frame">
      <header className="route-header">
        <h1>That page is not available.</h1>
        <p>The link may be incomplete or the game may no longer be reachable.</p>
      </header>
      <Link className="button primary" href="/">
        Return home
      </Link>
    </div>
  );
}
