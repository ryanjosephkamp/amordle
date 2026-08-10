import { RouteHeader } from '@/components/route-states';
import { PracticeLobby } from '@/features/combat/practice-lobby';

export default async function CombatPracticePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const search = await searchParams;
  const raw = Array.isArray(search.length) ? search.length[0] : search.length;
  const length = Number(raw ?? '5');
  const validLength = Number.isInteger(length) && length >= 2 && length <= 35 ? length : 5;
  /*
   * v8-A5. SEARCH AGAIN at the end of a ranked match arrives with `?requeue=1` and starts
   * the queue on arrival, so the button does what its label says. Everything else lands
   * here as before, on the form.
   */
  const requeue = (Array.isArray(search.requeue) ? search.requeue[0] : search.requeue) === '1';
  return (
    <div className="route-frame">
      <RouteHeader title="Practice COMBAT">
        <p>
          Create a public unranked match, join another player, or enter the ranked queue. Accepted
          turns are saved before the board advances.
        </p>
      </RouteHeader>
      <PracticeLobby length={validLength} autoQueueRanked={requeue} />
    </div>
  );
}
