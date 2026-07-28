import { RouteHeader, WorkbenchRegion } from '@/components/route-states';
import { MarketplacePanel } from '@/features/account/marketplace-panel';

export default function MarketplacePage() {
  return (
    <div className="route-frame is-narrow">
      <RouteHeader title="Marketplace">
        <p>Use coins for optional Solo Practice tools.</p>
      </RouteHeader>
      <WorkbenchRegion title="SOLO PRACTICE TOOLS" status="COINS">
        <MarketplacePanel />
      </WorkbenchRegion>
    </div>
  );
}
