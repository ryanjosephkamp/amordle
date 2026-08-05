# Amordle Claude Code Handoff Package

This folder is the self-contained handoff package for moving Amordle from the
current Codex task to Claude Code while preserving the repository, branch,
frontend/backend stack, service authorities, and review gates.

Start with:

1. [`BOOTSTRAP-HANDOFF-MANUAL.md`](BOOTSTRAP-HANDOFF-MANUAL.md)
2. [`CURRENT-STATE.md`](CURRENT-STATE.md)
3. [`CLAUDE-PLAN-MODE-BOOTSTRAP-PACKAGE.md`](CLAUDE-PLAN-MODE-BOOTSTRAP-PACKAGE.md)
4. [`ACTIVATION-PROMPT.txt`](ACTIVATION-PROMPT.txt)

The package is deliberately repository-backed. Chat history is supplementary;
the repository, governing contracts, source intake, screenshots, Git history,
and live service identities are the authority.

## Authorization boundary

This package does **not** authorize implementation, a merge, a Production
release, a migration, a service mutation, dependency upgrades, or provider
configuration changes. Its first use is a read-only Claude Code Plan-mode
audit. The owner reviews that plan before separately authorizing execution.

## Package map

- `BOOTSTRAP-HANDOFF-MANUAL.md` — exact human walkthrough.
- `CLAUDE-PLAN-MODE-BOOTSTRAP-PACKAGE.md` — controlling Plan-only package.
- `ACTIVATION-PROMPT.txt` — short prompt to paste into Claude Code Plan mode.
- `CLAUDE-EXECUTION-AUTHORIZATION-TEMPLATE.md` — optional later execution
  prompt; inactive until the owner deliberately sends it.
- `OPTIONAL-RETURN-TO-CODEX.md` — hand-back procedure if work later returns to
  this Codex task.
- `CONTINUITY-LOG.md` — durable progress record Claude should maintain after
  execution is authorized.
- `CURRENT-STATE.md` and `state/current-state.json` — verified starting
  identities and invariants.
- `PRIOR-READ-ONLY-AUDIT.md` — useful prior findings that Claude must
  independently revalidate.
- `source/` — exact copies of the canonical owner-feedback intake, its HTML
  companion, and the previous Plan-mode prompt.
- `evidence/` — the stable screenshot ledger, original local paths, and hashes.
  Screenshot binaries containing account identifiers are deliberately not
  uploaded to Git; the canonical intake preserves every annotation.
- `FILE-INVENTORY.md` — content and authority inventory.
- `SHA256SUMS` — integrity hashes for package files other than the manifest
  itself.

## Non-goals

- This package is not a replacement for `AGENTS.md` or the bootstrap contracts.
- It does not copy ignored secrets, local auth sessions, build output,
  dependencies, caches, or disposable service data.
- It does not modify the locked BRRRDLE-DEV shell.
- It does not merge the implementation branch or change the default branch.
