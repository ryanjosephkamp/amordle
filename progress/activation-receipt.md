# Activation Receipt

- Activated: 2026-07-27T20:33:49Z
- Repository: private `ryanjosephkamp/amordle`
- Annotated tag: `amordle-terminal-greenfield-bootstrap-2026-07-26`
- Commit: `328714102c8a170a850f287fca48d1e7f599ddc8`
- Branch: `codex/amordle-terminal-greenfield-implementation-2026-07-27`
- Recovery commit: `43556d99e6e59ff77135ff347da3bc9be056fedf`
- Locked shell commit: `062624b2fb7c8d039a2eba3aec5b059c26628a11`
- Supabase: `squqdstdvbsvhagfuzgj`, local/remote migrations `45/45`
- Migration-ledger SHA-256:
  `f73fc5e4260585a93035c4dc2b5bb9216d5576124c55f652d4a66b1369fd14bf`
- Vercel project: `prj_8DsbwXWKUtUz7dQl9xoPCgFUuxzH`
- Vercel team: `team_0vEdA7fHR2HdGWr7QWWP2m6x`
- Frozen Production: `dpl_739mtwiXc9pZPef3pxsKumwC9DfG`

## Original validator

Command:

```sh
node bootstrap/validate-bootstrap.mjs
```

Result:

```text
PASS required package file exists: AGENTS.md
PASS required package file exists: README.md
PASS required package file exists: bootstrap/BOOTSTRAP-INSTRUCTIONS.md
PASS required package file exists: bootstrap/CONSTITUTION.md
PASS required package file exists: bootstrap/FUNCTIONAL-CONTRACT.md
PASS required package file exists: bootstrap/BACKEND-AND-SERVICES-CONTRACT.md
PASS required package file exists: bootstrap/TESTING-AND-ACCEPTANCE-CONTRACT.md
PASS required package file exists: bootstrap/PRODUCT-BRIEF.md
PASS required package file exists: bootstrap/SOURCE-REFERENCE-MANIFEST.md
PASS required package file exists: bootstrap/REFERENCE-MANIFEST.md
PASS required package file exists: bootstrap/BUNDLE-MANIFEST.json
PASS required package file exists: bootstrap/TRACKED-PATH-CLASSIFICATION.tsv
PASS required package file exists: bootstrap/CLEANUP-INSTRUCTIONS.md
PASS required package file exists: bootstrap/DECISION-LEDGER.md
PASS required package file exists: bootstrap/PLAN-MODE-PROMPT.md
PASS available golden branch resolves to expected commit
PASS local golden tag resolves to expected commit
PASS current lineage has exactly one parentless root
PASS tracked-path classification is exact and current
PASS classification contains header plus 303 paths
PASS classification counts are 49/43/189/22
PASS all 49 retained paths are byte-identical to the golden source
PASS exactly 45 migration files are present
PASS migration checksum ledger has 45 valid rows
PASS all migration bytes match the immutable checksum ledger
PASS word-list source contains 34 lengths plus manifest
PASS word-list source covers every length 2 through 35
PASS word-list manifest has expected revision and 34 entries
PASS transformed word-list bytes match the golden source
PASS functional contract contains all 66 ordered preservation IDs
PASS functional contract names exactly the three retained APIs
PASS environment template contains no Vite variables
PASS environment template names only the intended browser-safe values
PASS server secrets are not browser-prefixed
PASS Vercel Git deployment is disabled
PASS obsolete SPA rewrite is absent
PASS Vercel cron contract is preserved
PASS rejected path absent: api
PASS rejected path absent: public
PASS rejected path absent: quality
PASS rejected path absent: src
PASS rejected path absent: tests
PASS rejected path absent: package.json
PASS rejected path absent: pnpm-lock.yaml
PASS rejected path absent: vite.config.ts
PASS rejected path absent: vitest.config.ts
PASS rejected path absent: playwright.config.ts
PASS retired visual/proof terms are confined to retirement documents
PASS bundle manifest paths, sizes, and hashes are exact
PASS bundle manifest records migration and classification baselines

Bootstrap validation passed.
```

This receipt records the pre-scaffold validator. The successor verifier is the
post-scaffold authority because the original validator intentionally rejects
application paths.
