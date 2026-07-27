import { RouteHeader } from '@/components/route-states';
import { RecoveryPanel } from '@/features/account/recovery-panel';

export default function AuthRecoveryPage() {
  return (
    <div className="route-frame is-narrow">
      <RouteHeader title="Choose a new password">
        <p>Open this route from the recovery link sent to your email.</p>
      </RouteHeader>
      <RecoveryPanel />
    </div>
  );
}
