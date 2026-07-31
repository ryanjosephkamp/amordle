import { RouteHeader } from '@/components/route-states';
import { WordExplorer } from '@/features/words/word-explorer';

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function WordExplorerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const rawLength = Number(first(query.length) ?? '5');
  const length = Number.isInteger(rawLength) && rawLength >= 2 && rawLength <= 35 ? rawLength : 5;
  const directWord = (first(query.word) ?? '').trim().toLowerCase();
  const search = (directWord || first(query.q) || '').trim().toLowerCase();
  const sort = first(query.sort) === 'za' ? 'za' : 'az';
  const rawPage = Number(first(query.page) ?? '1');
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  return (
    <div className="route-frame">
      <RouteHeader title="Word Explorer">
        <p>
          See which words are accepted for guesses and which may also be answers. This never
          identifies the active answer in a game.
        </p>
      </RouteHeader>
      <WordExplorer
        key={length}
        length={length}
        search={search}
        sort={sort}
        page={page}
        {...(directWord ? { directWord } : {})}
      />
    </div>
  );
}
