import { SoloSetup } from '@/features/solo/solo-setup';
import { RouteHeader } from '@/components/route-states';

export const metadata = { title: 'Solo setup' };

export default function SoloSetupPage() {
  return (
    <div className="route-frame">
      <RouteHeader title="Solo setup">
        <p>
          Start with the standard five-letter game or choose a longer word, difficulty, Hard Mode,
          or GO chain.
        </p>
      </RouteHeader>
      <SoloSetup />
    </div>
  );
}
