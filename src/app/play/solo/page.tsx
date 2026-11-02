import { SoloSetup } from '@/features/solo/solo-setup';
import { RouteHeader } from '@/components/route-states';
import { WorkbenchRegion } from '@/components/route-states';
import { ActiveSoloSessions } from '@/features/solo/active-solo-sessions';
import { getOwnerNamespace } from '@/server/identity';

export const metadata = { title: 'Solo setup' };

export default async function SoloSetupPage() {
  const ownerNamespace = await getOwnerNamespace();
  return (
    <div className="route-frame">
      <RouteHeader title="Solo setup">
        <p>
          Start with the standard five-letter game or choose a longer word, difficulty, Hard Mode,
          or GO chain.
        </p>
      </RouteHeader>
      <SoloSetup ownerNamespace={ownerNamespace} />
      <WorkbenchRegion title="ACTIVE SOLO" status="RESUME OR ABANDON">
        <ActiveSoloSessions ownerNamespace={ownerNamespace} />
      </WorkbenchRegion>
    </div>
  );
}
