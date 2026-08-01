# Amordle Stage 2 v6.1 Final Manual Checklist

## Automated completion

- [x] Exact application commit `7f33829803eb93b560307b4b859d8109e1998db7` deployed.
- [x] Final deployment `dpl_12LwcLEg3yXFMHr9ynMZMgiN78Ni` is Ready and protected.
- [x] 34/34 content-addressed word assets generated and reachable.
- [x] Home requests no word bank; gameplay and Word Explorer load only the selected length.
- [x] No runtime Vercel Blob or Supabase Storage word-list call remains.
- [x] Preview `BLOB_READ_WRITE_TOKEN` removed after the first green hosted run.
- [x] The same commit rebuilt and passed hosted acceptance without the token.
- [x] Production/Development Blob binding unchanged; old Blob store undeleted.
- [x] 237/237 parity and 73/73 MP audit rows verified.
- [x] 107/107 bootstrap baseline verified.
- [x] 45 immutable plus 1 authorized additive migration verified.
- [x] Exactly three application HTTP interfaces verified.
- [x] 60 domain, 14 browser, 15 fixture, 2 hosted service, and 9 visual tests passed.
- [x] Final disposable cleanup completed on attempt 1 with zero residue.

## Owner review on final Preview

Open <https://amordle-hynrefg79-ryanjosephkamps-projects.vercel.app>.

- [ ] Confirm the protected access prompt behaves normally.
- [ ] Confirm Home opens without a visible word-loading delay.
- [ ] Start Solo Practice at 5 letters and submit a valid guess.
- [ ] Reload the Solo game and confirm progress returns.
- [ ] Open Word Explorer, select another length, and confirm the list and definition interaction.
- [ ] Confirm the terminal/TUI shell, centered board, keyboard evidence, account tools, and mobile layout remain visually correct.
- [ ] With two disposable accounts, inspect Practice and Daily COMBAT waiting, active, result, and rematch surfaces if desired.
- [ ] Confirm History, Stats, alerts, and Leaderboards render as expected for the review account.
- [ ] Test offline Solo only after the selected word length has been loaded once.

## Protected boundaries to retain

- [x] Production remains `dpl_739mtwiXc9pZPef3pxsKumwC9DfG`.
- [x] Default branch remains `bootstrap/greenfield-2026-07-20`.
- [x] Real users and Auth data were not deleted.
- [x] BRRRDLE-DEV and its locked shell were not modified.
- [x] No merge or Production release occurred.

## Separate authorization required

- [ ] Approve any merge.
- [ ] Approve any Production release.
- [ ] Separately authorize old Blob-store deletion if ever desired.
