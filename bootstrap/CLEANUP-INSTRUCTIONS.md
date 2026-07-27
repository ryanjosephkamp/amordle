# Amordle Cleanup Instructions

## 1. Bootstrap preparation

This bootstrap preparation deletes no player rows, Auth users, storage objects,
service data, or deployment resources.

The shell and successor share Supabase. Real-player cleanup before a proven
replacement would also reset the accepted shell.

## 2. Hosted E2E cleanup

Use the run-scoped registry and dependency order in
`TESTING-AND-ACCEPTANCE-CONTRACT.md`.

Rules:

- create a resource record immediately after creation;
- use exact primary keys, Auth UUIDs, object paths, and idempotency keys;
- stop test mutations before cleanup;
- delete dependent multiplayer/rating rows before account rows;
- delete Auth users last;
- retry at most three times;
- prove zero residue;
- never use truncate, wildcard, email-prefix, or unrelated-user deletion.

## 3. Optional later player reset

This reset is not authorized by this document. It may occur only after the
Stage 1 protected Preview passes and the user approves an exact inventory.

### Recommended scope

Preserve:

- all Auth users;
- admin and service identities;
- migrations, RLS, functions, service configuration, and shared catalogs.

For each explicitly approved non-admin Auth UUID, propose deletion of:

1. live events, spectators, participants, matches, and lobbies;
2. rating transactions, player results, match results;
3. rematches and private requests;
4. blocks and private-request preferences;
5. matchmaking queue rows, Daily claims, async games, and custom lobbies;
6. private ranked-Daily and authoritative COMBAT rows through bounded cleanup;
7. economy operations and state;
8. History and progress snapshots;
9. settings;
10. public profile;
11. private application profile;
12. exact registered storage objects;
13. local browser data only for that selected account namespace.

Auth deletion is a separate third gate and is never implied.

### Preflight inventory

Create ignored:

`.codex-internal/evidence/player-reset-<UTC>/inventory.jsonl`

For each proposed target record:

- table/resource type;
- exact primary key;
- owning Auth UUID;
- dependency group;
- reason;
- planned action;
- before-count;
- approved yes/no.

Record aggregate counts without row contents. Exclude admins/service identities.
Require the user-approved UUID list to match the inventory exactly.

### Execution

1. Reverify Git/Supabase/Vercel identities and Production freeze.
2. Stop application mutations for the approved identities.
3. Export only the approved inventory/receipt metadata needed for audit.
4. Delete exact rows in dependency order.
5. Keep Auth users unless the separate Auth-deletion gate names exact UUIDs.
6. Probe all 24 public tables, bounded private cleanup, Auth, and Storage.
7. Retry exact failures at most three times.
8. Stop and report any unrelated dependency or residue.

### Decision options at the later gate

1. Test resources only — preserve all real player data.
2. Recommended — reset approved application data, preserve Auth.
3. Destructive — reset approved application data and separately named Auth
   users, requiring re-registration.

Until the user selects an option, option 1 governs.
