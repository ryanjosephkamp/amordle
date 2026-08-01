# Amordle Stage 2 v6.4 forward-only authority decision packet

## Decision requested

Authorize these two separate additive, forward-only migrations for linked
Amordle Supabase project `squqdstdvbsvhagfuzgj`:

1. `20260801221500_amordle_feedback_preferences_v2.sql`
   - SHA-256:
     `cde752fb637554292435292880b5375d6d8ce02c69793757d3655d7b1ba6c368`
2. `20260801222500_amordle_public_avatars_v1.sql`
   - SHA-256:
     `1259a67886b9e7c64911b66cacfec39868a75d78e6e7a3a79966b274a8610f17`

Both files are prepared, reviewed, tested, committed, and pushed privately.
Neither has been applied locally or remotely. A linked
`supabase db push --dry-run --include-all` lists these two files, and only
these two files, as pending.

## Verified gate state

- Private branch:
  `codex/amordle-terminal-greenfield-implementation-2026-07-27`.
- v6.3/v6.4 intake golden checkpoint:
  `762b0fc2257e24eaab7c6f75664b592a92c7b6aa`.
- Local v6.4 implementation and authority checkpoint:
  `78d275a4156a534fd9f9b4b5b9cada0cd2b51e15`.
- Linked history: 49 synchronized migrations through
  `20260801193000_amordle_accent_presets_v2.sql`.
- Successful authorization and application would produce 51 synchronized
  migrations: the 45 immutable baseline files plus six authorized additive
  files.
- Bootstrap baseline: 107/107 files, unchanged.
- Functional registry: 237/237 clauses retain truthful implementation/evidence
  status.
- Multiplayer audit: 73/73 clauses, unchanged.
- Application HTTP interfaces: exactly three, unchanged.
- Production, default branch, real accounts, Word Explorer, existing visible
  E2E profiles, and the locked shell remain unchanged.

## What does not require new database authority

Multiple active Solo sessions fit the existing account `progress.solo` JSON
authority and the existing versioned IndexedDB envelopes. No Solo migration,
new table, RPC, or HTTP interface is needed.

The private checkpoint already implements:

- stable UUID-backed Practice sessions;
- three active Practice OG and three active Practice GO sessions;
- one Daily OG and one Daily GO session;
- account and guest namespaces;
- deterministic local/cloud registry reconciliation;
- explicit limit, conflict, abandon, terminal, and legacy-save handling;
- active-session lists on Home and `/play/solo`;
- exact resume URLs and stored-answer continuity;
- route-entry invalidation for History, Stats, ratings, progression, Home
  attention, Active COMBAT, and active Solo;
- completed-game mobile review scrolling;
- the missing mobile menu top frame;
- a code-generated five-profile sound engine and opt-in touch-only haptics;
- client-side avatar type, signature, byte, dimension, preview, metadata, and
  cleanup logic.

The migration gate exists only for cross-device feedback preferences and
secure public avatar object custody.

## Migration 1: feedback preferences

### Exact deficiency

The existing `public.settings.settings` JSON must retain its frozen v1 shape.
It can store the current sound-on and reduced-effects values, but it has no
reviewed cross-device fields for the selected keyboard sound profile or the
opt-in haptic preference.

### Minimum additive change

The migration adds two bounded columns to the already owner-scoped settings
row:

- `keyboard_sound_profile`, default `terminal`, constrained to `terminal`,
  `soft-tap`, `mechanical`, `glass`, or `low-thock`;
- `haptics_enabled`, default `false`.

It does not update existing rows, replace the v1 JSON, add a table, add a
function, add a grant, expose a public field, or create an HTTP interface.
Older clients continue to read and write their existing settings payload.
New clients treat the two columns as optional until type regeneration and the
post-authorization adapter checkpoint are complete.

## Migration 2: public avatar Storage authority

### Exact deficiency

The profile currently accepts a public HTTPS image URL. A local PNG, JPEG,
WebP, or animated GIF cannot be made cross-device and publicly readable without
an object authority. Postgres/base64 storage would inflate database rows;
Vercel Blob is suspended and intentionally removed from Amordle; a fourth
application HTTP interface would violate the current boundary; and another
vendor or Supabase project is unnecessary.

The existing linked Supabase project is the narrowest zero-required-cost
option. Supabase public buckets make object retrieval public while Storage RLS
continues to govern upload, update, and deletion. Object ownership is enforced
with the current `storage.objects.owner_id` authority. Technical review used
the official Supabase Storage
[bucket](https://supabase.com/docs/guides/storage/buckets/fundamentals) and
[access-control](https://supabase.com/docs/guides/storage/security/access-control)
documentation.

### Minimum additive change

The migration:

- creates exactly one public bucket, `amordle-public-avatars-v1`;
- limits every object to 6 MiB;
- accepts only PNG, JPEG, WebP, and GIF MIME types;
- rejects SVG and every non-image MIME type;
- restricts client object names to random UUID v4 paths under `avatars/`;
- grants authenticated owners metadata selection and owner-only insert,
  update, and delete through RLS policies;
- adds no anonymous table policy, public table grant, service-role grant,
  database column, RPC, or application HTTP interface;
- fails closed if a bucket with the same identifier already exists with
  incompatible authority instead of silently changing it.

The bucket is intentionally public because profile images are public. Preset
URLs and public profile projections expose only the object URL, never the
Storage owner ID, Auth ID, email, or signed URL token.

## Upload boundary and honest limitations

- The authoritative service boundary is the 6 MiB bucket cap, allowed MIME
  list, UUID path policy, and owner-only mutation.
- The application additionally verifies magic bytes, MIME agreement, maximum
  4096×4096 dimensions, and 16.8 megapixels before upload.
- Still images are decoded and re-encoded in the browser to strip metadata.
  Animated GIF bytes are preserved so animation remains intact.
- A hostile client can bypass browser-only dimension and metadata processing,
  but cannot bypass the bucket byte/MIME boundary, UUID path policy, or
  owner-only Storage mutation without compromising an account. Server-side
  image transformation would require a new execution service and is not
  justified for this public cosmetic asset.
- Unsupported, quota-exhausted, offline, or policy-rejected uploads fail
  closed. The existing HTTPS URL option remains available and the game remains
  playable.
- Supabase free-tier quotas are finite. No automatic charge, paid upgrade, new
  project, or forced vendor migration is introduced.

## RLS, grant, and privacy review

- Existing `public.settings` RLS and grants remain unchanged.
- Avatar writes require `authenticated` and
  `owner_id = auth.uid()::text`.
- Update checks both current ownership and the bounded UUID object path.
- Delete requires current ownership.
- Public object retrieval is deliberate; direct Storage metadata listing is
  not granted to anonymous users.
- Paths contain random UUIDs, not raw Auth UUIDs, account names, emails, or
  profile identifiers.
- SVG, HTML, JavaScript, PDF, and arbitrary binary uploads are excluded.
- No access is added to `brrrdle_private`.
- No answer, seed, word-list, History, Solo draft, economy, rating, or private
  account data enters Storage.

## Replay and compatibility proof

- Feedback columns use `add column if not exists`; the bounded constraint is
  deterministically replaced inside one migration transaction.
- The avatar migration inserts a missing bucket or verifies an exact compatible
  existing bucket. Any collision with different settings aborts the migration.
- Named policies are deterministically replaced.
- Existing settings JSON and profile image URLs are not rewritten.
- Existing clients continue using the same profile and settings RPC families.
- Local domain tests cover bounded feedback values, upload signatures,
  malicious SVG rejection, project/path ownership, and authority text.
- Production build, 237/237 parity, 107/107 bootstrap, 45/45 immutable
  migration identity, three HTTP interfaces, and bundle boundaries pass.
- Browser, fixture, and visual suites pass for current implemented surfaces,
  including six simultaneous Practice sessions, mobile menu framing, complete
  mobile keyboard fit, no required horizontal overflow, and route framing.
- The linked dry run identifies exactly these two pending migrations.

No local Docker-backed Supabase runtime is installed, so this packet does not
claim local execution against a cloned database. After authorization, linked
application is immediately followed by migration-history verification, type
regeneration, service tests, public/owner privacy probes, complete acceptance,
and a forward-repair stop if either authority behaves differently than the
reviewed artifact.

## Cleanup impact

Hosted acceptance will register every disposable account and avatar object
immediately. Cleanup order is:

1. stop mutations and close browser contexts;
2. delete each exact disposable avatar object as its authenticated owner or
   through the bounded cleanup authority;
3. verify the public URL no longer resolves;
4. remove dependent COMBAT, History, progression, economy, notification,
   profile, and settings rows;
5. delete disposable Auth users last;
6. probe exact identifiers through public, authenticated, database, Auth, and
   Storage boundaries.

Cleanup receives at most three exact retries. Any residue blocks final
checkpointing. Existing visible E2E profiles and all real accounts remain
untouched.

## Post-authorization execution

After exact authorization:

1. apply only the two hashed migrations to `squqdstdvbsvhagfuzgj`;
2. verify 51/51 linked migration history and exact hashes;
3. regenerate linked `public,brrrdle_private` TypeScript types;
4. finish the Settings sound/haptic controls and COMBAT keyboard integration;
5. finish avatar upload, replacement, removal, fallback, and cleanup UI;
6. run the complete required local stack;
7. deploy the exact green commit to protected Preview;
8. run serial disposable-user hosted acceptance and privacy probes;
9. prove zero residue;
10. reconcile parity, run state, evidence, reports, and manual checklists;
11. create and push the final private golden checkpoint for manual review.

No merge, Production release, default-branch change, paid capability, new
vendor, real-account deletion, down migration, or locked-shell mutation is
included.

## Rollback

Code rollback uses a forward Git revert. Preview rollback redeploys the exact
known-good v6.3 application candidate
`35597069a5852a0f42017b0e995f98b5c15cbf83` or the approved v6.4 intake
checkpoint `762b0fc2257e24eaab7c6f75664b592a92c7b6aa`, as appropriate.

There is no down migration. Any database or Storage defect receives a
separately reviewed additive forward repair. The public avatar bucket is not
deleted as rollback unless the owner separately authorizes destructive
cleanup after proving it contains no real player objects.

## Exact authorization text

> I authorize applying
> `20260801221500_amordle_feedback_preferences_v2.sql` with SHA-256
> `cde752fb637554292435292880b5375d6d8ce02c69793757d3655d7b1ba6c368`
> and `20260801222500_amordle_public_avatars_v1.sql` with SHA-256
> `1259a67886b9e7c64911b66cacfec39868a75d78e6e7a3a79966b274a8610f17`
> to linked Supabase project `squqdstdvbsvhagfuzgj`, followed by exact
> migration verification, type regeneration, sound and haptic settings
> completion, public avatar upload completion, complete local acceptance,
> protected Preview deployment, disposable-user hosted acceptance, exact
> Storage and Auth cleanup, parity reconciliation, final reporting, and a
> private golden checkpoint. Do not merge or release Production.
