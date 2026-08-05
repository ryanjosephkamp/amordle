# Optional Return-to-Codex Procedure

Use this only if the owner later decides to continue in the existing Codex
task. Claude should first finish a cohesive checkpoint, update
`CONTINUITY-LOG.md`, commit, and push it. The working tree should be clean.

Paste this as the new current message in the existing Codex task:

```text
Resume Amordle from Claude Code's latest durable checkpoint in `/Users/noir/Documents/amordle-final`.

First read `AGENTS.md` and the complete package at `/Users/noir/Documents/amordle-final/docs/prompts/claude-code-amordle-v6.7-handoff-2026-08-05`, especially `BOOTSTRAP-HANDOFF-MANUAL.md`, `CURRENT-STATE.md`, `CONTINUITY-LOG.md`, the accepted Claude plan, and all checkpoint/report paths named there. Revalidate the actual local and remote branch, commits, tags, worktrees, GitHub repository/default branch, Vercel Preview and frozen Production, linked Supabase project/migrations/functions, bootstrap, parity, multiplayer audit, and API-route count. Do not assume Claude's log is current when live verification is cheap.

Report any drift before acting. Preserve all Claude-authored commits and user changes. Do not inspect Git stash, force-push, rewrite history, merge, change the default branch, release or mutate Production, alter the locked BRRRDLE-DEV shell, expose secrets/private data/answers, or delete real users/data. Resume only the exact unfinished scope authorized by this current message and the accepted plan. Continue through ordinary implementation, validation, protected Preview, bounded hosted acceptance, exact cleanup, evidence, reporting, and the next private checkpoint as appropriate. Stop for any new migration/service/provider/destructive authority gate.
```

If the owner wants only a status review, replace the final execution sentence
with: `Inspect and report the exact status only; do not modify files, Git, or services.`
