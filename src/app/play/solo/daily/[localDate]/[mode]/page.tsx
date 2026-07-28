import { notFound } from 'next/navigation';
import { SoloGame } from '@/features/solo/solo-game';
import { DailyAccessGate } from '@/features/solo/daily-access-gate';
import '@/features/solo/solo-game.css';
import { loadWordBank } from '@/server/word-bank';
import { selectDailyAnswers } from '@/domain/selectors';
import type { GameMode, GameSettings } from '@/domain/game';
import { canLoadDailyAnswers, getOwnerNamespace } from '@/server/identity';
import Link from 'next/link';
import { StatusPanel } from '@/components/route-states';

interface Props {
  params: Promise<{ localDate: string; mode: string }>;
}

export default async function SoloDailyPage({ params }: Props) {
  const { localDate, mode: modeValue } = await params;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(localDate) ||
    localDate < '2025-01-01' ||
    (modeValue !== 'og' && modeValue !== 'go')
  ) {
    notFound();
  }
  const mode: GameMode = modeValue;
  if (!(await canLoadDailyAnswers(localDate, mode))) {
    return (
      <div className="route-frame is-narrow">
        <StatusPanel
          title="Locked Daily"
          action={
            <Link className="button primary" href={`/calendar?date=${localDate}&mode=${mode}`}>
              REVIEW IN CALENDAR
            </Link>
          }
        >
          <p>
            Unlock this date to play or view results. This {mode.toUpperCase()} Daily costs 60
            coins. No coins are spent until you confirm.
          </p>
        </StatusPanel>
      </div>
    );
  }
  const bank = await loadWordBank(5);
  const answers = selectDailyAnswers({
    answers: bank.answers,
    localDate,
    mode,
  });
  const settings: GameSettings = {
    mode,
    length: 5,
    difficulty: 'expert',
    hardMode: false,
    goCount: mode === 'go' ? 5 : 1,
  };
  const ownerNamespace = await getOwnerNamespace();
  return (
    <DailyAccessGate localDate={localDate} mode={mode}>
      <SoloGame
        sessionId={`daily:${localDate}:${mode}:${bank.revision}`}
        ownerNamespace={ownerNamespace}
        settings={settings}
        answers={answers}
        validGuesses={bank.validGuesses}
        dailyDate={localDate}
      />
    </DailyAccessGate>
  );
}
