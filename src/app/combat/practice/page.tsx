import { RouteHeader } from '@/components/route-states';
import { PracticeLobby } from '@/features/combat/practice-lobby';
import { loadWordBank } from '@/server/word-bank';

export default async function CombatPracticePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const search = await searchParams;
  const raw = Array.isArray(search.length) ? search.length[0] : search.length;
  const length = Number(raw ?? '5');
  const validLength = Number.isInteger(length) && length >= 2 && length <= 35 ? length : 5;
  const bank = await loadWordBank(validLength);
  return (
    <div className="route-frame">
      <RouteHeader title="Practice COMBAT">
        <p>
          Create a public unranked match, join another player, or enter the ranked queue. Accepted
          turns are saved before the board advances.
        </p>
      </RouteHeader>
      <PracticeLobby
        length={validLength}
        candidates={bank.answers
          .slice(0, Math.max(1, Math.ceil(bank.answers.length * 0.7)))
          .map((entry) => entry.word)}
      />
    </div>
  );
}
