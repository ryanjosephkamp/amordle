# Amordle Terminal Greenfield Bootstrap

This branch is a clean, application-free handoff for rebuilding Amordle as a
hosted terminal-inspired word-game platform.

It contains:

- the complete behavioral contract derived from the locked functional shell;
- the existing 45 immutable Supabase migrations;
- safe Vercel, Supabase, and environment templates;
- the bundled word-list source data outside the public web root;
- testing, cleanup, provenance, and activation instructions.

It intentionally contains no application source, runtime API implementation,
historical fixture, screenshot, rejected visual contract, dependency manifest,
or build system.

## Start here

1. Read `AGENTS.md`.
2. Read `bootstrap/BOOTSTRAP-INSTRUCTIONS.md`.
3. Verify the bundle:

   ```sh
   node bootstrap/validate-bootstrap.mjs
   ```

4. In a new Codex task, follow `bootstrap/PLAN-MODE-PROMPT.md`.

Do not implement from the golden recovery branch. Its only supported purpose is
rollback and historical inspection.

## Tooling notes

The Supabase CLI is a project devDependency, not a global install, so invoke it
through the workspace:

```sh
pnpm exec supabase migration list --linked
```

A bare `which supabase` reports "not found" and has already misled one audit into
believing the CLI was unavailable.
