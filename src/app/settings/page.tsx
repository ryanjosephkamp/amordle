import { RouteHeader } from '@/components/route-states';
import { SettingsPanel } from '@/features/account/settings-panel';

export default function SettingsPage() {
  return (
    <div className="route-frame is-narrow">
      <RouteHeader title="Settings">
        <p>Preferences follow your account and restore in a fresh browser context.</p>
      </RouteHeader>
      <SettingsPanel />
    </div>
  );
}
