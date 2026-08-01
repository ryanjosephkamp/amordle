# Public Community and Definition Authority Amendment

## Scope

This amendment governs the v6.2 public-profile directory, public COMBAT
statistics, clickable sanctioned identities, profile-page images, private
challenge entry, player accent application, optional definitions, responsive
Stats presentation, and active-versus-review scrolling.

It does not change game rules, ratings, matchmaking policy, private-request
policy, persistence ownership, the three application HTTP interfaces, the
immutable 107-file bootstrap baseline, the first 45 migrations, Production,
or the locked shell.

## Public projection boundary

Allowed public profile fields are:

- opaque `public_profile_id`;
- display name, bio, flair, named accent, HTTPS avatar URL;
- COMBAT aggregate counts;
- the four existing public ranked COMBAT rating buckets.

Forbidden public fields include raw Auth or account identifiers, email,
settings, Solo History or answers, economy, inventory, private requests,
blocks, drafts, answer catalogs, seeds, and future answer authority.

Directory reads must be bounded, independently parsed, active-profile-only,
and prefix-filtered. Spectator identity links remain restricted to public,
unranked, started Practice matches. Missing sanctioned identifiers render as
plain text.

## Definition boundary

Definitions are requested only through a deliberate player action. They are
optional reference data and never a correctness authority. Provider responses
must be strictly schema parsed, capped at 512 KiB, timed out, reduced to six
unique definitions, stripped of markup, and cached only in the public local
definition namespace. History may request definitions only for terminally
revealed v3 answer fields; legacy rows do not infer or reconstruct answers.

## Presentation boundary

Named accents apply only to non-semantic shell emphasis, links, prompts,
focus, current input, charts, and selected states. Evidence and safety colors
remain fixed. Active games keep their no-document-scroll layout; terminal
review allows normal vertical document scrolling and non-overlapping mobile
navigation.

## Database gate

Migration `20260801032334_amordle_public_community_v1.sql` is checksum-locked
for review but remains unapplied until the owner separately authorizes that
specific additive migration. A dry run is permitted; remote mutation is not.
