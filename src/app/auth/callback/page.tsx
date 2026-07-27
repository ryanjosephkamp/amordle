import { RouteHeader } from '@/components/route-states';
import { AuthCallback } from '@/features/account/auth-callback';

export default function AuthCallbackPage() {
  return (
    <div className="route-frame is-narrow">
      <RouteHeader title="Account callback" />
      <AuthCallback />
    </div>
  );
}
