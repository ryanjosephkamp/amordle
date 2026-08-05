# Amordle Claude Code Bootstrap and Handoff Manual

## Outcome

Following this manual starts Claude Code in the same Amordle repository and
directory at a durable GitHub checkpoint, asks Claude to perform a read-only
Plan-mode audit, and preserves a clean path either to execute with Claude or to
hand the work back to Codex later.

No separate Git worktree is required. Use the existing checkout at
`/Users/noir/Documents/amordle-final`. Only one coding harness should write to
this checkout at a time.

## Before opening Claude Code

1. Finish or close any other Codex/IDE agent session that could edit this
   directory.
2. Open Terminal.
3. Run:

   ```bash
   cd /Users/noir/Documents/amordle-final
   git fetch origin --tags --prune
   git switch codex/amordle-terminal-greenfield-implementation-2026-07-27
   git pull --ff-only origin codex/amordle-terminal-greenfield-implementation-2026-07-27
   git status --short --branch
   ```

4. The status should be clean and should show the implementation branch tracking
   its `origin/` branch. Do not use `git stash`, `git reset --hard`, rebase, or a
   force push to make it clean.
5. Verify the handoff tag and branch point to the same commit:

   ```bash
   git rev-parse HEAD
   git rev-parse amordle-claude-code-handoff-v6.7-planning-2026-08-05^{}
   ```

   Those two hashes must match. If they do not, stop and inspect the remote
   branch and tag rather than resetting anything.
6. Verify that the accepted application baseline is still an ancestor:

   ```bash
   git merge-base --is-ancestor 16d7a510a15ab5eaf254bc2c163f77b9059854cc HEAD
   ```

   Exit status `0` is expected.

## Start Claude in Plan mode

The current official Claude Code interface supports starting directly in Plan
mode:

```bash
cd /Users/noir/Documents/amordle-final
claude --permission-mode plan
```

You may instead open Claude Code normally and switch to Plan mode using the
mode control or `Shift+Tab`. Confirm that the status bar says Plan mode before
submitting the handoff prompt. Official reference:
<https://code.claude.com/docs/en/permission-modes>.

Copy the exact activation prompt on macOS:

```bash
pbcopy < /Users/noir/Documents/amordle-final/docs/prompts/claude-code-amordle-v6.7-handoff-2026-08-05/ACTIVATION-PROMPT.txt
```

Paste it into Claude Code and submit it. Claude should inspect the repository
and return a decision-complete plan without editing files or services.

## Review the Plan-mode result

Do not approve implementation merely because a plan exists. Confirm that the
plan:

- covers every `ANNOT-01` through `ANNOT-12` requirement;
- separates mandatory owner feedback from additional audit findings;
- preserves answer, identity, rating, service, and Production boundaries;
- identifies actual files, tests, data authorities, and root causes;
- does not invent data, routes, tables, services, or completed evidence;
- treats dependency/framework upgrades as a separately explained decision;
- retains the full verification, protected Preview, disposable-resource
  cleanup, evidence, reporting, and rollback workflow;
- stops for any migration, new service interface, paid capability, secret
  exposure, or destructive ambiguity that is not already authorized.

Ask Claude to revise the plan in Plan mode until it is decision-complete.

## Authorize execution only after alignment

If you accept the plan, use
`CLAUDE-EXECUTION-AUTHORIZATION-TEMPLATE.md`. Replace its bracketed plan
reference with Claude's actual accepted plan or saved plan path, then send it in
a new current message. The template deliberately does not self-authorize.

During execution, Claude should:

1. record the approved plan in the repository;
2. update `CONTINUITY-LOG.md` at cohesive checkpoints;
3. make normal non-force commits and pushes on the implementation branch;
4. avoid the Git stash and preserve unrelated user work;
5. run targeted tests first, then the complete required stack;
6. deploy only an exact green commit to a protected Preview;
7. register and clean every disposable resource exactly;
8. produce paired reports/checklists and a final private golden tag;
9. stop before any merge or Production release.

## Secrets and local service access

Do not copy secrets into this package or into Claude chat. Existing ignored
environment files and authenticated CLI sessions stay local. Claude may verify
that required variable names or CLI sessions exist without printing values.
Never ask Claude to reveal `.env` contents, Supabase service-role values,
Vercel tokens, Auth credentials, or private player data.

## Worktree policy

You do not need to create or remove a worktree for this handoff. Claude should
use the current checkout unless you later choose an isolated worktree.

If you intentionally choose a new worktree later:

- create it from the verified handoff tag or current remote implementation
  branch;
- use a new `codex/` or clearly named private branch;
- ensure no two worktrees have the same branch checked out;
- never delete the original checkout or branch as part of setup;
- record the new path and branch in `CONTINUITY-LOG.md`.

## Optional return to Codex

Before returning:

1. Have Claude finish the current cohesive checkpoint.
2. Have it update `CONTINUITY-LOG.md` with exact commit/tree, branch, tests,
   deployments, service mutations, disposable resources, cleanup, blockers,
   and next action.
3. Commit and push that log with the checkpoint.
4. Ensure `git status --short --branch` is clean.
5. Return to this Codex task and paste the prompt in
   `OPTIONAL-RETURN-TO-CODEX.md`.

Codex must revalidate the repository and services rather than trusting the log
blindly. Claude work does not authorize Codex to merge, release Production, or
perform any new migration/service mutation.

## Recovery

The handoff tag is a durable recovery point:

```bash
git fetch origin --tags --prune
git show --stat amordle-claude-code-handoff-v6.7-planning-2026-08-05
```

To inspect it without disturbing the active branch:

```bash
git worktree add /tmp/amordle-handoff-review amordle-claude-code-handoff-v6.7-planning-2026-08-05
```

Remove that temporary review worktree only after leaving it:

```bash
cd /Users/noir/Documents/amordle-final
git worktree remove /tmp/amordle-handoff-review
```

Do not use a destructive reset to recover. Prefer a forward revert or a new
branch from the tag after reviewing the exact target.
