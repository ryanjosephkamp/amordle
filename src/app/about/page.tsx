import { RouteHeader } from '@/components/route-states';

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
          <h2>Ratings</h2>
          <p>
            Ranked Practice uses separate OG and GO rating buckets. Ratings begin provisional,
            update only after one terminal settlement, and expose public rank and movement only
            through public summaries.
          </p>
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
