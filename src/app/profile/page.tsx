import { RouteHeader } from '@/components/route-states';
import { ProfileEditor } from '@/features/account/profile-editor';

export default function ProfilePage() {
  return (
    <div className="route-frame is-narrow">
      <RouteHeader title="Profile">
        <p>Choose the public identity other players see across Amordle.</p>
      </RouteHeader>
      <ProfileEditor />
    </div>
  );
}
