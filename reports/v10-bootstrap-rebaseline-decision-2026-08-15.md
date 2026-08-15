# Bootstrap baseline decision — re-baselining `vercel.json`

**Date:** 2026-08-15 · **Cycle:** v10 · **Authorized by:** the owner, 2026-08-15

## What was failing

`pnpm verify:bootstrap` failed on `HEAD` before this cycle changed anything:

```
PASS immutable migrations 45/45 + authorized additive 13/13
PASS reviewed pending additive 0/0
Bootstrap baseline verification failed:
- baseline hash mismatch: vercel.json
```

So `pnpm check` — which chains `verify:bootstrap` — could not go green, and no
cycle could report a clean local gate.

## Why

`vercel.json` is entry 107 of 107 in `bootstrap/BUNDLE-MANIFEST.json`, the frozen
allow-list that `scripts/verify-bootstrap-baseline.mjs` hashes on every run. It
is one of ten root files the manifest pins.

Commit `046e3b9 fix(deploy): pin the framework and output directory in
vercel.json` added two lines to it:

```json
"framework": "nextjs",
"outputDirectory": ".next",
```

That commit is the durable fix for the second fault in the v9 release incident.
`vercel pull` had overwritten `.vercel/project.json` with the dashboard's
settings — `framework: null`, `outputDirectory: "dist"` — and with no framework
Vercel skipped the Next.js builder, copied a directory as static files, reported
Ready, and served 404 for every route. Production was down until a rollback.
Putting the settings in `vercel.json` makes them version-controlled and immune to
`vercel pull`.

The file changed; the manifest entry did not. Verified:

| | bytes | sha256 |
| --- | --- | --- |
| Manifest recorded | 210 | `9f4b80c46aa9a621691365fef79629ed9f7680f00871b74e2aa2c955737dc043` |
| `046e3b9^:vercel.json` | 210 | `9f4b80c46aa9a621691365fef79629ed9f7680f00871b74e2aa2c955737dc043` |
| Working tree (shipped) | 265 | `0dd01784e610d61c40568a633a5f12fc861651dc8056a750bf3da46132c81838` |

The manifest held the pre-fix bytes exactly. This is a stale ledger entry, not a
tampered file.

## The decision

Re-baseline: update the `bytes` and `sha256` of the `vercel.json` entry in
`bootstrap/BUNDLE-MANIFEST.json` to the shipped file.

Rejected alternatives:

- **Revert `vercel.json`** — would undo the v9 incident's durable fix and
  re-expose Production to the exact drift that took the site down.
- **Exempt the file from the ledger** — would permanently remove deployment
  configuration from the immutability system to avoid a one-time update.
- **Leave it red** — would mean reporting acceptance with a known failing gate
  step for every future cycle.

## Scope

One entry. No other manifest entry, no migration, and no verification script
changed. The 45 immutable migrations and the 13 authorized additive migrations
are untouched, and `vercel.json` remains frozen — at its correct contents.

## Verification

`pnpm verify:bootstrap` prints `PASS immutable bootstrap baseline 107/107`, and
`pnpm check` completes.
