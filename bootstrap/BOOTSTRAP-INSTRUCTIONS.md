# Bootstrap Instructions

## Purpose

This branch prepares a new Codex project to plan and later implement Amordle
without inheriting the rejected application.

## Required first actions

1. Confirm the repository is private and the checked-out branch/commit match
   the preparation completion report.
2. Read `AGENTS.md` and every top-level file in `bootstrap/`.
3. Run:

   ```sh
   node bootstrap/validate-bootstrap.mjs
   ```

4. Verify the 45 migration checksums and linked Supabase ledger without
   printing credentials.
5. Verify the locked shell commit and tag read-only.
6. Inspect every newly supplied reference image and update the proposed
   reference manifest in the implementation plan. Do not alter this branch
   while still in Plan mode.
7. Follow `bootstrap/PLAN-MODE-PROMPT.md`.

## What this package does not contain

- application source;
- API implementations;
- package or lock files;
- tests or fixtures;
- prior screenshots or concepts;
- secrets or service credentials;
- permission to change services, data, Git defaults, or Production.

## Planning expectation

The implementation plan must be decision-complete. It must map every functional
contract item to:

- implementation ownership;
- route or interface ownership;
- automated evidence;
- hosted evidence where required;
- cleanup;
- completion and rollback criteria.

The plan should ask the user only about choices that materially change product
direction, backend authority, destructive cleanup, or release scope.

## Execution expectation

After separate authorization, implementation proceeds autonomously through
ordinary failures. It uses private checkpoints, protected Previews, real
temporary-account tests, exact cleanup, and paired completion/manual-review
reports. It stops only at the constitution's stop conditions.
