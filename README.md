# Amordle

**Amordle = Wordle + Hurdle + Lichess − Ads.**

A free word game that combines [Wordle](https://en.wikipedia.org/wiki/Wordle) and
[Hurdle](https://www.arkadium.com/games/hurdle/) and then upgrades both: any word
length from 2 to 35 letters, three difficulties, a daily puzzle, and ranked
multiplayer against other people with a real Elo rating attached.

No ads. No paywalls. Free, and it stays free.

**[Play it →](https://amordle.vercel.app)**

- [How to play](https://amordle.vercel.app/help)
- [How scoring works](https://amordle.vercel.app/methodology) — the Elo equation, both K factors, the XP curve and every coin price, read out of the code that runs
- [Changelog](https://ryanjosephkamp.github.io/amordle-updates/)
- [Why I built it](https://ryanjosephkamp.github.io/blog/articles/amordle/)

## The two modes

**OG** is Wordle, upgraded. One puzzle, one answer, one coloured tile per guess
letter.

**GO** is Hurdle, upgraded: a chain of five, seven or ten puzzles where every
answer you solve carries forward as evidence in the next one.

Both are playable solo, and both are playable against another person in **COMBAT**
— one shared board, alternating turns, and a rating that moves when you win or
lose. Ratings live in forty separate pools (ten clocks × two modes × Hard Mode on
or off), because a rating only means something when everyone holding it played
the same game.

## Where the words come from

Every word is drawn from the [English OpenList](https://english-openlist.pages.dev/),
an open dataset of Scrabble-valid English words. It is published in full, so the
vocabulary the game draws on can be inspected rather than taken on trust — and it
is the reason the game can offer 2 to 35 letters at all.

## Running it locally

Requires Node 24.18.0 and pnpm. The Supabase-backed features (accounts, COMBAT,
ratings) need your own Supabase project; Solo play works without one.

```sh
pnpm install
cp .env.example .env.local   # then fill in your own Supabase values
pnpm dev
```

`.env.example` documents every variable. Nothing prefixed `NEXT_PUBLIC_` may hold
a secret — a build guard in `next.config.ts` refuses to produce a deployment
artifact without browser-safe Supabase configuration, naming which value is
missing.

## Checks

```sh
pnpm check          # format, lint, types, and the structural verifiers
pnpm test:domain    # pure domain tests, no browser
pnpm test:browser   # component and interaction tests
pnpm test:visual    # responsive, contrast and forced-colors sweeps
```

The verifiers under `pnpm check` are the unusual part. They assert things types
cannot: that the migration set is append-only and its applied files unchanged,
that server-only code never reaches the browser bundle, that the published
scoring numbers still match the SQL that computes them, and that the bundle stays
inside its size budgets.

## Layout

| | |
|---|---|
| `src/` | the application — `domain/` is pure rules, `features/` is UI, `adapters/` talks to Supabase |
| `supabase/migrations/` | every migration, append-only and hash-verified |
| `data/` | the bundled word lists |
| `tests/` | domain, browser, fixture, service and visual suites |
| `scripts/` | the verifiers, word-data tooling and operator scripts |
| `docs/`, `reports/`, `progress/` | how the thing was built, and why particular decisions were made |

## Contributing

Bug reports and feature requests are welcome as
[issues](https://github.com/ryanjosephkamp/amordle/issues). If you are opening a
pull request, run `pnpm check` first — it catches most of what review would.

## License

[GNU AGPL-3.0](LICENSE).

Use it, change it, self-host it. The one condition is that if you run a modified
version as a public service, you publish your source too. Amordle exists because
word games got worse when they got monetised; the licence is there so this one
cannot quietly become the thing it was built against.
