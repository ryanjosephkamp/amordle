import { RouteHeader } from '@/components/route-states';
import { ProfileEditor } from '@/features/account/profile-editor';

export default function ProfilePage() {
  return (
    <div className="route-frame is-narrow">
      <RouteHeader title="Profile">
        <p>Choose your player name and what other players can see.</p>
      </RouteHeader>
      <ProfileEditor />
    </div>
  );
}
