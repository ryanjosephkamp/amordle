import { RouteHeader } from '@/components/route-states';
import { MarketplacePanel } from '@/features/account/marketplace-panel';

export default function MarketplacePage() {
  return (
    <div className="route-frame is-narrow">
      <RouteHeader title="Marketplace">
        <p>Spend authoritative coins on deterministic Solo Practice aids.</p>
      </RouteHeader>
      <MarketplacePanel />
    </div>
  );
}
