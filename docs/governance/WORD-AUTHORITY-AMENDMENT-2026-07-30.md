# Word Authority Successor Amendment

## Authority and boundary

This reviewed successor amendment changes only the publication and refresh
mechanism for public candidate word data. It does not modify any file in the
107-file immutable bootstrap baseline, any migration, game rule, route,
persistence format, active-answer authority, or service identity.

Where the immutable bootstrap contracts prescribe Vercel Blob, manifest-last
Blob promotion, Blob ETags, or runtime mutation, this amendment replaces that
mechanism with the deployment-bundled authority described in ADR-0001.

## Clause reconciliation

### GAME-11

- Candidate banks remain available for lengths 2 through 35.
- Home requests no bank. Gameplay and Word Explorer request only the selected
  length.
- Manifest and object schemas, revision, byte count, SHA-256, word length,
  lowercase ASCII, uniqueness, and answer-subset constraints remain mandatory.
- Candidate answer pools may be public. Active answers, ranked answers, seeds,
  raw identities, and future selection authority remain private.
- A commit/build/deployment activates all 34 content-addressed objects and the
  matching manifest together. A failed build activates none.
- Cached banks remain public-only and revision-specific.

### SUP-02

The Home and selected-length network boundaries are unchanged. Word assets are
same-origin immutable static files rather than Blob objects.

### SUP-05

The authorized Admin surface performs bounded operational diagnostics and a
manual repository-refresh handoff. It does not rewrite the running deployment.
The authenticated status and authorization boundaries remain unchanged.

### SUP-06

Refresh failure leaves the last committed runtime authority and deployed
revision intact. The updater validates a complete candidate before an atomic
directory swap. Deployment failure leaves the previous deployment available.
Player-facing and operator status must describe freshness honestly and must not
claim a publication occurred.

## HTTP interfaces

Exactly three interfaces remain. No fourth interface is authorized.

- `POST /api/admin-refresh`: authenticated freshness diagnostic.
- `GET /api/cron/refresh-word-lists`: bearer-authenticated freshness diagnostic.
- `GET /api/word-lists/manifest`: bounded packaged manifest.

## Testing and cleanup amendment

Replace Blob upload, ETag, object registration, restoration, and deletion with:

- build-time completeness and integrity checks;
- exact-deployment manifest/object probes;
- no-Blob and no-Supabase-Storage network probes;
- immutable cache-header and transfer-size evidence;
- revision-transition, corrupt-cache, and offline checks.

Word publication creates no disposable service object. The old Blob store is
not a cleanup target. Preview credential removal happens only after the
deployment-bundled candidate is proven and must not alter Production
configuration.

## Rollback

Use a forward Git revert and redeploy the prior exact green Preview. Never use a
down migration. Runtime word authority cannot advance independently of a
reviewed source commit and deployment.
