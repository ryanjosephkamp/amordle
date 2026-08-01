import { RouteHeader, WorkbenchRegion } from '@/components/route-states';
import { SettingsPanel } from '@/features/account/settings-panel';
import { getOwnerNamespace } from '@/server/identity';

export default async function SettingsPage() {
  const ownerNamespace = await getOwnerNamespace();
  return (
    <div className="route-frame is-narrow">
      <RouteHeader title="Settings">
        <p>Choose how Amordle sounds, moves, alerts you, and starts new games.</p>
      </RouteHeader>
      <WorkbenchRegion title="PREFERENCES" status="ACCOUNT / DEVICE">
        <SettingsPanel ownerNamespace={ownerNamespace} />
      </WorkbenchRegion>
    </div>
  );
}
