# Re-baseline decision — README.md

**File:** `README.md`, entry 1 of the frozen 107-file bootstrap manifest
**Trigger:** `pnpm verify:bootstrap` failed with `baseline hash mismatch: README.md`
**Decision:** re-baseline to the shipped bytes. Precedent: the `vercel.json`
re-baseline at v10, recorded in `progress/run_state.json` under
`v10Implementation.bootstrapRebaseline`.

## Why the file had to change

The manifest freezes the original handoff bundle, and the README it froze
described that bundle:

> This branch is a clean, application-free handoff for rebuilding Amordle […]
> It intentionally contains no application source, runtime API implementation,
> historical fixture, screenshot, rejected visual contract, dependency manifest,
> or build system.

Every clause of that is now false. The repository holds the whole application,
its tests, its migrations and its build system, and is about to be made public.
A visitor reading that README would conclude there is no game here and that the
correct next step is to run a bootstrap script in an AI agent task.

A stale README is tolerable in a private repository, where the only readers
already know what is in it. It is not tolerable as the front door of a public
one.

## What the freeze is actually protecting

The manifest exists so that the bootstrap bundle's *contents* cannot drift
without someone noticing — the behavioural contract, the migration set, the word
data, the environment templates. README.md is in it because it shipped with the
bundle, not because anything depends on its bytes.

Nothing reads this file programmatically. No verifier, script, test or build step
parses it. Re-baselining changes one hash and one byte count in the manifest, and
the count of entries stays 107.

## Reversal

Restore the previous entry:

```json
{ "path": "README.md", "bytes": 1002,
  "sha256": "86b4805b415eea06aee06af6d956fbdb47463f513744bbd5bd60f009630eaee3" }
```

and `git checkout` the old README from before this commit.
