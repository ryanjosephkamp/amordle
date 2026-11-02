import { RouteHeader } from '@/components/route-states';
import { AuthPanel } from '@/features/account/auth-panel';

export default function AuthPage() {
  return (
    <div className="route-frame is-narrow">
      <RouteHeader title="Account">
        <p>Save progress across devices and use profiles, coins, and COMBAT.</p>
      </RouteHeader>
      <AuthPanel />
    </div>
  );
}
