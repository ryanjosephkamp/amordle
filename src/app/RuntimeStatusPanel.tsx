export function RuntimeStatusPanel({
  online,
  offlineReady,
  needRefresh,
  onDismissOffline,
  onUpdate,
  onLater,
}: {
  online: boolean;
  offlineReady: boolean;
  needRefresh: boolean;
  onDismissOffline: () => void;
  onUpdate: () => void;
  onLater: () => void;
}) {
  if (online && !needRefresh && !offlineReady) return null;
  return (
    <aside className="runtime-status" aria-live="polite" aria-label="Application status">
      {!online ? <p>Offline · saved Solo Practice remains available on this device.</p> : null}
      {offlineReady ? (
        <p>
          Offline shell ready.
          <button type="button" onClick={onDismissOffline}>
            Dismiss
          </button>
        </p>
      ) : null}
      {needRefresh ? (
        <p>
          An Amordle update is ready.
          <button type="button" onClick={onUpdate}>
            Update now
          </button>
          <button type="button" onClick={onLater}>
            Later
          </button>
        </p>
      ) : null}
    </aside>
  );
}
