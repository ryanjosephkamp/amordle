import { RouteHeader } from '@/components/route-states';
import { AuthCallback } from '@/features/account/auth-callback';

export default function AuthCallbackPage() {
  return (
    <div className="route-frame is-narrow">
      <RouteHeader title="Finishing sign in">
        <p>Checking your secure sign-in link.</p>
      </RouteHeader>
      <AuthCallback />
    </div>
  );
}
