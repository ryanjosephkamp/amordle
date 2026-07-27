export interface Revisioned<T> {
  revision: number;
  updatedAt: string;
  state: T;
}

export function reconcileRevisioned<T>(
  local: Revisioned<T> | null,
  remote: Revisioned<T> | null,
): Revisioned<T> | null {
  if (!local) return remote;
  if (!remote) return local;
  if (local.revision !== remote.revision) {
    return local.revision > remote.revision ? local : remote;
  }
  return Date.parse(local.updatedAt) >= Date.parse(remote.updatedAt) ? local : remote;
}
