export function soloSessionsQueryKey(ownerNamespace: string) {
  return ['solo-sessions', ownerNamespace] as const;
}
