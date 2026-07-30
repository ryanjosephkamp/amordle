export function accountEconomyNamespace(userId: string): string {
  return `account:${userId}`;
}

export function economyQueryKey(namespace: string) {
  return ['economy', namespace] as const;
}
