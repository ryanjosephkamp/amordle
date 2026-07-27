import { notFound } from 'next/navigation';
import { SoloGame } from '@/features/solo/solo-game';
import '@/features/solo/solo-game.css';
import { loadWordBank } from '@/server/word-bank';
import { selectPracticeAnswers } from '@/domain/selectors';
import type { Difficulty, GameMode, GameSettings } from '@/domain/game';
import { getOwnerNamespace } from '@/server/identity';

interface Props {
  params: Promise<{ mode: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SoloPracticePage({ params, searchParams }: Props) {
  const route = await params;
  if (route.mode !== 'og' && route.mode !== 'go') notFound();
  const query = await searchParams;
  const mode: GameMode = route.mode;
  const length = Number(first(query.length) ?? '5');
  const difficultyValue = first(query.difficulty) ?? 'standard';
  if (
    !Number.isInteger(length) ||
    length < 2 ||
    length > 35 ||
    !['casual', 'standard', 'expert'].includes(difficultyValue)
  ) {
    notFound();
  }
  const difficulty = difficultyValue as Difficulty;
  const countValue = mode === 'go' ? Number(first(query.count) ?? '5') : 1;
  if (!Number.isInteger(countValue) || (mode === 'go' && ![5, 7, 10].includes(countValue))) {
    notFound();
  }
  const goCount = countValue as 1 | 5 | 7 | 10;
  const generation = Number(first(query.generation) ?? '0');
  if (!Number.isInteger(generation) || generation < 0) notFound();
  const settings: GameSettings = {
    mode,
    length,
    difficulty,
    hardMode: first(query.hard) === '1',
    goCount,
  };
  const bank = await loadWordBank(length);
  const ownerNamespace = await getOwnerNamespace();
  const answers = selectPracticeAnswers({
    answers: bank.answers,
    difficulty,
    count: goCount,
    ownerNamespace,
    mode,
    length,
    generation,
  });
  const sessionId = [
    'practice',
    mode,
    length,
    difficulty,
    settings.hardMode ? 'hard' : 'normal',
    goCount,
    generation,
    bank.revision,
  ].join(':');

  return (
    <SoloGame
      sessionId={sessionId}
      ownerNamespace={ownerNamespace}
      settings={settings}
      answers={answers}
      validGuesses={bank.validGuesses}
    />
  );
}
