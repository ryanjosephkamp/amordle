import { ExternalLink } from '@/components/external-link';
import { RouteHeader } from '@/components/route-states';
import { RatingSpreadFigure } from './rating-spread-figure';

/*
 * Every number on this page was read out of the code that runs, and each block
 * below names its source. Nothing here is remembered, inferred, or rounded for
 * readability. A wrong equation on a page titled "methodology" is worse than no
 * page at all, so if one of these sources changes, this page is part of the
 * change.
 *
 * Sources, in the order they appear:
 *
 *   Elo            brrrdle_private.amordle_settle_ranked_practice
 *                  supabase/migrations/20260814120000_amordle_system_settlement_and_reaper_v1.sql:222-237, 295-330
 *   Seed rating    public.multiplayer_rating_profiles
 *                  supabase/migrations/20260604033000_phase23_competitive_multiplayer.sql:26
 *   Pools          brrrdle_private.amordle_rating_bucket
 *                  supabase/migrations/20260810020000_amordle_ranked_buckets_v4.sql:65, 86-94
 *                  supabase/migrations/20260810090000_amordle_combat_portal_v1.sql:60-63
 *   Ranked config  public.create_amordle_ranked_practice_request_v2
 *                  supabase/migrations/20260810020000_amordle_ranked_buckets_v4.sql:279-293
 *   Points         brrrdle_private.amordle_action_points
 *                  supabase/migrations/20260724222000_amordle_authoritative_combat_v2.sql:529-538
 *   Attempts       brrrdle_private.amordle_attempt_budget
 *                  supabase/migrations/20260724222000_amordle_authoritative_combat_v2.sql:399
 *   Leaderboard    public.get_public_ranked_leaderboard
 *                  supabase/migrations/20260814010000_amordle_public_ranked_lanes_v4.sql:203-224
 *   XP and coins   soloReward, src/adapters/cloud/solo.ts:157-172
 *   Levels         levelForXp, src/domain/economy.ts:10-13
 *   Daily streak   advanceDailyStreak / currentDailyStreak, src/domain/daily-streak.ts
 *   Prices         supabase/migrations/20260711051818_phase57_solo_practice_marketplace_and_consumables.sql:101-103
 *   Continuation   continuationCost, src/domain/economy.ts:20-42 (see also
 *                  completionPercentage, src/domain/game.ts:485)
 */

const clockLadder = [
  ['Untimed', 'No clock at all', 'Whole match'],
  ['1 minute', '60,000 ms', 'Whole match'],
  ['3 minutes', '180,000 ms', 'Whole match'],
  ['5 minutes', '300,000 ms', 'Whole match'],
  ['10 minutes', '600,000 ms', 'Whole match'],
  ['20 minutes', '1,200,000 ms', 'Whole match'],
  ['45 minutes', '2,700,000 ms', 'Whole match'],
  ['1 day', '86,400,000 ms', 'Every move'],
  ['3 days', '259,200,000 ms', 'Every move'],
  ['7 days', '604,800,000 ms', 'Every move'],
] as const;

const workedExamples = [
  ['You are rated 1200, your opponent 1200', 'Win', '24', '+12'],
  ['You are rated 1200, your opponent 1200', 'Draw', '24', '0'],
  ['You are rated 1200, your opponent 1200', 'Loss', '24', '−12'],
  ['You are rated 1200, your opponent 1400', 'Win', '24', '+18'],
  ['You are rated 1200, your opponent 1400', 'Loss', '24', '−6'],
  ['You are rated 1400, your opponent 1200', 'Win', '24', '+6'],
  ['You are rated 1400, your opponent 1200', 'Loss', '24', '−18'],
  ['Your first nine games, evenly matched', 'Win', '40', '+20'],
] as const;

const continuationTable = [
  ['0', '0%', '6', '12', '18'],
  ['1', '20%', '6', '12', '18'],
  ['2', '40%', '5', '10', '15'],
  ['3', '60%', '5', '10', '15'],
  ['4', '80%', '4', '8', '12'],
] as const;

export default function MethodologyPage() {
  return (
    <div className="route-frame is-narrow">
      <RouteHeader title="Methodology">
        <p>Exactly how ratings, experience, and coins are calculated.</p>
      </RouteHeader>
      <div className="prose-sections">
        <section>
          <h2>Rating</h2>
          <p>
            Ranked play uses the{' '}
            <ExternalLink href="https://en.wikipedia.org/wiki/Elo_rating_system">
              Elo system
            </ExternalLink>
            , devised by Arpad Elo for chess and used by rating bodies since the 1960s. The idea is
            that a rating is a prediction: the gap between two ratings says how likely each player
            is to win. Play to that prediction and your rating holds. Beat it and your rating rises
            by the amount the result was a surprise.
          </p>
          <p>
            After a ranked match ends, the server computes an expected score for each player and
            adjusts both ratings by the difference between what happened and what was expected.
          </p>
          <pre className="equation">
            {`expected  E = 1 / (1 + 10 ^ ((opponent rating − your rating) / 400))

  change  Δ = round(K × (S − E))

           S = 1 for a win · 0.5 for a draw · 0 for a loss`}
          </pre>
          <p>
            A 400-point gap means the stronger player is expected to score about ten times as often
            as the weaker one. Because <b>E</b> is subtracted from what you actually scored, beating
            a stronger opponent moves your rating further than beating a weaker one, and losing to a
            weaker opponent costs more than losing to a stronger one. A draw between equals moves
            nothing.
          </p>
          <RatingSpreadFigure />
          <h3>The constants</h3>
          <div className="table-scroll">
            <table className="responsive-table">
              <thead>
                <tr>
                  <th>Value</th>
                  <th>What it is</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td data-label="Value">1200</td>
                  <td data-label="What it is">
                    The rating every player starts on in a pool they have never played.
                  </td>
                </tr>
                <tr>
                  <td data-label="Value">K = 40</td>
                  <td data-label="What it is">
                    Used while a rating is provisional — your first ten games in that pool. Ratings
                    move quickly at first so a new player reaches roughly the right level fast.
                  </td>
                </tr>
                <tr>
                  <td data-label="Value">K = 24</td>
                  <td data-label="What it is">
                    Used from the tenth game onward, once the rating has settled. One result can
                    then move it by at most 24 points.
                  </td>
                </tr>
                <tr>
                  <td data-label="Value">10 games</td>
                  <td data-label="What it is">
                    The point at which a rating stops being labeled provisional. The two players in
                    a match are counted separately, so one can still be provisional while the other
                    is not.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <h3>What that works out to</h3>
          <div className="table-scroll">
            <table className="responsive-table">
              <thead>
                <tr>
                  <th>Situation</th>
                  <th>Result</th>
                  <th>K</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {workedExamples.map(([situation, result, k, change]) => (
                  <tr key={`${situation}-${result}-${k}`}>
                    <td data-label="Situation">{situation}</td>
                    <td data-label="Result">{result}</td>
                    <td data-label="K">{k}</td>
                    <td data-label="Change">{change}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>A few notes</h3>
          <ul>
            <li>
              There is no floor and no ceiling. A rating is not clamped at either end, and no result
              is capped beyond what K already limits it to.
            </li>
            <li>
              A match is not always zero-sum. When one player is provisional and the other is not,
              they are on different K values, so the points one gains need not equal the points the
              other loses. Nothing is created or destroyed deliberately; it falls out of letting new
              players find their level faster.
            </li>
            <li>
              Every rating change is written to a permanent ledger recording the rating before, the
              rating after, the change, and the expected score that produced it. Settlement runs
              once per match and is keyed so that a repeat cannot double-count.
            </li>
          </ul>
        </section>

        <section>
          <h2>Why there are forty separate ratings</h2>
          <p>
            A rating only means something when everyone holding it played the same game. A
            forty-five minute match and a one-minute match ask for different skills, and a rating
            that mixed them would describe neither. So each combination keeps its own rating,
            entirely independent of the others.
          </p>
          <p>
            There are ten clocks, two modes — OG and GO — and Hard Mode on or off. That is forty
            ranked Practice pools, plus a separate pool for each of the two ranked Daily modes. Your
            rating in one says nothing about your rating in another, and you can be provisional in
            one while established in another.
          </p>
          <div className="table-scroll">
            <table className="responsive-table">
              <thead>
                <tr>
                  <th>Clock</th>
                  <th>Budget</th>
                  <th>Applies to</th>
                </tr>
              </thead>
              <tbody>
                {clockLadder.map(([label, budget, applies]) => (
                  <tr key={label}>
                    <td data-label="Clock">{label}</td>
                    <td data-label="Budget">{budget}</td>
                    <td data-label="Applies to">{applies}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            The first seven are a budget for the whole match: run out and you lose on time. The last
            three are a budget for each move, which refills every turn — those are the
            correspondence games, played over days.
          </p>
          <p>
            Everything else about a ranked match is fixed, so that the pool name describes the game
            completely: every ranked match is five letters, expert difficulty, and a ranked GO match
            is always five puzzles. Unranked and private matches keep every option; it is only
            ratings that need the comparison to be fair.
          </p>
        </section>

        <section>
          <h2>How a match is decided</h2>
          <p>
            Ratings move on the result, and the result comes from points. Each guess scores on the
            evidence it produced, and solving the word is worth far more than the letters that led
            there — so a player who solves in three guesses beats a player who almost solves in six.
          </p>
          <div className="table-scroll">
            <table className="responsive-table">
              <thead>
                <tr>
                  <th>For</th>
                  <th>Points</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td data-label="For">Each letter in the right place</td>
                  <td data-label="Points">5</td>
                </tr>
                <tr>
                  <td data-label="For">Each letter in the word but the wrong place</td>
                  <td data-label="Points">2</td>
                </tr>
                <tr>
                  <td data-label="For">Each letter not in the word</td>
                  <td data-label="Points">0</td>
                </tr>
                <tr>
                  <td data-label="For">Solving the word</td>
                  <td data-label="Points">100</td>
                </tr>
                <tr>
                  <td data-label="For">Each guess you did not need, when you solve</td>
                  <td data-label="Points">10</td>
                </tr>
                <tr>
                  <td data-label="For">Solving in Hard Mode</td>
                  <td data-label="Points">15</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            In a GO chain the attempts tighten as you go: six on the first puzzle, then five, four,
            three, and two from the fifth puzzle onward. Fewer attempts also means more unused ones
            are unavailable, so later puzzles are worth less by way of the solve bonus, not by a
            separate rule.
          </p>
          <p>
            When a match settles, the server does not trust the running total it was shown. It
            recomputes every move&rsquo;s points from the recorded evidence, checks the declared
            winner against the totals it derived, and refuses to settle at all if the two disagree.
            A match that cannot be verified does not move anyone&rsquo;s rating.
          </p>
        </section>

        <section>
          <h2>How the leaderboard is ordered</h2>
          <p>
            Within a pool, players are ranked by rating, highest first. Where ratings are equal the
            order is decided by games played, then by peak rating, then by which rating changed most
            recently, and finally by profile identifier — so the order is always definite and never
            reshuffles between visits.
          </p>
          <p>
            Peak rating is the true historical high, read from the rating ledger rather than from
            the current value. To appear at all you need at least one settled game in that pool and
            a public profile. Provisional players are listed and labeled rather than hidden.
          </p>
        </section>

        <section>
          <h2>Experience and levels</h2>
          <p>Experience comes from Solo games — Practice and Daily.</p>
          <div className="table-scroll">
            <table className="responsive-table">
              <thead>
                <tr>
                  <th>Outcome</th>
                  <th>Experience</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td data-label="Outcome">Win</td>
                  <td data-label="Experience">
                    40, plus 20 for each puzzle solved, plus a speed bonus of 10 minus the number of
                    guesses you made — nothing if you made ten or more.
                  </td>
                </tr>
                <tr>
                  <td data-label="Outcome">Loss</td>
                  <td data-label="Experience">
                    10 for each puzzle you solved before the game ended.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Levels are a square curve: level <b>n</b> begins at 100 × (n−1)². So level 2 arrives at
            100 experience, level 3 at 400, level 4 at 900, level 5 at 1,600. Each level takes
            longer than the last, deliberately — the number should keep meaning something after a
            hundred games.
          </p>
          <p>
            COMBAT awards no experience. Competitive play is measured by rating, and paying twice
            for the same match would let one mode inflate a number meant to describe another.
          </p>
        </section>

        <section>
          <h2>Coins</h2>
          <p>Coins also come from Solo games.</p>
          <div className="table-scroll">
            <table className="responsive-table">
              <thead>
                <tr>
                  <th>Outcome</th>
                  <th>Coins</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td data-label="Outcome">Win</td>
                  <td data-label="Coins">8, plus 4 for each puzzle solved.</td>
                </tr>
                <tr>
                  <td data-label="Outcome">Loss</td>
                  <td data-label="Coins">
                    1 for each puzzle solved, up to 4 — so a long chain that ends badly is still
                    worth something, but not much.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>What they buy:</p>
          <div className="table-scroll">
            <table className="responsive-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td data-label="Item">Reveal one letter</td>
                  <td data-label="Cost">25</td>
                </tr>
                <tr>
                  <td data-label="Item">Remove five incorrect letters</td>
                  <td data-label="Cost">40</td>
                </tr>
                <tr>
                  <td data-label="Item">Unlock a past Daily</td>
                  <td data-label="Cost">60</td>
                </tr>
                <tr>
                  <td data-label="Item">Another guess</td>
                  <td data-label="Cost">Varies — see below</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            A balance can never go below zero, and no single transaction may exceed 10,000 coins.
          </p>
        </section>

        <section>
          <h2>The cost of another guess</h2>
          <p>
            Buying another guess is the one price that is calculated rather than fixed. Two things
            move it: how close you already are, and how many extra guesses you have already bought
            in this game.
          </p>
          <pre className="equation">
            {`H = half the word length, rounded up
C = how much of H your best row has already earned
n = extra guesses already bought in this game

cost = (H − C + 3) × (n + 1)          minimum 1`}
          </pre>
          <p>
            Being closer makes the next guess cheaper, because <b>C</b> rises with the proportion of
            the word you have placed correctly — measured on your best row for the puzzle you are
            currently on, not across the whole chain. Buying repeatedly makes it steeply more
            expensive: the second extra guess costs twice the base, the third three times. For a
            five-letter word:
          </p>
          <div className="table-scroll">
            <table className="responsive-table">
              <thead>
                <tr>
                  <th>Letters placed</th>
                  <th>Progress</th>
                  <th>1st extra</th>
                  <th>2nd</th>
                  <th>3rd</th>
                </tr>
              </thead>
              <tbody>
                {continuationTable.map(([letters, progress, first, second, third]) => (
                  <tr key={letters}>
                    <td data-label="Letters placed">{letters}</td>
                    <td data-label="Progress">{progress}</td>
                    <td data-label="1st extra">{first}</td>
                    <td data-label="2nd">{second}</td>
                    <td data-label="3rd">{third}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Longer words start dearer, because <b>H</b> is larger: a ten-letter word with nothing
            placed costs 8 for the first extra guess where a five-letter word costs 6.
          </p>
        </section>

        <section>
          <h2>The daily streak</h2>
          <p>
            Your streak counts consecutive days on which you finished a Daily. The rules are short
            enough to state completely:
          </p>
          <ul>
            <li>
              <b>Either Daily counts.</b> The OG and the GO are two ways to keep the same streak,
              not two streaks. Finishing both on one day counts once.
            </li>
            <li>
              <b>Finishing counts, not winning.</b> A Daily you lose keeps the streak. Showing up is
              the thing being measured.
            </li>
            <li>
              <b>The day is your local day</b>, the same one the Daily calendar uses, so your streak
              turns over at your midnight rather than anybody else&rsquo;s.
            </li>
            <li>
              <b>Miss a day and it lapses.</b> Your next finished Daily starts a new streak at one.
              The panel shows the streak as zero from the moment a day has gone by without one.
            </li>
            <li>
              <b>Unlocking a past Daily cannot repair it.</b> Playing an older date records the
              result and pays the usual coins and experience, but the streak only ever moves
              forward. A streak you have lost cannot be bought back.
            </li>
          </ul>
        </section>

        <section>
          <h2>What&rsquo;s checked and where</h2>
          <p>
            Some of this is enforced by the server, and some is calculated by the app on your
            device.
          </p>
          <h3>Server</h3>
          <ul>
            <li>
              <b>Ratings:</b> Points are recomputed from the recorded evidence, the winner is
              checked against them, and the rating change is written in the same transaction as the
              result.
            </li>
            <li>
              <b>The price of a reveal, a removal, and your balance:</b> The server knows the two
              prices and refuses a purchase you cannot afford.
            </li>
          </ul>
          <h3>App</h3>
          <ul>
            <li>
              <b>Experience and coins earned:</b> Applied through an operation that is keyed so it
              cannot be applied twice.
            </li>
            <li>
              <b>The daily streak:</b> Computed on your device from the date of the Daily you
              finished and written to the same saved record as your experience. It is keyed to the
              day, which is what makes finishing both Dailies count once.
            </li>
            <li>
              <b>The price of another guess, and of unlocking a past Daily:</b> The server checks
              only that you have the coins. The formula above is what the game charges, but it is
              the app that applies it.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
