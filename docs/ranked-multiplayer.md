# amordle Ranked Multiplayer

amordle preserves the source contracts for ranked Practice and ranked Daily OG/GO. Remote authority verification remains pending until the dedicated amordle Supabase project is verified, migrated, and configured.

## Rating model

- Each supported mode/ruleset has its own rating bucket.
- New buckets start at the existing canonical initial rating.
- Provisional and established games retain their existing K-factor behavior.
- Expected score uses the standard Elo curve.
- Trusted settlement applies rating changes only after server-authorized ranked evidence is complete.

## Boundaries

Local previews, spectators, custom games, unranked games, unsupported timer variants, guests, corrupt evidence, and incomplete results do not move Elo. Public leaderboards are display surfaces and do not define settlement authority.

Do not change scoring formulas, rating rules, queue fairness, settlement evidence, or private-schema contracts during branding or source-bootstrap work.
