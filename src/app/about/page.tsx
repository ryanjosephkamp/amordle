import Link from 'next/link';
import { ExternalLink } from '@/components/external-link';
import { RouteHeader } from '@/components/route-states';

const CHANGELOG = 'https://ryanjosephkamp.github.io/amordle-updates/';
const REPOSITORY = 'https://github.com/ryanjosephkamp/amordle';
const ISSUES = `${REPOSITORY}/issues/new`;

export default function AboutPage() {
  return (
    <div className="route-frame is-narrow">
      <RouteHeader title="About Amordle">
        <p>A precise, approachable word game for Solo routines and thoughtful competition.</p>
      </RouteHeader>
      <div className="prose-sections">
        <section>
          <h2>What it is</h2>
          <p>
            Amordle combines a focused one-answer game with linked GO puzzles, local-day Solo
            challenges, and asynchronous COMBAT. The interface stays restrained so the evidence,
            turn, and next action remain easy to read.
          </p>
        </section>
        <section>
          <h2>How scoring works</h2>
          <p>
            Ratings, experience, and coins are all calculated by published formulas rather than by
            judgement. <Link href="/methodology">The methodology page</Link> sets out every one of
            them, taken from the code that runs.
          </p>
        </section>
        <section>
          <h2>What has changed</h2>
          <p>
            Updates are written up as they ship, with a short video when the change is something you
            can see. <ExternalLink href={CHANGELOG}>Read the changelog</ExternalLink>.
          </p>
        </section>
        <section>
          <h2>Report something</h2>
          <p>
            Bugs, security problems, and ideas all go to the same issue tracker. Anything you can
            add about what you were doing at the time helps.
          </p>
          <div className="action-row">
            <ExternalLink href={`${ISSUES}?labels=bug&title=Bug%3A%20`} variant="button">
              REPORT A BUG
            </ExternalLink>
            <ExternalLink href={`${ISSUES}?labels=security&title=Security%3A%20`} variant="button">
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
            The game is built in the open at <ExternalLink href={REPOSITORY}>GitHub</ExternalLink>.
          </p>
        </section>
        <section>
          <h2>Credit</h2>
          <p>
            Built by <ExternalLink href="https://ryanjosephkamp.github.io">Ryan Kamp</ExternalLink>.
          </p>
          <div className="action-row">
            <Link className="button" href="/players/f08161d7-6d57-4142-b42d-7bcf86b983fc">
              PLAYER PROFILE
            </Link>
            <ExternalLink href="https://github.com/ryanjosephkamp" variant="button">
              GITHUB
            </ExternalLink>
            <ExternalLink href="https://github.com/sponsors/ryanjosephkamp" variant="button">
              SPONSOR
            </ExternalLink>
            <ExternalLink href="https://www.linkedin.com/in/ryanjosephkamp" variant="button">
              LINKEDIN
            </ExternalLink>
          </div>
        </section>
        <section>
          <h2>Where the words come from</h2>
          <p>
            Every word in the game is drawn from the English OpenList, an open dataset of English
            words also built by Ryan Kamp. It is published in full, so the vocabulary this game
            draws on can be inspected rather than taken on trust.
          </p>
          <div className="action-row">
            <ExternalLink href="https://english-openlist.pages.dev/" variant="button">
              THE OPENLIST
            </ExternalLink>
            <ExternalLink
              href="https://huggingface.co/datasets/ryanjosephkamp/english-openlist"
              variant="button"
            >
              DATASET
            </ExternalLink>
            <ExternalLink
              href="https://github.com/ryanjosephkamp/english-openlist"
              variant="button"
            >
              SOURCE
            </ExternalLink>
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
    </div>
  );
}
