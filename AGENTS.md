# Amordle Greenfield Agent Instructions

## Authority order

1. The current user request.
2. `bootstrap/CONSTITUTION.md`.
3. `bootstrap/FUNCTIONAL-CONTRACT.md`.
4. `bootstrap/BACKEND-AND-SERVICES-CONTRACT.md`.
5. `bootstrap/TESTING-AND-ACCEPTANCE-CONTRACT.md`.
6. `bootstrap/PRODUCT-BRIEF.md`.
7. The remaining bootstrap manifests and decision ledger.
8. The locked shell, at its exact recorded commit, as read-only behavioral
   evidence.

Stop and ask for direction if two higher-authority sources cannot be reconciled.

## Workspace and repository boundary

- Work only in the Amordle workspace named by the user.
- The `brrrdle-dev` shell is permanently read-only. Never commit, push, deploy,
  configure, migrate, delete, or write test data through it.
- Do not inspect or modify any Git stash.
- Do not change repository visibility, the default branch, Production, or the
  accepted shell deployment without separate authorization.
- Never force-push or rewrite history.
- Do not buy services, enable billable features, or add a paid vendor.

## Product and implementation boundary

- Build the new application from the bootstrap contracts, not from historical
  Amordle source, tests, fixtures, screenshots, or visual rules.
- Old fire/ice, cyberpunk, atmosphere, Concept Gallery, frontend architecture,
  and wording systems are rejected and non-governing.
- Preserve shell behavior, rules, outcomes, and edge cases. Do not copy its
  frontend design.
- A screen, fixture, mock, or static number is not an implemented capability.
- Player-facing language must be natural, concise, and suitable for a general
  audience. Do not expose implementation terminology in ordinary UI.

## Safety baseline

- Keep secrets out of Git, chat, logs, screenshots, traces, reports, and browser
  bundles.
- Browser code may use only explicitly browser-safe configuration.
- Never expose an unsolved answer, private account data, raw Auth identifier, or
  administrative capability through a public projection.
- Preserve the 45 existing migrations byte-for-byte. Any necessary schema
  change must be a separately authorized forward-only migration.
- Register every real-service test resource and clean exact identifiers in
  dependency order. Zero residue is required.
- Do not delete real player data or Auth users without a separate exact-scope
  authorization.

## Completion standard

- Work autonomously through ordinary implementation and test failures.
- Keep progress recoverable through cohesive private checkpoints.
- Use real protected Preview deployments and real temporary-account E2E where
  required by the testing contract.
- Do not claim completion until every functional-contract item has accepted
  evidence, cleanup is clean, and the reports and manual checklist are complete.
- Stop for identity drift, migration drift, required paid infrastructure,
  destructive ambiguity, secret/private-data leakage, unavoidable Production
  mutation, or cleanup residue after the bounded retry policy.
