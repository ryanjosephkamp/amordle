# ADR-0002: Public community identity and optional definitions

- Status: prepared; database portion awaits explicit migration authorization
- Date: 2026-08-01
- Decision owner: Amordle product authority

## Context

Amordle already stores public profile fields, public rating projections,
private-match preferences, and authoritative COMBAT results. The existing
profile constraint accepts only the `none` flair, public listings are limited
to ranked leaderboards, and public Practice spectation does not expose the
sanctioned public profile identifier needed for safe clickable player names.

Word lists intentionally contain candidate words rather than a multi-megabyte
definition corpus. Bundling definitions would couple optional editorial data
to gameplay authority and substantially enlarge deployment output.

## Decision

One additive migration extends existing authority without exposing account
rows:

- allow `none`, `daily`, and `combat` self-selected flair values;
- default new presentation to the `cyan` accent while keeping six named,
  validated choices;
- add a bounded, paginated public-profile directory RPC;
- add a public COMBAT-only aggregate and rating RPC;
- add spectator projection v4, which includes a sanctioned
  `publicProfileId` only for public unranked Practice.

The migration keeps direct table access revoked. It does not publish Auth
UUIDs, email, Solo History, economy, inventory, private requests, blocks,
answers, seeds, or future game authority. Existing private profiles are not
silently published; the profile editor explains that saving publishes the
listed public fields.

Profile images use a validated public HTTPS URL. This avoids a new upload API,
object store, paid capability, or image-processing service. The image is
loaded only on profile pages with no referrer and an initials fallback.

Definitions use a browser-only, user-triggered chain: Free Dictionary API,
then English Wiktionary. Responses are strictly parsed, size and time bounded,
markup stripped, and cached in the versioned public IndexedDB namespace.
Successful results expire after 30 days; not-found results after 24 hours.
Stale validated data may be used offline. No definition source participates in
guess validation, answer selection, or game completion.

## Consequences

- Exactly three Amordle HTTP interfaces remain; no proxy endpoint is added.
- Definition providers see the queried word and normal network metadata only
  after a player requests the lookup. Requests omit credentials and referrer.
- Cross-origin availability is best-effort. Gameplay and the search fallback
  remain usable when either source is unavailable.
- Public player discovery is intentionally capped at 50 rows per page and an
  offset of 5,000. Larger-scale discovery requires a later reviewed cursor
  contract rather than unbounded scans.
- Profile challenges call the existing private-request authority, including
  preferences, blocks, pair locks, expiry, and anti-spam behavior.

## Rollback

Before application, rollback is removal by forward Git revert. After an
authorized database application, rollback is an additive forward repair and
redeployment of the prior exact application commit. No down migration is used.
