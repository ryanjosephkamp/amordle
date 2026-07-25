# Checkpoint 2 visual comparison ledger

Status: implementation evidence. Automated captures are produced by `tests/e2e/visual.checkpoint-2.spec.ts` at 1440 x 1024 and 390 x 844. Structural coverage remains enforced at 320, 360, 390, 412, 768, 960, 1440, and 1920 pixels. Hosted-preview recapture is required before release-candidate acceptance.

## Truthful Home, Play, History, and Stats — L01–L02, L13–L16

- Composition: Home and Play retain the graphite launch ledger while active identity-owned Solo lanes lead the resume hierarchy.
- Density: empty History and Stats use one compact, source-labeled state instead of invented rows, streaks, ratings, or totals.
- Typography: active counts and result provenance use the mono information layer; route titles keep the condensed editorial hierarchy.
- Interaction state: reload, Back, Forward, and explicit resume preserve the same saved lane without resurrecting terminal sessions.
- Responsive behavior: records recompose in-flow and preserve dock clearance and readable action targets at every required width.

## Progression, Marketplace, and continuation — L17–L18, L33–L34

- Composition: owned Practice inventory remains the Marketplace hero; fixed-price purchase rows and balance context remain secondary.
- Density: 25-coin Reveal and 40-coin Remove are the only inventory actions, with no storefront or fabricated owned counts.
- Typography: coins, inventory, pending, and error states are text-backed and never depend on green/amber alone.
- Interaction state: purchase, consume, continuation, terminal reveal, and reward handoff expose durable pending/success/failure status and deterministic retry.
- Responsive behavior: active-game tools and terminal actions stay in normal flow; keyboard, result controls, and continuation status never overlap.

## Identity, settings, and notifications — L21–L24, L63–L64

- Composition: public profile, private account controls, versioned local settings, and source-derived notifications remain physically distinct.
- Density: the notification center is a compact event ledger with one action row per event and an explicit empty state.
- Typography: unread count, event source, exact time, and public/private labels use text and structure rather than atmospheric color.
- Interaction state: Open marks read and routes; Mark read, Mark all read, Hide, outside click, and Escape never collapse into the same action.
- Responsive behavior: the alert control remains reachable on mobile and the center scrolls within a bounded, safe-area-cleared sheet.

## Calendar and account-scoped Daily access — L09–L12

- Composition: the selected date, four readable lane chips, balance, and past-Daily decision preserve the intended calendar/rail hierarchy.
- Density: Solo completion comes from real history while unavailable COMBAT lanes remain explicit rather than simulated.
- Typography: date, mode, 60-coin price, pending entitlement, and permanent-unlock condition remain readable together.
- Interaction state: payment creates pending access; only the first accepted persisted guess promotes the entitlement permanently.
- Responsive behavior: calendar cells and the decision rail stack without clipping, ambiguous micro-icons, or document overflow.

## Word Explorer, definitions, sharing, and support — L19–L20, L33–L34

- Composition: search, coherent result metadata, answer-safe list, detail, and aligned copy/search actions retain the two-column definition console.
- Density: pagination limits visible valid guesses without implying answer-pool membership or difficulty classification.
- Typography: definition source, copy result, and Google fallback are explicit; terminal GO definitions de-duplicate repeated result words.
- Interaction state: copying reports success/failure, sharing exists only after finalized results, and Feedback previews sanitized content before any external handoff.
- Responsive behavior: action rows wrap cohesively and the mobile definition stack scrolls naturally above fixed navigation.

## Operational truthfulness — L61–L64

- Composition: protected Admin retains its role-first diagnostic hierarchy without fabricated authorized metrics or receipts.
- Density: anonymous, denied, unconfigured, ready, confirm, in-flight, success, and failure specimens show only source-backed fields.
- Typography: unavailable authority is named directly instead of being represented by plausible fixture counts.
- Interaction state: production runtime cannot treat a visual specimen as authorization or successful refresh evidence.
- Responsive behavior: diagnostic and recovery states remain readable at desktop/mobile reference sizes and 200 percent reflow.
