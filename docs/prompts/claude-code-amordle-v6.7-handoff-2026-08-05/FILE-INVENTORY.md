# Handoff File Inventory

## Controlling files

| Path | Purpose | Authority |
| --- | --- | --- |
| `README.md` | Package entry point | Informational |
| `BOOTSTRAP-HANDOFF-MANUAL.md` | Exact owner walkthrough | Operational manual |
| `CLAUDE-PLAN-MODE-BOOTSTRAP-PACKAGE.md` | Full Plan-only instructions | Controlling after explicit invocation |
| `ACTIVATION-PROMPT.txt` | Copy-ready short invocation | Non-self-authorizing |
| `CLAUDE-EXECUTION-AUTHORIZATION-TEMPLATE.md` | Optional later execution prompt | Inactive until owner sends it |
| `OPTIONAL-RETURN-TO-CODEX.md` | Optional hand-back prompt | Inactive until owner sends it |
| `CONTINUITY-LOG.md` | Cross-harness durable state | Status record, not authority |
| `CURRENT-STATE.md` | Human-readable verified identities | Revalidate before use |
| `state/current-state.json` | Machine-readable identities | Revalidate before use |
| `PRIOR-READ-ONLY-AUDIT.md` | Previous source-audit leads | Advisory; revalidate |

## Canonical source copies

The `source/` folder contains byte-for-byte copies of:

- `reports/stage-2-post-v6.6-owner-visual-feedback-intake-2026-08-04.md`
- `reports/stage-2-post-v6.6-owner-visual-feedback-intake-2026-08-04.html`
- `reports/stage-2-post-v6.6-owner-visual-feedback-plan-mode-prompt-2026-08-04.md`

The root `reports/` paths remain canonical within the application repository.
Copies exist so this folder is self-contained and independently hashable.

## Visual evidence

`evidence/README.md` maps each stable ID to its source surface, original local
path, and expected SHA-256. The PNG binaries are deliberately excluded from
Git because some contain account email addresses. The same-workspace handoff
may inspect the originals read-only at the listed paths. The canonical
Markdown and HTML intake preserve every annotation for a GitHub-only checkout.

## Integrity

`SHA256SUMS` hashes all package files other than `SHA256SUMS` itself. From the
package directory, verify it with:

```bash
shasum -a 256 -c SHA256SUMS
```

## Intentionally excluded

- ignored `.env*` and provider credentials;
- local CLI auth/session files;
- dependencies and build output;
- Playwright traces, videos, test downloads, and caches;
- disposable account/game identifiers and credentials;
- real/private player data;
- original screenshot binaries containing account identifiers;
- Git stash contents;
- locked-shell source copies;
- Vercel/Supabase secret values.
