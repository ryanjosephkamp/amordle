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
