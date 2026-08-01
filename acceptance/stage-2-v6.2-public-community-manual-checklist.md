# Amordle Stage 2 v6.2 Public Community Manual Checklist

## Automated completion

- [x] Authorized SQL hash preserved exactly.
- [x] Repair applied to linked project `squqdstdvbsvhagfuzgj` as migration version `20260801051509`.
- [x] Linked TypeScript database types regenerated.
- [x] 48/48 local and linked migration versions synchronized.
- [x] `pnpm check` passed after evidence reconciliation.
- [x] 70 domain and 14 browser tests passed.
- [x] 15 fixture, 2 real-service, and 9 visual journeys passed.
- [x] 237/237 parity rows are acceptance-verified.
- [x] 73/73 MP audit rows remain proven.
- [x] 107/107 bootstrap baseline, 34/34 word assets, and exactly 3 HTTP interfaces passed.
- [x] Final hosted cleanup completed on attempt 1 with zero database and Auth residue.
- [x] Production remained unchanged.

## Owner review on protected Preview

Open <https://amordle-p7azfoby6-ryanjosephkamps-projects.vercel.app>.

- [ ] Confirm protected access behaves normally.
- [ ] Open Players and search by player name.
- [ ] Confirm Practice rating filtering and sorting do not produce a narrow or empty false result.
- [ ] Open a public player profile and confirm the avatar, name, bio, flair, accent, ratings, and public statistics render without private identifiers.
- [ ] Confirm a completed unranked COMBAT game contributes to the public COMBAT total.
- [ ] From an eligible public profile, configure an OG or GO private challenge and confirm the request UI is clear.
- [ ] Confirm player names remain usable links in Leaderboards, COMBAT, History, and public community surfaces.
- [ ] Open Word Explorer and request a common word definition; confirm the dialog appears and a repeated request uses the cached result.
- [ ] Inspect Stats on mobile and confirm rating buckets and charts reflow without cramped text or horizontal scrolling.
- [ ] Confirm the existing terminal/TUI shell, Solo board, keyboard, COMBAT transcript, and account tools have no regression.

## Protected boundaries to retain

- [x] Production remains `dpl_739mtwiXc9pZPef3pxsKumwC9DfG`.
- [x] Real users and Auth data were not deleted.
- [x] No down migration was created or applied.
- [x] Vercel project settings were not changed.
- [x] The old Blob store was not deleted.
- [x] The locked BRRRDLE-DEV shell was not modified.
- [x] No merge or Production release occurred.

## Separate authorization required

- [ ] Approve any merge.
- [ ] Approve any Production release.
- [ ] Approve any future Vercel project-setting change.
- [ ] Separately authorize old Blob-store deletion if ever desired.
