import Link from 'next/link';
import { CreditRow } from '@/components/credit-row';
import { ExternalLink } from '@/components/external-link';
import { RouteHeader } from '@/components/route-states';

const CHANGELOG = 'https://ryanjosephkamp.github.io/amordle-updates/';
const REPOSITORY = 'https://github.com/ryanjosephkamp/amordle';
const ISSUES = `${REPOSITORY}/issues/new`;
const SECURITY_REPORT = `${REPOSITORY}/security/advisories/new`;
const OPENLIST = 'https://english-openlist.pages.dev/';
const DATASET = 'https://huggingface.co/datasets/ryanjosephkamp/english-openlist';

export default function AboutPage() {
  return (
    <div className="route-frame is-narrow">
      <RouteHeader title="About Amordle">
        <p>The ultimate Wordle-Hurdle hybrid.</p>
        <p>No ads. No distractions. No BS.</p>
      </RouteHeader>
      <div className="prose-sections">
        <section>
          <h2>What it is</h2>
          <p>
            Amordle doesn&rsquo;t just combine{' '}
            <ExternalLink href="https://en.wikipedia.org/wiki/Wordle">Wordle</ExternalLink> and{' '}
            <ExternalLink href="https://www.arkadium.com/games/hurdle/">Hurdle</ExternalLink> into
            one platform. It <em>upgrades</em> the games:
          </p>
          <ul>
            <li>
              <strong>
                No ads, no paywalls, no nonsense. Amordle is completely free &ndash; forever.
              </strong>
            </li>
            <li>
              <strong>Comprehensive word lists:</strong> Solutions come from the{' '}
              <ExternalLink href={OPENLIST}>English OpenList</ExternalLink>, a free list of over
              345,000 English words, checked against dictionaries every night. No valid English word
              is off-limits.
            </li>
            <li>
              <strong>Game customization:</strong> Choose your own word lengths, solution
              difficulty, and puzzle count (for GO/Hurdle). Want to play 2-letter Wordle, or
              something crazy like 35-letter Hurdle? Amordle has you covered.
            </li>
            <li>
              <strong>Multiplayer:</strong> Amordle is the{' '}
              <ExternalLink href="https://lichess.org/">Lichess</ExternalLink>{' '}
              {/*
               * Explicit, because JSX drops the space between a tag and text
               * that wraps to the next line and this one rendered as
               * "Lichessof Wordle" in production.
               */}
              of Wordle &ndash; play public or private Practice matches, or play ranked Amordle
              COMBAT to earn an Elo and climb the leaderboards.
            </li>
          </ul>
          <p>Two modes:</p>
          <ol>
            <li>
              <strong>OG:</strong> an upgraded Wordle experience.
            </li>
            <li>
              <strong>GO:</strong> an upgraded Hurdle experience.
            </li>
          </ol>
        </section>
        <section>
          <h2>How scoring works</h2>
          <p>
            Full transparency. Read <Link href="/methodology">the methodology page</Link> for how
            ratings, experience, and coins are all calculated.
          </p>
        </section>
        <section>
          <h2>Changelog</h2>
          <p>
            Updates are written up as they ship, with a short video when the change is something you
            can see. <ExternalLink href={CHANGELOG}>Read the changelog</ExternalLink>.
          </p>
        </section>
        <section>
          <h2>Report something</h2>
          <p>
            Bugs and ideas go to the issue tracker. Anything you can add about what you were doing
            at the time helps. Security problems go through GitHub&rsquo;s private reporting
            instead, so nobody sees them before they&rsquo;re fixed.
          </p>
          <div className="action-row">
            <ExternalLink href={`${ISSUES}?labels=bug&title=Bug%3A%20`} variant="button">
              REPORT A BUG
            </ExternalLink>
            <ExternalLink href={SECURITY_REPORT} variant="button">
              REPORT A SECURITY ISSUE
            </ExternalLink>
            <ExternalLink
              href={`${ISSUES}?labels=enhancement&title=Feature%3A%20`}
              variant="button"
            >
              REQUEST A FEATURE
            </ExternalLink>
          </div>
          <p>
            The source is on <ExternalLink href={REPOSITORY}>GitHub</ExternalLink> under the
            AGPL-3.0.
          </p>
        </section>
        <section>
          <h2>Where the words come from</h2>
          <p>
            Every word in the game is drawn from the{' '}
            <ExternalLink href={OPENLIST}>English OpenList</ExternalLink> (EOL), Ryan&rsquo;s
            attempt to assemble the world&rsquo;s biggest, most up-to-date, totally free dataset of
            &ldquo;valid&rdquo; English words.
          </p>
          <p>
            If you want to make{' '}
            <Link href="/">a word game that checks whether a string of letters is legit</Link>, or
            if you want to find{' '}
            <ExternalLink href="https://ars-magna.pages.dev/">
              every possible way to arrange the letters of anything into real words
            </ExternalLink>
            , then you need to know which words are acceptable and which ones aren&rsquo;t. But new
            words are added to dictionaries practically every day, and until the EOL, there was no
            suitable open list of this magnitude and updated on a daily basis.
          </p>
          <p>
            And if you&rsquo;re wondering what makes a word &ldquo;valid&rdquo; or
            &ldquo;invalid&rdquo; and think you have a better definition for wordhood, join the
            club. You might even want your own EOL that uses a different validation algorithm. If
            that&rsquo;s the case, then check out the EOL&rsquo;s cousin, the{' '}
            <ExternalLink href="https://common-english-openlist.pages.dev/">
              Common English OpenList
            </ExternalLink>{' '}
            (CEOL), which was created for exactly this purpose.
          </p>
          <p>
            The EOL is <ExternalLink href={DATASET}>published in full</ExternalLink>, so the
            vocabulary this game draws on can be inspected rather than taken on trust. The game
            ships a pinned copy, so a word added to the EOL shows up here after the next reviewed
            refresh.
          </p>
          <div className="action-row">
            <ExternalLink href={OPENLIST} variant="button">
              THE ENGLISH OPENLIST
            </ExternalLink>
            <ExternalLink href={DATASET} variant="button">
              HUGGING FACE DATASET
            </ExternalLink>
            <ExternalLink
              href="https://github.com/ryanjosephkamp/english-openlist"
              variant="button"
            >
              EOL ON GITHUB
            </ExternalLink>
          </div>
        </section>
        <section>
          <h2>Credit</h2>
          <p>
            Built by <ExternalLink href="https://ryanjosephkamp.github.io">Ryan Kamp</ExternalLink>.
            Set in <ExternalLink href="https://github.com/vercel/geist-font">Geist</ExternalLink>{' '}
            (SIL Open Font License 1.1). The word lists come from the{' '}
            <ExternalLink href={DATASET}>English OpenList</ExternalLink>; its dataset card gives
            their terms.
          </p>
          <div className="action-row">
            <Link className="button" href="/players/f08161d7-6d57-4142-b42d-7bcf86b983fc">
              PLAYER PROFILE
            </Link>
          </div>
        </section>
        <section>
          <h2>Accessibility and privacy</h2>
          <p>
            The product targets WCAG 2.2 AA, supports keyboard and touch, respects reduced motion
            and forced colors, and separates public player identity from private account data.
          </p>
        </section>
      </div>
      <CreditRow />
    </div>
  );
}
