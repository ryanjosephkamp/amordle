import { SoloSetup } from '@/features/solo/solo-setup';

export const metadata = { title: 'Solo setup' };

export default function SoloSetupPage() {
  return (
    <div className="route-frame">
      <header className="route-header">
        <h1>Solo setup</h1>
        <p>
          Start with the standard five-letter game or choose a longer word, difficulty, Hard Mode,
          or GO chain from the settings links.
        </p>
      </header>
      <SoloSetup />
    </div>
  );
}
