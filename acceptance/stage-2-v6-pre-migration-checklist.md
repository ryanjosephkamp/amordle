# Amordle Stage 2 v6 pre-migration authorization checklist

## Completed and reviewable

- [x] Repository, branch, GitHub privacy, Supabase, Vercel, bootstrap, migration,
      Preview, Production, and locked-shell identities revalidated.
- [x] Every MP-01 through MP-21 atomic clause has a source/authority/evidence
      audit record.
- [x] Generic multiplayer evidence no longer counts as acceptance proof.
- [x] Final hosted acceptance requires strict 237/237 verified evidence.
- [x] Ranked Practice supports untimed and five-minute lanes.
- [x] Ranked Practice queue intent is account-scoped and tab-scoped.
- [x] Queue configuration, action identifiers, cancellation, expiry, conflict,
      visibility, reconnection, and reload recovery are implemented.
- [x] Ranked Practice settlement is strictly parsed and propagates rating delta
      to player-facing continuity surfaces.
- [x] Full repository check, 32 domain tests, 8 browser tests, 14 fixture E2E
      journeys, and 9 visual tests are green.
- [x] No migration, Supabase mutation, Vercel mutation, Preview deployment,
      Production change, or real-account deletion occurred.

## Migration authorization decision

- [ ] Authorize one additive migration 46 extending private COMBAT authority to
      public Practice, accepted private requests, accepted rematches, and
      privacy-safe Ranked Daily finalization.
- [ ] Confirm that the authorization includes applying that migration only to
      Supabase project `squqdstdvbsvhagfuzgj` after local static validation.
- [ ] Confirm that the existing 45 migrations remain immutable and that no down
      migration is authorized.
- [ ] Confirm that the agent may continue autonomously through remaining COMBAT
      implementation, full local acceptance, exact protected Preview,
      disposable hosted journeys, zero-residue cleanup, and final evidence.

Suggested authorization text:

> I authorize the additive v6 COMBAT authority migration described in
> `reports/stage-2-v6-forward-only-migration-decision.md`, followed by the
> remaining implementation and protected Preview acceptance. Do not merge or
> release Production.

## Still outside scope

- [ ] Do not merge or complete a pull request.
- [ ] Do not promote or alter Production.
- [ ] Do not change the default branch.
- [ ] Do not modify any existing migration.
- [ ] Do not inspect Git stash.
- [ ] Do not delete the implementation branch.
- [ ] Do not delete real player or Auth accounts.
- [ ] Do not mutate the locked BRRRDLE-DEV shell.
- [ ] Rotate or revoke the previously exposed Preview-scoped Blob credential
      through owner custody; never record its value in repository evidence.
