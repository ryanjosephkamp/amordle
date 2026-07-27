import { RouteHeader } from '@/components/route-states';
import { AuthPanel } from '@/features/account/auth-panel';

export default function AuthPage() {
  return (
    <div className="route-frame is-narrow">
      <RouteHeader title="Account">
        <p>Keep cloud-backed progress, public identity, economy, and COMBAT under one account.</p>
      </RouteHeader>
      <AuthPanel />
    </div>
  );
}
