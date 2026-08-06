# Amordle Stage 2 v6.7 — Owner Manual Checklist

Protected Preview: <https://amordle-gghpij2o3-ryanjosephkamps-projects.vercel.app>
Deployment: `dpl_AL4UNa59TdXhmMn8ek2rBu6oMGrR` · Commit: `0fbcb4d83532901c32d8db12850f4679f3582500`

Sign in with your Vercel account first — the Preview is protected and redirects
unauthenticated visitors to SSO.

**Please check in your dark system colour scheme**, since that is where the reported
contrast defects appeared.

## The twelve annotated items

| #        | Where                               | What to confirm                                                                                                                                                                                                                                                                                            |
| -------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ANNOT-01 | Alerts popover (signed in)          | Status, date, and time sit in three aligned columns. Dates line up under dates, times under times. No run-together text like `Match ready8/2/2026`.                                                                                                                                                        |
| ANNOT-02 | `/play/solo` with 2+ saved games    | Active Solo is a table with Lane / Mode / Setup / Progress / Actions headers. Fields line up down each column. Resume and Abandon still work. Narrow the window: it collapses to labelled rows.                                                                                                            |
| ANNOT-03 | `/play/solo`                        | "resume" text is dark on the light button and clearly readable.                                                                                                                                                                                                                                            |
| ANNOT-04 | `/play`                             | "Set up Solo" is readable. This was invisible white-on-white.                                                                                                                                                                                                                                              |
| ANNOT-05 | `/players`                          | Player name, Rating lane, Minimum rating, Maximum rating, Sort, and apply are all the same height and sit on one baseline.                                                                                                                                                                                 |
| ANNOT-06 | `/stats`                            | Ranked ratings spans the full page width with no blank area to the right. Each lane names itself (e.g. "Ranked Practice · OG") instead of every row reading "Ranked COMBAT". Lane, mode, and clock appear as separate facts. A rating trajectory appears once you have two or more settled ranked results. |
| ANNOT-07 | `/marketplace`                      | Hover a buy button — the label stays readable.                                                                                                                                                                                                                                                             |
| ANNOT-08 | `/settings`                         | Change Email, Change Password, and each Danger Zone action open **centred**. Close each three ways: the × button, Escape, and a click outside the box. While a change is submitting, an outside click must **not** dismiss it. Background must not scroll while a dialog is open.                          |
| ANNOT-09 | Any light button, all accents       | Every light/white button uses the same dark text as Profile's accent chips and Save Profile. Try each accent under Profile.                                                                                                                                                                                |
| ANNOT-10 | `/auth`                             | Signing in lands on Home. A wrong password stays on the page and shows the error rather than redirecting.                                                                                                                                                                                                  |
| ANNOT-11 | Toolbar, every page                 | Signed out reads `guest`. Signed in reads your player name. Without a player name it shows a short email prefix like `ragnargran…`. Never overflows or collides, including at 320px and 200% zoom.                                                                                                         |
| ANNOT-12 | Any finished game with a definition | The word appears inside the definition area itself. Check a ranked COMBAT forfeit specifically — that was the reported case.                                                                                                                                                                               |

## Findings register spot-checks

| #   | Where                            | What to confirm                                                                         |
| --- | -------------------------------- | --------------------------------------------------------------------------------------- |
| W-1 | `/help`                          | The collapsed advanced shortcuts section has a visible border.                          |
| W-2 | `/stats`, `/history`, `/profile` | If a data source fails to refresh, the warning banner is a bordered box, not bare text. |
| W-3 | Alerts popover                   | A failed notification refresh shows a contained warning with a Retry button.            |
| W-5 | `/leaderboards`                  | Four tabs: Practice OG, Practice GO, Daily OG, Daily GO.                                |
| W-7 | `/marketplace`, `/calendar`      | Confirmation panels move focus to the confirm action.                                   |
| W-8 | `/calendar`                      | Future/locked days are readable and still obviously disabled.                           |
| W-9 | `/auth`                          | The Sign in button reads "Working…" only while you are submitting, not on page load.    |

## Known open items — please read before signing off

1. **Leaderboards OG and GO will look empty of recent ratings.** The server-side repair
   (W-11) is written and committed but **not applied to the database**, because its
   authorization requires a local replay that cannot run here — Docker image pulls hang
   behind Docker Desktop's proxy setting. Daily OG and Daily GO lanes work. This is the
   pre-existing defect, not a regression.
2. **W-11 has no end-to-end settled proof** in the hosted suite. Closing that needs a new
   untimed ranked Practice two-player flow.
3. **`verify:budgets` reports 0B for both routes**, so the bundle-size gate is not
   actually measuring. Pre-existing and untouched.

## Sign-off

- [ ] All twelve annotated items confirmed
- [ ] Findings register spot-checks confirmed
- [ ] Open items understood and accepted
- [ ] Approve golden tag
- [ ] Merge and Production release remain **separate** later decisions
