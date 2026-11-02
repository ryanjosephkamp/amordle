/*
 * "Update now": hand the waiting worker the go-ahead, then reload once it controls the page.
 *
 * Reloading straight after `SKIP_WAITING` races the worker's activation. If the reload wins,
 * the page comes back under the old worker, the update prompt reappears, and a second tap is
 * needed. The page is reloaded on `controllerchange` instead, which fires when the new worker
 * takes over. A short fallback reloads anyway if that event never arrives, so the button
 * cannot leave a player stuck on the old build.
 */
export const UPDATE_RELOAD_FALLBACK_MS = 3_000;

export interface UpdateWorker {
  postMessage(message: unknown): void;
}

export interface UpdateContainer {
  addEventListener(
    type: 'controllerchange',
    listener: () => void,
    options?: { once: boolean },
  ): void;
  removeEventListener(type: 'controllerchange', listener: () => void): void;
}

export function applyServiceWorkerUpdate(
  waiting: UpdateWorker,
  container: UpdateContainer,
  reload: () => void,
  fallbackMs: number = UPDATE_RELOAD_FALLBACK_MS,
): void {
  let reloaded = false;
  const timer = setTimeout(() => reloadOnce(), fallbackMs);
  function reloadOnce() {
    if (reloaded) return;
    reloaded = true;
    clearTimeout(timer);
    container.removeEventListener('controllerchange', reloadOnce);
    reload();
  }
  container.addEventListener('controllerchange', reloadOnce, { once: true });
  waiting.postMessage({ type: 'SKIP_WAITING' });
}
