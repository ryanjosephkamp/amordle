import { RouteHeader } from '@/components/route-states';
import { FeedbackBuilder } from '@/features/support/feedback-builder';

export default function FeedbackPage() {
  return (
    <div className="route-frame">
      <RouteHeader title="Feedback">
        <p>Build a private preview, then decide whether to copy it or open an issue.</p>
      </RouteHeader>
      <FeedbackBuilder />
    </div>
  );
}
