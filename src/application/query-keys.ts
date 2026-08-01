export function accountEconomyNamespace(userId: string): string {
  return `account:${userId}`;
}

export function economyQueryKey(namespace: string) {
  return ['economy', namespace] as const;
}

export function myProfileQueryKey(userId: string) {
  return ['profile', 'mine', userId] as const;
}

export function myAccentPresetsQueryKey(userId: string) {
  return ['profile', 'accent-presets', userId] as const;
}

export function historyQueryKey(userId: string) {
  return ['history', userId] as const;
}

export function progressQueryKey(userId: string) {
  return ['progress', userId] as const;
}

export function ratingsQueryKey(userId: string) {
  return ['ratings', userId] as const;
}

export function completionOutboxQueryKey(userId: string) {
  return ['completion-outbox', userId] as const;
}

export function settingsQueryKey(userId: string) {
  return ['settings', userId] as const;
}
