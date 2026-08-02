import { RouteHeader, WorkbenchRegion } from '@/components/route-states';
import { SettingsPanel } from '@/features/account/settings-panel';

export default function SettingsPage() {
  return (
    <div className="route-frame is-narrow">
      <RouteHeader title="Settings">
        <p>Choose how Amordle sounds, moves, alerts you, and starts new games.</p>
      </RouteHeader>
      <WorkbenchRegion title="PREFERENCES" status="ACCOUNT / DEVICE">
        <SettingsPanel />
      </WorkbenchRegion>
    </div>
  );
}
