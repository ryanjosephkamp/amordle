import { RouteHeader } from '@/components/route-states';
import { FeedbackBuilder } from '@/features/support/feedback-builder';

export default function FeedbackPage() {
  return (
    <div className="route-frame">
      <RouteHeader title="Feedback">
        <p>Build and inspect a sanitized issue. You decide whether to copy or open it.</p>
      </RouteHeader>
      <FeedbackBuilder />
    </div>
  );
}
