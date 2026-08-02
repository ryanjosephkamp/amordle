import { RouteHeader, WorkbenchRegion } from '@/components/route-states';
import { AccountDangerZone } from '@/features/account/account-danger-zone';
import { AccountSecuritySettings } from '@/features/account/account-security-settings';
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
      <WorkbenchRegion title="ACCOUNT SETTINGS" status="SIGNED-IN SECURITY">
        <AccountSecuritySettings />
      </WorkbenchRegion>
      <WorkbenchRegion title="DANGER ZONE" status="IRREVERSIBLE">
        <AccountDangerZone />
      </WorkbenchRegion>
    </div>
  );
}
