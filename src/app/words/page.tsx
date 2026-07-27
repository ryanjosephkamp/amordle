import Link from 'next/link';
import { RouteHeader } from '@/components/route-states';
import { WordResults } from '@/features/words/word-results';
import { loadWordBank } from '@/server/word-bank';

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
  const search = (first(query.word) ?? first(query.q) ?? '').trim().toLowerCase();
  const sort = first(query.sort) === 'za' ? 'za' : 'az';
  const rawPage = Number(first(query.page) ?? '1');
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const bank = await loadWordBank(length);
  const answerSet = new Set(bank.answers.map((entry) => entry.word));
  const all = [...new Set(bank.validGuesses)]
    .filter((word) => !search || word.includes(search))
    .sort((left, right) => (sort === 'az' ? left.localeCompare(right) : right.localeCompare(left)));
  const pageSize = 100;
  const pages = Math.max(1, Math.ceil(all.length / pageSize));
  const safePage = Math.min(page, pages);
  const words = all.slice((safePage - 1) * pageSize, safePage * pageSize);
  const params = new URLSearchParams({
    length: String(length),
    q: search,
    sort,
  });

  return (
    <div className="route-frame">
      <RouteHeader title="Word Explorer">
        <p>
          Browse one sanctioned word length at a time. Eligibility here never identifies the active
          answer in a game.
        </p>
      </RouteHeader>
      <form className="explorer-controls">
        <label>
          Length
          <input name="length" type="number" min={2} max={35} defaultValue={length} />
        </label>
        <label>
          Search
          <input name="q" defaultValue={search} />
        </label>
        <label>
          Sort
          <select name="sort" defaultValue={sort}>
            <option value="az">A–Z</option>
            <option value="za">Z–A</option>
          </select>
        </label>
        <button className="primary">Apply</button>
      </form>
      <p className="prose mono">
        Length {length} · catalog {bank.revision} · {bank.answers.length} answer-eligible ·{' '}
        {bank.validGuesses.length} sanctioned guesses
      </p>
      <WordResults
        words={words}
        answerEligible={words.filter((word) => answerSet.has(word))}
        total={all.length}
        page={safePage}
        pages={pages}
      />
      <nav className="pagination" aria-label="Word pages">
        <Link
          className="button"
          aria-disabled={safePage === 1}
          href={safePage === 1 ? '#' : `?${params.toString()}&page=${safePage - 1}`}
        >
          Previous
        </Link>
        <Link
          className="button"
          aria-disabled={safePage === pages}
          href={safePage === pages ? '#' : `?${params.toString()}&page=${safePage + 1}`}
        >
          Next
        </Link>
      </nav>
    </div>
  );
}
