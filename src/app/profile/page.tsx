import { RouteHeader } from '@/components/route-states';
import { ProfileEditor } from '@/features/account/profile-editor';

export default function ProfilePage() {
  return (
    <div className="route-frame is-narrow">
      <RouteHeader title="Profile">
        <p>Choose what other players can see. Your Auth identifier is never public.</p>
      </RouteHeader>
      <ProfileEditor />
    </div>
  );
}
