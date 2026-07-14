# amordle Supabase Notes

## Current state

A dedicated amordle Supabase project has been created, but Codex access, dedicated/empty-state verification, linking, migration application, and authority testing remain pending. The repository contains the complete 41-file ordered migration history from the locked functional checkpoint. Those files are preserved byte-for-byte and must be applied only to the exact verified amordle project under separate authorization.

Do not reuse, inspect, or modify any existing product’s Supabase project, Auth users, Storage objects, database rows, project reference, service-role key, or redirect configuration.

## Compatibility identifiers

The migrations and runtime intentionally retain non-user-facing identifiers such as the `brrrdle_private` schema and existing RPC/table/storage names. These identifiers protect source parity and must not be renamed during bootstrap.

## Future independent setup gate

When separately authorized:

1. Verify the dedicated amordle Supabase project identity and empty application state.
2. Dry-run and then apply all 41 migrations in filename order.
3. Verify exact local/remote migration-ledger equality.
4. Audit RLS, grants, private schemas, RPC fingerprints, answer privacy, and security/performance advisors.
5. Configure amordle-only Site URL and approved redirect URLs.
6. Run real temporary-account E2E with process-scoped credentials.
7. Delete all temporary users and rows, then prove zero residue.

Browser code may receive only the public project URL and anon/publishable value. A service-role key may be used only from the Node-side E2E harness and must never be printed or committed.
