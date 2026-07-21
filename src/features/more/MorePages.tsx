import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useAuth } from '../../app/auth-context';
import { usePlayerState } from '../../app/player-state-context';
import { Button, ButtonLink } from '../../components/Button';
import { Disclosure } from '../../components/Disclosure';
import { Icon } from '../../components/Icon';
import { Metric, PageHeader, RuledList, SectionHeading, StatusDot } from '../../components/Surface';
import { EconomyRepository } from '../../services/economy-repository';
import { AccountRepository } from '../../services/account-repository';
import { PublicRepository } from '../../services/public-repository';
import { levelForXp } from '../../domain/progression';
import { wordListProvider } from '../../services/word-list-provider';

type HistoryRow = readonly [string, string, string, string, string];

const historyRows: readonly HistoryRow[] = [
  ['Practice Combat · OG', 'Lost', '9 guesses · 141 pts · solved', 'Ranked · 2 players', 'Today'],
  ['Daily Solo · OG', 'Won', '3 guesses · +50 XP · +10 coins', 'Solo', 'Today'],
  ['Practice Solo · GO', 'Lost', '12 guesses · 3/5 puzzles', 'Solo', 'Today'],
  ['Daily Combat · GO', 'Draw', '220 pts · 4/5 puzzles', 'UTC · unranked', 'Yesterday'],
  ['Practice Solo · OG', 'Won', '4 guesses · +40 XP · +8 coins', 'Solo', 'Yesterday'],
] as const;

export function HistoryPage() {
  const { client, user } = useAuth();
  const repository = useMemo(() => (client ? new AccountRepository(client) : null), [client]);
  const history = useQuery({
    queryKey: ['account-history', user?.id],
    enabled: Boolean(repository && user),
    queryFn: () => repository!.listHistory(user!.id),
    staleTime: 10_000,
    retry: 1,
  });
  const [area, setArea] = useState('all');
  const [source, setSource] = useState('all');
  const [mode, setMode] = useState('all');
  const accountRows: HistoryRow[] = (history.data ?? []).map((row) => {
    const entry =
      typeof row.entry === 'object' && row.entry !== null && !Array.isArray(row.entry)
        ? (row.entry as Record<string, unknown>)
        : {};
    const mode = String(entry.mode ?? 'OG').toUpperCase();
    const scope = String(entry.scope ?? 'completed');
    const areaName = String(entry.area ?? 'Solo');
    const result = String(entry.result ?? entry.status ?? 'Completed');
    const details = String(entry.summary ?? `${mode} result`);
    return [
      `${scope} ${areaName} · ${mode}`,
      result,
      details,
      String(entry.context ?? areaName),
      new Date(row.completed_at).toLocaleDateString(),
    ];
  });
  const rows = user ? accountRows : import.meta.env.DEV ? [...historyRows] : [];
  const visible = rows.filter(
    (row) =>
      (area === 'all' || row[0].toLowerCase().includes(area)) &&
      (source === 'all' || row[0].toLowerCase().includes(source)) &&
      (mode === 'all' || row[0].toLowerCase().includes(mode)),
  );
  return (
    <div className="page">
      <PageHeader
        title="History"
        eyebrow="Record"
        description="Completed Solo and COMBAT results, newest first."
      />
      <div className="summary-line">
        <strong>{visible.length} results</strong>
        <span>{rows.filter((row) => row[0].toLowerCase().includes('solo')).length} Solo</span>
        <span>{rows.filter((row) => row[0].toLowerCase().includes('combat')).length} Combat</span>
        <span>{rows.filter((row) => row[1].toLowerCase() === 'won').length} won</span>
        <span>{rows.filter((row) => row[1].toLowerCase() === 'lost').length} lost</span>
      </div>
      <div className="filter-ledger">
        <fieldset>
          <legend>Player area</legend>
          {['all', 'solo', 'combat'].map((value) => (
            <button
              type="button"
              className={area === value ? 'is-selected' : ''}
              onClick={() => setArea(value)}
              key={value}
            >
              {value}
            </button>
          ))}
        </fieldset>
        <fieldset>
          <legend>Source</legend>
          {['all', 'daily', 'practice'].map((value) => (
            <button
              type="button"
              className={source === value ? 'is-selected' : ''}
              onClick={() => setSource(value)}
              key={value}
            >
              {value}
            </button>
          ))}
        </fieldset>
        <fieldset>
          <legend>Mode</legend>
          {['all', 'og', 'go'].map((value) => (
            <button
              type="button"
              className={mode === value ? 'is-selected' : ''}
              onClick={() => setMode(value)}
              key={value}
            >
              {value}
            </button>
          ))}
        </fieldset>
      </div>
      <div className="history-ledger" role="table" aria-label="Completed games">
        <div className="history-row history-row--head" role="row">
          <span>Game</span>
          <span>Result</span>
          <span>Details</span>
          <span>Context</span>
          <span>Completed</span>
        </div>
        {visible.map((row, index) => (
          <div className="history-row" role="row" key={row[0]}>
            <strong>{row[0]}</strong>
            <span className={`result-${row[1].toLowerCase()}`}>{row[1]}</span>
            <span>{row[2]}</span>
            <span>{row[3]}</span>
            <time>{row[4] || (index < 3 ? 'Today' : 'Yesterday')}</time>
          </div>
        ))}
        {history.isPending && user ? <p role="status">Loading account-scoped history…</p> : null}
        {!history.isPending && visible.length === 0 ? (
          <p className="empty-state">No matching completed games.</p>
        ) : null}
      </div>
    </div>
  );
}

export function StatsPage() {
  const { progression } = usePlayerState();
  const level = levelForXp(progression.xp);
  return (
    <div className="page">
      <PageHeader
        title="My Stats"
        eyebrow="Private to you"
        description="Local guest snapshot. Sign in to hydrate an account-scoped view."
        actions={<ButtonLink to="/leaderboards">Public Leaderboard</ButtonLink>}
      />
      <div className="stats-grid">
        <section>
          <SectionHeading title="Solo performance" />
          <div className="metric-row">
            <Metric value="47" label="Games" tone="green" />
            <Metric value="31" label="Wins" tone="green" />
            <Metric value="66%" label="Win rate" tone="green" />
            <Metric value="47" label="History rows" />
          </div>
          <RuledList>
            {[
              ['OG Daily', '18', '14', '78%'],
              ['OG Practice', '14', '10', '71%'],
              ['GO Daily', '8', '5', '63%'],
              ['GO Practice', '7', '2', '29%'],
            ].map((row) => (
              <div className="stat-row" key={row[0]}>
                <strong>{row[0]}</strong>
                <span>{row[1]} played</span>
                <span>{row[2]} wins</span>
                <span>{row[3]}</span>
              </div>
            ))}
          </RuledList>
        </section>
        <section>
          <SectionHeading title="Progression" />
          <div className="metric-row">
            <Metric value={String(level.level)} label="Level" tone="green" />
            <Metric value={String(progression.coins)} label="Coins" tone="green" />
          </div>
          <SectionHeading title="Local multiplayer ratings" />
          <div className="rating-row">
            <strong>
              1535<small>Platinum</small>
            </strong>
            <span>24 rated</span>
            <span>15–7–2</span>
            <span className="result-lost">−13 last</span>
          </div>
          <div className="rating-row">
            <strong>
              1324<small>Gold</small>
            </strong>
            <span>12 rated</span>
            <span>7–4–1</span>
            <span className="result-won">+9 last</span>
          </div>
        </section>
      </div>
      <div className="privacy-band">
        <Icon name="lock" /> Points decide matches. Elo changes only after eligible ranked
        settlement.
      </div>
    </div>
  );
}

export function LeaderboardsPage() {
  const [bucket, setBucket] = useState('Practice OG');
  const { client, user } = useAuth();
  const repository = useMemo(() => (client ? new PublicRepository(client) : null), [client]);
  const bucketKey =
    {
      'Practice OG': 'multiplayer:og',
      'Practice GO': 'multiplayer:go',
      'Timed OG': 'multiplayer:og',
      'Daily OG': 'multiplayer:og:daily:v1',
      'Daily GO': 'multiplayer:go:daily:v1',
    }[bucket] ?? 'multiplayer:og';
  const leaderboard = useQuery({
    queryKey: ['public-leaderboard', bucketKey],
    enabled: Boolean(repository && user),
    queryFn: () => repository!.getLeaderboard(bucketKey),
    staleTime: 30_000,
    retry: 1,
  });
  const rows = leaderboard.data ?? [];
  return (
    <div className="page">
      <PageHeader
        title="Leaderboards"
        eyebrow="Public ranked"
        description="Only opted-in public profiles appear."
      />
      <div className="segmented">
        {['Practice OG', 'Practice GO', 'Timed OG', 'Daily OG', 'Daily GO'].map((value) => (
          <button
            className={bucket === value ? 'is-selected' : ''}
            type="button"
            key={value}
            onClick={() => setBucket(value)}
          >
            {value}
          </button>
        ))}
      </div>
      <RuledList label={`${bucket} ranking`}>
        {rows.map((row) => (
          <div className="leader-row" key={row.public_profile_id}>
            <span>{row.rank}</span>
            <span className="avatar">{row.display_name.slice(0, 2).toUpperCase()}</span>
            <div>
              <strong>{row.display_name}</strong>
              <small>{row.provisional ? 'Provisional' : 'Established'}</small>
            </div>
            <strong>{row.rating}</strong>
            <ButtonLink to={`/players/${row.public_profile_id}`}>View</ButtonLink>
          </div>
        ))}
        {leaderboard.isPending ? <p role="status">Loading public ranking…</p> : null}
        {!user ? (
          <p className="empty-state">Sign in to view the privacy-filtered ranked projection.</p>
        ) : null}
        {!leaderboard.isPending && user && rows.length === 0 ? (
          <p className="empty-state">
            No opted-in public profiles currently qualify for this bucket
            {bucket === 'Timed OG'
              ? '; timed ratings remain separate from the public untimed table'
              : ''}
            .
          </p>
        ) : null}
      </RuledList>
    </div>
  );
}

export function MarketplacePage() {
  const { client, user } = useAuth();
  const repository = client ? new EconomyRepository(client) : null;
  const economy = useQuery({
    queryKey: ['economy', user?.id],
    enabled: Boolean(repository && user),
    queryFn: () => repository!.get(),
    staleTime: 5_000,
    retry: 1,
  });
  const [guestCoins, setGuestCoins] = useState(import.meta.env.DEV ? 42 : 0);
  const [guestReveal, setGuestReveal] = useState(import.meta.env.DEV ? 2 : 0);
  const [guestRemove, setGuestRemove] = useState(import.meta.env.DEV ? 1 : 0);
  const coins = economy.data?.coins ?? guestCoins;
  const reveal = economy.data?.revealOneLetter ?? guestReveal;
  const remove = economy.data?.removeIncorrectLetters ?? guestRemove;
  const [message, setMessage] = useState(
    'Purchases add inventory and never activate automatically.',
  );
  const buy = async (kind: 'reveal' | 'remove') => {
    if (!user) {
      setMessage('Sign in before purchasing account-owned inventory.');
      return;
    }
    const cost = kind === 'reveal' ? 25 : 40;
    if (coins < cost) {
      setMessage(`${cost - coins} more coins required.`);
      return;
    }
    if (repository && user) {
      try {
        await repository.purchase(
          kind === 'reveal' ? 'revealOneLetter' : 'removeIncorrectLetters',
          crypto.randomUUID(),
        );
        await economy.refetch();
        setMessage(
          `${kind === 'reveal' ? 'Reveal One Letter' : 'Remove Incorrect Letters'} added by server authority.`,
        );
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : 'Purchase failed without changing inventory.',
        );
      }
      return;
    }
    setGuestCoins((v) => v - cost);
    if (kind === 'reveal') setGuestReveal((v) => v + 1);
    else setGuestRemove((v) => v + 1);
    setMessage(
      `${kind === 'reveal' ? 'Reveal One Letter' : 'Remove Incorrect Letters'} added to guest preview inventory.`,
    );
  };
  return (
    <div className="page">
      <PageHeader
        title="Marketplace"
        eyebrow="Progression"
        description="Buy to inventory · activate only in Solo Practice"
        actions={<Metric value={coins} label="Coins" tone="amber" />}
      />
      <div className="market-grid">
        <section>
          <Icon name="info" />
          <h2>Reveal One Letter</h2>
          <StatusDot>Owned {reveal}</StatusDot>
          <p>Reveals one unresolved position in the active Solo Practice puzzle.</p>
          <div className="mini-board">
            <i />
            <i />
            <i className="locked">
              <Icon name="lock" />
            </i>
            <i />
            <i />
          </div>
          <Button onClick={() => void buy('reveal')} tone="primary" disabled={!user || coins < 25}>
            Buy 1 · 25 coins
          </Button>
        </section>
        <section>
          <Icon name="backspace" />
          <h2>Remove Incorrect Letters</h2>
          <StatusDot>Owned {remove}</StatusDot>
          <p>Disables up to five eligible answer-absent keyboard letters.</p>
          <div className="mini-keys">Q W E R T Y U I O P</div>
          <Button onClick={() => void buy('remove')} disabled={!user || coins < 40}>
            Buy 1 · 40 coins
          </Button>
        </section>
      </div>
      <p className="success-banner" role="status">
        {message}
      </p>
      <div className="button-row">
        <ButtonLink to="/play/practice/og" tone="primary">
          Open Solo Practice
        </ButtonLink>
        <ButtonLink to="/stats">View Stats</ButtonLink>
      </div>
    </div>
  );
}

export function ProfilePage({ publicView = false }: { publicView?: boolean }) {
  const { publicProfileId } = useParams();
  const { client, user } = useAuth();
  const repository = useMemo(() => (client ? new PublicRepository(client) : null), [client]);
  const profile = useQuery({
    queryKey: [publicView ? 'public-profile' : 'my-public-profile', publicProfileId, user?.id],
    enabled: Boolean(repository && (publicView ? publicProfileId : user)),
    queryFn: () =>
      publicView ? repository!.getProfile(publicProfileId ?? '') : repository!.getMyProfile(),
    staleTime: 15_000,
    retry: 1,
  });
  const raw =
    typeof profile.data === 'object' && profile.data !== null
      ? (profile.data as Record<string, unknown>)
      : {};
  const displayName = String(
    raw.displayName ?? raw.display_name ?? (import.meta.env.DEV ? 'Dennis Sellers' : 'Player'),
  );
  const bio = String(raw.bio ?? (import.meta.env.DEV ? 'Five letters. No excuses.' : ''));
  const [saveStatus, setSaveStatus] = useState('');
  if (publicView && !profile.isPending && !profile.data) {
    return (
      <div className="page page--narrow">
        <PageHeader
          title="Player unavailable"
          eyebrow="Public player card"
          description="No approved public projection exists for this identifier."
        />
        <ButtonLink to="/leaderboards">Return to Leaderboards</ButtonLink>
      </div>
    );
  }
  return (
    <div className="page">
      <PageHeader
        title={publicView ? 'Player' : 'Profile'}
        eyebrow={publicView ? 'Public player card' : 'Current player'}
        description={
          publicView
            ? 'Only approved public identity fields are shown.'
            : 'Manage the identity other players see.'
        }
      />
      <section className="profile-card">
        <span className="avatar avatar--xl">{displayName.slice(0, 2).toUpperCase()}</span>
        <div>
          <h2>{profile.isPending ? 'Loading approved profile…' : displayName}</h2>
          <p>{bio || 'No public bio.'}</p>
          <StatusDot>
            {publicView ? 'Public projection' : user ? 'Account-scoped editor' : 'Guest preview'}
          </StatusDot>
        </div>
      </section>
      {publicView ? (
        <div className="two-up">
          <section className="lane-panel">
            <h2>Ranked Practice</h2>
            <Metric
              value="Private"
              label="Ratings appear on eligible leaderboard rows"
              tone="green"
            />
          </section>
          <section className="lane-panel">
            <h2>Eligible action</h2>
            <ButtonLink to="/combat/practice">Request private Practice match</ButtonLink>
          </section>
        </div>
      ) : (
        <form
          className="profile-form"
          onSubmit={(event) => {
            event.preventDefault();
            setSaveStatus('');
            if (!repository || !user) {
              setSaveStatus('Sign in before saving an account-owned public projection.');
              return;
            }
            const form = new FormData(event.currentTarget);
            void repository
              .updateMyProfile({
                displayName: String(form.get('displayName') ?? ''),
                visibility: form.get('visibility') === 'public' ? 'public' : 'private',
                accentColor: String(form.get('accent') ?? ''),
                avatarUrl: String(form.get('avatarUrl') ?? ''),
                bio: String(form.get('bio') ?? ''),
              })
              .then(() => profile.refetch())
              .then(() => setSaveStatus('Player profile saved by account authority.'))
              .catch((error: unknown) =>
                setSaveStatus(error instanceof Error ? error.message : 'Profile save failed.'),
              );
          }}
        >
          <label>
            Player name
            <input
              name="displayName"
              maxLength={50}
              defaultValue={displayName === 'Player' ? '' : displayName}
              required
            />
          </label>
          <label>
            Public visibility
            <select name="visibility" defaultValue={String(raw.visibility ?? 'private')}>
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
          </label>
          <fieldset>
            <legend>Accent color</legend>
            {['Ice', 'Aurora', 'Cyan', 'Violet', 'Rose', 'Amber'].map((value) => (
              <label className="accent-choice" key={value}>
                <input
                  type="radio"
                  name="accent"
                  value={value.toLowerCase()}
                  defaultChecked={value === 'Aurora'}
                />
                <span>{value}</span>
              </label>
            ))}
          </fieldset>
          <label>
            Public avatar URL · optional
            <input
              name="avatarUrl"
              type="url"
              maxLength={2048}
              placeholder="https://…"
              defaultValue={String(raw.avatarUrl ?? raw.avatar_url ?? '')}
            />
          </label>
          <label>
            Public bio
            <textarea name="bio" maxLength={160} defaultValue={bio} />
          </label>
          <Button type="submit" tone="primary">
            Save player profile
          </Button>
          <Button type="reset" onClick={() => setSaveStatus('')}>
            Discard changes
          </Button>
          {saveStatus ? <p role="status">{saveStatus}</p> : null}
        </form>
      )}
      <p className="privacy-band">
        <Icon name="lock" /> Email, Solo stats, progress, settings, sessions, and raw IDs stay
        private.
      </p>
    </div>
  );
}

const curatedDefinitions: Readonly<Record<string, string>> = {
  crane: 'A large bird with long legs and neck.',
  crank: 'A bent part of an axle or shaft.',
  crash: 'To collide forcefully.',
  crate: 'A large shipping container.',
};

export function WordExplorerPage({ definitionOnly = false }: { definitionOnly?: boolean }) {
  const [query, setQuery] = useState(definitionOnly ? 'crane' : '');
  const [selected, setSelected] = useState('crane');
  const normalizedQuery = query
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  const length =
    normalizedQuery.length >= 2 && normalizedQuery.length <= 35 ? normalizedQuery.length : 5;
  const words = useQuery({
    queryKey: ['word-explorer', length],
    queryFn: ({ signal }) => wordListProvider.load(length, signal),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });
  const filtered = (words.data?.validGuesses ?? [])
    .filter((word) => !normalizedQuery || word.includes(normalizedQuery))
    .slice(0, definitionOnly ? 10 : 50);
  const selectedWord = filtered.includes(selected)
    ? selected
    : (filtered[0] ?? (normalizedQuery || 'crane'));
  const answers = words.data?.answers;
  const isAnswer = Boolean(answers?.expert.includes(selectedWord));
  const difficulty = answers?.casual.includes(selectedWord)
    ? 'Casual'
    : answers?.standard.includes(selectedWord)
      ? 'Standard'
      : isAnswer
        ? 'Expert'
        : 'Valid guess only';
  const definition = curatedDefinitions[selectedWord];
  return (
    <div className="page">
      <PageHeader
        title={definitionOnly ? 'Definitions' : 'Word Explorer'}
        eyebrow="Word data"
        description="Explore the sanctioned game lexicon without exposing active answers."
      />
      <div className="explorer-layout">
        <section>
          <label className="search-control">
            <Icon name="search" />
            <span className="sr-only">Search words</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search words"
            />
          </label>
          <p>
            {words.isPending ? 'Loading' : filtered.length} visible · {length}-letter bundled data
          </p>
          <RuledList>
            {filtered.map((word) => (
              <button
                type="button"
                key={word}
                className={`word-row ${selectedWord === word ? 'is-selected' : ''}`}
                onClick={() => setSelected(word)}
              >
                <strong>{word.toUpperCase()}</strong>
                <span>
                  {answers?.expert.includes(word) ? 'Answer & valid guess' : 'Valid guess'}
                </span>
                <small>
                  {answers?.casual.includes(word)
                    ? 'Casual'
                    : answers?.standard.includes(word)
                      ? 'Standard'
                      : 'Expert'}
                </small>
              </button>
            ))}
            {!words.isPending && filtered.length === 0 ? (
              <p className="empty-state">No exact-length word matched.</p>
            ) : null}
          </RuledList>
        </section>
        <section className="definition-panel">
          <h2>{selectedWord.toUpperCase()}</h2>
          <p>
            {selectedWord.length} letters · {isAnswer ? 'Answer & valid guess' : 'Valid guess'} ·{' '}
            {difficulty}
          </p>
          <hr />
          <h3>Definitions</h3>
          <StatusDot tone="ice">
            Source: {definition ? 'bundled curated metadata' : 'fallback required'}
          </StatusDot>
          {definition ? (
            <p className="definition-copy">{definition}</p>
          ) : (
            <p className="definition-copy">
              No bundled definition is available. Use the explicit search fallback below.
            </p>
          )}
          <Button onClick={() => void navigator.clipboard?.writeText(selectedWord)}>
            Copy word
          </Button>
          <a
            className="button button--secondary"
            href={`https://www.google.com/search?q=define+${encodeURIComponent(selectedWord)}`}
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="external" /> Search Google for “{selectedWord}”
          </a>
        </section>
      </div>
      <p className="privacy-band">
        <Icon name="lock" /> Active answers are never exposed.
      </p>
    </div>
  );
}

export function SettingsPage() {
  const { client, user } = useAuth();
  return (
    <SettingsForm
      key={user?.id ?? 'guest'}
      client={client}
      {...(user ? { userId: user.id } : {})}
    />
  );
}

function SettingsForm({
  client,
  userId,
}: {
  client: ReturnType<typeof useAuth>['client'];
  userId?: string;
}) {
  const storageKey = `amordle:settings:${userId ? `account:${encodeURIComponent(userId)}` : 'guest'}`;
  const initial = useMemo(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Record<
        string,
        unknown
      >;
      return parsed;
    } catch {
      return {};
    }
  }, [storageKey]);
  const [difficulty, setDifficulty] = useState(String(initial.difficulty ?? 'Expert'));
  const [chain, setChain] = useState(Number(initial.chain ?? 5));
  const [hard, setHard] = useState(Boolean(initial.hard));
  const [sound, setSound] = useState(Boolean(initial.sound));
  const [motion, setMotion] = useState(Boolean(initial.motion));
  const [saveStatus, setSaveStatus] = useState('');
  const save = async () => {
    const settings = { difficulty, chain, hard, sound, motion };
    try {
      localStorage.setItem(storageKey, JSON.stringify(settings));
      if (client && userId) {
        await new AccountRepository(client).saveSettings(
          userId,
          settings,
          new Date().toISOString(),
        );
      }
      setSaveStatus(
        userId
          ? 'Settings saved locally and to the account projection.'
          : 'Guest settings saved on this device.',
      );
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : 'Settings could not be saved.');
    }
  };
  return (
    <div className="page">
      <PageHeader
        title="Settings"
        eyebrow="Player system"
        description="Customize your defaults, feedback, and account behavior."
      />
      <div className="settings-layout">
        <nav className="settings-index" aria-label="Settings categories">
          <a href="#gameplay">Gameplay</a>
          <a href="#sensory">Sensory</a>
          <a href="#alerts">Alerts</a>
          <a href="#account">Account</a>
        </nav>
        <div>
          <section id="gameplay">
            <SectionHeading title="Gameplay defaults" />
            <SettingGroup
              label="Default difficulty"
              description="Difficulty changes answer selection, never allowed guesses."
            >
              <div className="segmented">
                {['Casual', 'Standard', 'Expert'].map((value) => (
                  <button
                    type="button"
                    className={difficulty === value ? 'is-selected' : ''}
                    key={value}
                    onClick={() => setDifficulty(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </SettingGroup>
            <SettingGroup
              label="GO chain"
              description="Number of puzzles in each new Practice chain."
            >
              <div className="segmented">
                {[5, 7, 10].map((value) => (
                  <button
                    type="button"
                    className={chain === value ? 'is-selected' : ''}
                    key={value}
                    onClick={() => setChain(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </SettingGroup>
            <SettingGroup
              label="Hard Mode default"
              description="Supported modes only · changes lock after the first submitted guess."
            >
              <label className="switch">
                <input type="checkbox" checked={hard} onChange={(e) => setHard(e.target.checked)} />
                <span>{hard ? 'On' : 'Off'}</span>
              </label>
            </SettingGroup>
          </section>
          <section id="sensory">
            <SectionHeading title="Appearance & motion" />
            <SettingGroup label="Sound" description="Sounds begin only after a user gesture.">
              <label className="switch">
                <input
                  type="checkbox"
                  checked={sound}
                  onChange={(e) => setSound(e.target.checked)}
                />
                <span>{sound ? 'On' : 'Off'}</span>
              </label>
            </SettingGroup>
            <SettingGroup
              label="Reduce interface motion"
              description="Decorative motion is replaced with static state."
            >
              <label className="switch">
                <input
                  type="checkbox"
                  checked={motion}
                  onChange={(e) => setMotion(e.target.checked)}
                />
                <span>{motion ? 'On' : 'System preference respected'}</span>
              </label>
            </SettingGroup>
          </section>
          <Disclosure label="Alerts" meta="In-app · important sounds">
            <p>
              Notification sounds, browser permission, and private-request events remain
              independently controlled.
            </p>
          </Disclosure>
          <Disclosure label="Account" meta="Guest · local">
            <p>
              Sync, export, reset, and profile controls stay account-scoped and require confirmation
              where destructive.
            </p>
          </Disclosure>
          <div className="button-row">
            <Button tone="primary" onClick={() => void save()}>
              Save settings
            </Button>
            {saveStatus ? <p role="status">{saveStatus}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
function SettingGroup({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="setting-group">
      <div>
        <h3>{label}</h3>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}

export function HelpPage() {
  const [step, setStep] = useState(2);
  const steps = ['Welcome', 'Choose a path', 'Read the board', 'Play & score', 'Next steps'];
  return (
    <div className="page">
      <PageHeader title="Help & Tutorials" eyebrow="Player guide" />
      <ol className="tutorial-steps">
        {steps.map((label, index) => (
          <li
            className={index === step ? 'is-active' : index < step ? 'is-complete' : ''}
            key={label}
          >
            <button type="button" onClick={() => setStep(index)}>
              <span>{index + 1}</span>
              {label}
            </button>
          </li>
        ))}
      </ol>
      <section className="lesson">
        <h2>{steps[step]}</h2>
        {step === 2 ? (
          <>
            <p>Each guess provides clues. Tile and keyboard states always include text meaning.</p>
            <div className="lesson-tile">
              <span className="tile tile--correct">R</span>
              <div>
                <strong>Correct</strong>
                <p>Right letter, right position</p>
              </div>
            </div>
            <div className="lesson-tile">
              <span className="tile tile--present">A</span>
              <div>
                <strong>Present</strong>
                <p>In the word, different position</p>
              </div>
            </div>
            <div className="lesson-tile">
              <span className="tile tile--absent">E</span>
              <div>
                <strong>Absent</strong>
                <p>Not in the word</p>
              </div>
            </div>
          </>
        ) : (
          <p>
            {step === 0
              ? 'Learn the two formats and choose a route.'
              : step === 1
                ? 'Play Solo locally or enter authenticated COMBAT.'
                : step === 3
                  ? 'Submit valid guesses, earn evidence, and read the exact result.'
                  : 'Continue into Daily, Practice, History, and Stats.'}
          </p>
        )}
      </section>
      <div className="button-row tutorial-actions">
        <Button disabled={step === 0} onClick={() => setStep((v) => Math.max(0, v - 1))}>
          ← Back
        </Button>
        <Button
          tone="primary"
          disabled={step === 4}
          onClick={() => setStep((v) => Math.min(4, v + 1))}
        >
          Next →
        </Button>
        <ButtonLink to="/">Skip / Exit</ButtonLink>
      </div>
      <Disclosure label="Quick reference" meta="OG, GO, Daily, Practice">
        <p>
          OG is one word. GO is a linked chain. Daily is deterministic; Practice is configurable.
        </p>
      </Disclosure>
      <Disclosure label="More help" meta="Feedback, About">
        <div className="button-row">
          <ButtonLink to="/feedback">Feedback</ButtonLink>
          <ButtonLink to="/about">About</ButtonLink>
        </div>
      </Disclosure>
    </div>
  );
}

export function FeedbackPage() {
  const [kind, setKind] = useState('Bug');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState(false);
  const body = `## ${kind}\n\n${message.trim()}\n\nNo private account or game state was attached.`;
  return (
    <div className="page page--narrow">
      <PageHeader
        title="Feedback"
        eyebrow="Privacy-safe issue handoff"
        description="Review exactly what will leave the browser. Nothing submits silently."
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPreview(true);
        }}
        className="feedback-form"
      >
        <label>
          Feedback type
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option>Bug</option>
            <option>Feature request</option>
            <option>Accessibility</option>
          </select>
        </label>
        <label>
          What happened?
          <textarea
            required
            minLength={10}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe the issue without personal information."
          />
        </label>
        <Button tone="primary" type="submit">
          Review handoff
        </Button>
      </form>
      {preview ? (
        <section className="issue-preview">
          <h2>Issue preview</h2>
          <pre>{body}</pre>
          <Button onClick={() => void navigator.clipboard?.writeText(body)}>Copy issue text</Button>
          <a
            className="button button--secondary"
            target="_blank"
            rel="noreferrer"
            href={`https://github.com/ryanjosephkamp/amordle/issues/new?body=${encodeURIComponent(body)}`}
          >
            Open GitHub issue <Icon name="external" />
          </a>
        </section>
      ) : null}
    </div>
  );
}

export function AboutPage() {
  return (
    <div className="page page--narrow">
      <PageHeader
        title="About amordle"
        eyebrow="Product notes"
        description="A restrained word-game system for Solo and shared competitive play."
      />
      <section className="prose">
        <h2>Two ways to play</h2>
        <p>
          OG is one word on one board. GO carries solved-word evidence through a linked sequence.
        </p>
        <h2>Private by design</h2>
        <p>
          Guest progress is local. Public profiles are opt-in projections. Daily answers, account
          data, private matches, and developer operations remain protected by server authority.
        </p>
        <h2>Credits</h2>
        <p>
          Word data is curated from the project’s public English Openlist source and validated
          before use. The application uses self-hosted open fonts and original atmospheric artwork.
        </p>
        <h2>Release</h2>
        <p>Greenfield private release candidate · production promotion pending separate review.</p>
      </section>
    </div>
  );
}

export function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { service, status: authStatus, user } = useAuth();
  const callback = location.pathname.endsWith('/callback');
  const passwordUpdate = location.pathname.endsWith('/recovery');
  const [mode, setMode] = useState<'signin' | 'signup' | 'recover'>(() =>
    new URLSearchParams(location.search).get('recovery') === '1' ? 'recover' : 'signin',
  );
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const title = callback
    ? 'Account callback'
    : passwordUpdate
      ? 'Choose a new password'
      : mode === 'signin'
        ? 'Sign in'
        : mode === 'signup'
          ? 'Create account'
          : 'Reset password';

  if (callback) {
    const callbackError = new URLSearchParams(location.search).get('error_description');
    return (
      <div className="page page--narrow">
        <PageHeader title={title} eyebrow="Account" description="Verifying the returned session." />
        {callbackError ? <p role="alert">{callbackError}</p> : null}
        {authStatus === 'loading' ? <p role="status">Checking the signed-in session…</p> : null}
        {user ? (
          <div className="success-banner" role="status">
            Session verified. Account-owned data will use its isolated namespace.
          </div>
        ) : null}
        <Button tone="primary" onClick={() => navigate(user ? '/' : '/auth', { replace: true })}>
          {user ? 'Continue to Amordle' : 'Return to sign in'}
        </Button>
      </div>
    );
  }

  return (
    <div className="page page--narrow">
      <PageHeader
        title={title}
        eyebrow="Account"
        description="Guest Solo remains available without signing in."
      />
      {!passwordUpdate ? (
        <div className="segmented">
          <button
            type="button"
            className={mode === 'signin' ? 'is-selected' : ''}
            onClick={() => setMode('signin')}
          >
            Sign in
          </button>
          <button
            type="button"
            className={mode === 'signup' ? 'is-selected' : ''}
            onClick={() => setMode('signup')}
          >
            Create account
          </button>
        </div>
      ) : null}
      <form
        className="auth-form"
        onSubmit={(event) => {
          event.preventDefault();
          setError('');
          setStatus('');
          if (!service) {
            setError(
              'Account service is unavailable in this environment. Guest Solo remains available.',
            );
            return;
          }
          const form = new FormData(event.currentTarget);
          const email = String(form.get('email') ?? '');
          const password = String(form.get('password') ?? '');
          setBusy(true);
          const operation = passwordUpdate
            ? service.updatePassword(password).then(() => {
                setStatus('Password updated. Your account session remains isolated and active.');
              })
            : mode === 'signin'
              ? service.signIn(email, password).then(() => navigate('/', { replace: true }))
              : mode === 'signup'
                ? service.signUp(email, password).then((session) => {
                    setStatus(
                      session
                        ? 'Account created and signed in.'
                        : 'Account created. Follow the confirmation instructions sent to your email.',
                    );
                  })
                : service.requestPasswordReset(email).then(() => {
                    setStatus('If that account exists, password-recovery instructions were sent.');
                  });
          void operation
            .catch((reason: unknown) => {
              setError(reason instanceof Error ? reason.message : 'The account request failed.');
            })
            .finally(() => setBusy(false));
        }}
      >
        {!passwordUpdate ? (
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
        ) : null}
        {mode !== 'recover' || passwordUpdate ? (
          <label>
            {passwordUpdate ? 'New password' : 'Password'}
            <input
              name="password"
              type="password"
              autoComplete={
                mode === 'signup' || passwordUpdate ? 'new-password' : 'current-password'
              }
              minLength={8}
              required
            />
          </label>
        ) : null}
        <Button type="submit" tone="primary" disabled={busy}>
          {busy
            ? 'Working…'
            : passwordUpdate
              ? 'Update password'
              : mode === 'signin'
                ? 'Sign in'
                : mode === 'signup'
                  ? 'Create account'
                  : 'Send reset link'}
        </Button>
        {mode === 'signin' && !passwordUpdate ? (
          <Button type="button" tone="quiet" onClick={() => setMode('recover')}>
            Forgot password?
          </Button>
        ) : null}
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {status ? (
        <p className="success-banner" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
}
