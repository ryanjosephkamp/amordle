import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyServiceWorkerUpdate,
  UPDATE_RELOAD_FALLBACK_MS,
} from '@/application/service-worker-update';

function fakeContainer() {
  const target = new EventTarget();
  return {
    target,
    addEventListener: (
      type: 'controllerchange',
      listener: () => void,
      options?: { once: boolean },
    ) => target.addEventListener(type, listener, options),
    removeEventListener: (type: 'controllerchange', listener: () => void) =>
      target.removeEventListener(type, listener),
    fire: () => target.dispatchEvent(new Event('controllerchange')),
  };
}

describe('Update now', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('asks the waiting worker to take over and does not reload until it has', () => {
    const container = fakeContainer();
    const waiting = { postMessage: vi.fn() };
    const reload = vi.fn();
    applyServiceWorkerUpdate(waiting, container, reload);
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    expect(reload).not.toHaveBeenCalled();
    container.fire();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads once even if the controller changes again or the fallback fires later', () => {
    const container = fakeContainer();
    const reload = vi.fn();
    applyServiceWorkerUpdate({ postMessage: vi.fn() }, container, reload);
    container.fire();
    container.fire();
    vi.advanceTimersByTime(UPDATE_RELOAD_FALLBACK_MS * 2);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('still reloads when the controller change never arrives', () => {
    const container = fakeContainer();
    const reload = vi.fn();
    applyServiceWorkerUpdate({ postMessage: vi.fn() }, container, reload);
    vi.advanceTimersByTime(UPDATE_RELOAD_FALLBACK_MS - 1);
    expect(reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(reload).toHaveBeenCalledTimes(1);
    container.fire();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
