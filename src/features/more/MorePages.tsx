import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useAuth } from '../../app/auth-context';
import { usePlayerState } from '../../app/player-state-context';
import { Button, ButtonLink } from '../../components/Button';
import { Disclosure } from '../../components/Disclosure';
import { Icon } from '../../components/Icon';
import { Metric, PageHeader, RuledList, SectionHeading, StatusDot } from '../../components/Surface';
import { AccountRepository } from '../../services/account-repository';
import { PublicRepository } from '../../services/public-repository';
import { PrivateRequestRepository } from '../../services/private-request-repository';
import { levelForXp } from '../../domain/progression';
import { ownerStorageSegment, type IdentityScope } from '../../persistence/local-repository';
import { writeSoundEnabled } from '../../services/sound-controller';
import {
  loadPlayerSettings,
  mergePlayerSettings,
  updatePlayerSettings,
} from '../../services/settings-repository';
import { wordListProvider } from '../../services/word-list-provider';
import type { Json } from '../../types/database';
import type { OwnedPublicProfileProjection } from '../../types/services';
import {
  readLocalSoloProjections,
  type LocalSoloProjection,
} from '../supporting/local-solo-projections';

type HistoryProjection = {
  readonly id: string;
  readonly game: string;
  readonly result: string;
  readonly details: string;
  readonly context: string;
  readonly completedAt: string;
  readonly area: string;
  readonly source: string;
  readonly mode: string;
};

const profileAccents = ['ice', 'aurora', 'cyan', 'violet', 'rose', 'amber'] as const;

type ProfileDraft = {
  readonly displayName: string;
  readonly visibility: 'private' | 'public';
  readonly accentColor: (typeof profileAccents)[number];
  readonly avatarUrl: string;
  readonly bio: string;
};

const emptyProfileDraft: ProfileDraft = {
  displayName: '',
  visibility: 'private',
  accentColor: 'aurora',
  avatarUrl: '',
  bio: '',
};

function profileDraftFromProjection(profile: OwnedPublicProfileProjection): ProfileDraft {
  return {
    displayName: profile.displayName ?? '',
    visibility: profile.visibility,
    accentColor: profileAccent(profile.accentColor),
    avatarUrl: profile.avatarUrl ?? '',
    bio: profile.bio ?? '',
  };
}

function profileAccent(value: unknown): (typeof profileAccents)[number] {
  return typeof value === 'string' &&
    profileAccents.includes(value as (typeof profileAccents)[number])
    ? (value as (typeof profileAccents)[number])
    : 'aurora';
}

function PublicAvatar({
  displayName,
  accent,
  avatarUrl,
  size = 'default',
}: {
  displayName: string;
  accent: (typeof profileAccents)[number];
  avatarUrl?: string | null;
  size?: 'default' | 'xl';
}) {
  const initials =
    displayName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || '—';
  return (
    <span
      className={`avatar public-avatar${size === 'xl' ? ' avatar--xl' : ''}`}
      data-accent={accent}
      aria-hidden="true"
    >
      <span className="public-avatar__fallback">{initials}</span>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(event) => event.currentTarget.remove()}
        />
      ) : null}
    </span>
  );
}

type AccountHistoryRow = Awaited<ReturnType<AccountRepository['listHistory']>>[number];

function accountHistoryProjection(row: AccountHistoryRow): HistoryProjection {
  const entry =
    typeof row.entry === 'object' && row.entry !== null && !Array.isArray(row.entry)
      ? (row.entry as Record<string, unknown>)
      : {};
  const mode = String(entry.mode ?? 'mode unavailable').toLowerCase();
  const source = String(entry.scope ?? 'source unavailable').toLowerCase();
  const area = String(entry.area ?? 'area unavailable').toLowerCase();
  const result = String(entry.result ?? entry.status ?? 'Completed');
  const details = String(entry.summary ?? 'No additional result summary was recorded.');
  const opponent =
    typeof entry.opponent === 'object' && entry.opponent !== null && !Array.isArray(entry.opponent)
      ? String((entry.opponent as Record<string, unknown>).displayName ?? '')
      : '';
  return {
    id: row.id,
    game: String(entry.lane ?? `${source} ${area} · ${mode.toUpperCase()}`),
    result,
    details,
    context: opponent ? `vs. ${opponent}` : String(entry.context ?? 'Account history'),
    completedAt: Number.isNaN(Date.parse(row.completed_at))
      ? 'Date unavailable'
      : new Date(row.completed_at).toLocaleDateString(),
    area,
    source,
    mode,
  };
}

function localHistoryProjection(session: LocalSoloProjection): HistoryProjection {
  return {
    id: session.id,
    game: session.label,
    result: session.result ?? 'In progress',
    details: `${session.acceptedGuesses} accepted ${session.acceptedGuesses === 1 ? 'guess' : 'guesses'}${session.mode === 'go' ? ` · ${session.completedPuzzles}/${session.puzzleCount} puzzles solved` : ''}`,
    context: `Saved on this device · ${session.scope}`,
    completedAt: new Date(session.updatedAt).toLocaleDateString(),
    area: 'solo',
    source: session.scope,
    mode: session.mode,
  };
}

function resultClassName(result: string): string {
  const normalized = result.trim().toLowerCase();
  return ['won', 'lost', 'draw'].includes(normalized) ? `result-${normalized}` : '';
}

export function HistoryPage() {
  const { client, identity, status: authStatus, user } = useAuth();
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
  const localRows = useMemo(
    () =>
      authStatus === 'loading'
        ? []
        : readLocalSoloProjections(identity)
            .filter((session) => session.status !== 'playing')
            .map(localHistoryProjection),
    [authStatus, identity],
  );
  const accountRows = (history.data ?? []).map(accountHistoryProjection);
  const rows =
    authStatus === 'loading'
      ? []
      : user
        ? [
            ...accountRows,
            ...localRows.filter((local) => !accountRows.some((row) => row.id === local.id)),
          ]
        : localRows;
  const visible = rows.filter(
    (row) =>
      (area === 'all' || row.area === area) &&
      (source === 'all' || row.source === source) &&
      (mode === 'all' || row.mode === mode),
  );
  const loading = authStatus === 'loading' || Boolean(user && history.isPending);
  const failed = Boolean(user && history.isError);
  return (
    <div className="page">
      <PageHeader
        title="History"
        eyebrow="Record"
        description="Completed Solo and COMBAT results, newest first."
      />
      <div className="summary-line">
        <strong>{visible.length} results</strong>
        <span>{rows.filter((row) => row.area === 'solo').length} Solo</span>
        <span>{rows.filter((row) => row.area === 'combat').length} Combat</span>
        <span>{rows.filter((row) => row.result.toLowerCase() === 'won').length} won</span>
        <span>{rows.filter((row) => row.result.toLowerCase() === 'lost').length} lost</span>
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
          <span role="columnheader">Game</span>
          <span role="columnheader">Result</span>
          <span role="columnheader">Details</span>
          <span role="columnheader">Context</span>
          <span role="columnheader">Completed</span>
        </div>
        {!loading && !failed
          ? visible.map((row) => (
              <div className="history-row" role="row" key={row.id}>
                <strong role="rowheader" data-label="Game">
                  {row.game}
                </strong>
                <span role="cell" data-label="Result" className={resultClassName(row.result)}>
                  {row.result}
                </span>
                <span role="cell" data-label="Details">
                  {row.details}
                </span>
                <span role="cell" data-label="Context">
                  {row.context}
                </span>
                <time role="cell" data-label="Completed">
                  {row.completedAt}
                </time>
              </div>
            ))
          : null}
      </div>
      {loading ? (
        <p className="support-state" role="status">
          Loading your history…
        </p>
      ) : null}
      {failed ? (
        <div className="support-state" role="alert">
          <strong>History could not be loaded.</strong>
          <span>Your saved games on this device remain unchanged.</span>
          <Button onClick={() => void history.refetch()}>Retry history</Button>
        </div>
      ) : null}
      {!loading && !failed && visible.length === 0 ? (
        <p className="empty-state">
          {rows.length === 0
            ? user
              ? 'No account history records are available.'
              : 'No completed Solo games are saved on this device.'
            : 'No completed records match these filters.'}
        </p>
      ) : null}
    </div>
  );
}

export function StatsPage() {
  const { client, identity, status: authStatus, user } = useAuth();
  const { progression } = usePlayerState();
  const repository = useMemo(() => (client ? new AccountRepository(client) : null), [client]);
  const history = useQuery({
    queryKey: ['account-history', user?.id],
    enabled: Boolean(repository && user),
    queryFn: () => repository!.listHistory(user!.id),
    staleTime: 10_000,
    retry: 1,
  });
  const localRows = useMemo(
    () =>
      authStatus === 'loading'
        ? []
        : readLocalSoloProjections(identity)
            .filter((session) => session.status !== 'playing')
            .map(localHistoryProjection),
    [authStatus, identity],
  );
  const accountRows = (history.data ?? []).map(accountHistoryProjection);
  const rows =
    authStatus === 'loading'
      ? []
      : user
        ? [
            ...accountRows,
            ...localRows.filter((local) => !accountRows.some((row) => row.id === local.id)),
          ]
        : localRows;
  const soloRows = rows.filter((row) => row.area === 'solo');
  const combatRows = rows.filter((row) => row.area === 'combat');
  const soloWins = soloRows.filter((row) => row.result.toLowerCase() === 'won').length;
  const soloLosses = soloRows.filter((row) => row.result.toLowerCase() === 'lost').length;
  const winRate =
    soloRows.length === 0 ? '—' : `${Math.round((soloWins / soloRows.length) * 100)}%`;
  const combatWins = combatRows.filter((row) => row.result.toLowerCase() === 'won').length;
  const combatLosses = combatRows.filter((row) => row.result.toLowerCase() === 'lost').length;
  const combatDraws = combatRows.filter((row) => row.result.toLowerCase() === 'draw').length;
  const combatWinRate =
    combatRows.length === 0 ? '—' : `${Math.round((combatWins / combatRows.length) * 100)}%`;
  const breakdown = [
    ['OG Daily', 'daily', 'og'],
    ['OG Practice', 'practice', 'og'],
    ['GO Daily', 'daily', 'go'],
    ['GO Practice', 'practice', 'go'],
  ] as const;
  const level = levelForXp(progression.xp);
  const loading = authStatus === 'loading' || Boolean(user && history.isPending);
  const failed = Boolean(user && history.isError);
  return (
    <div className="page">
      <PageHeader
        title="My Stats"
        eyebrow="Private to you"
        description={
          user
            ? 'Derived from your saved account History and progression.'
            : 'Derived only from completed guest games and progression saved on this device.'
        }
        actions={<ButtonLink to="/leaderboards">Public Leaderboard</ButtonLink>}
      />
      <div className="stats-grid">
        <section>
          <SectionHeading title="Solo performance" />
          {loading ? (
            <p className="support-state" role="status">
              Loading private statistics…
            </p>
          ) : null}
          {failed ? (
            <div className="support-state" role="alert">
              <strong>Statistics could not be loaded.</strong>
              <Button onClick={() => void history.refetch()}>Retry statistics</Button>
            </div>
          ) : null}
          {!loading && !failed ? (
            <>
              <div className="metric-row">
                <Metric value={String(soloRows.length)} label="Recorded" tone="green" />
                <Metric value={String(soloWins)} label="Wins" tone="green" />
                <Metric value={String(soloLosses)} label="Losses" />
                <Metric value={winRate} label="Win rate" />
              </div>
              {soloRows.length > 0 ? (
                <RuledList>
                  {breakdown.map(([label, source, mode]) => {
                    const matching = soloRows.filter(
                      (row) => row.source === source && row.mode === mode,
                    );
                    const wins = matching.filter(
                      (row) => row.result.toLowerCase() === 'won',
                    ).length;
                    const losses = matching.filter(
                      (row) => row.result.toLowerCase() === 'lost',
                    ).length;
                    return (
                      <div className="stat-row" key={label}>
                        <strong>{label}</strong>
                        <span>{matching.length} recorded</span>
                        <span>{wins} wins</span>
                        <span>{losses} losses</span>
                      </div>
                    );
                  })}
                </RuledList>
              ) : (
                <p className="empty-state">
                  No completed Solo records are available for statistics.
                </p>
              )}
            </>
          ) : null}
        </section>
        <section>
          <SectionHeading title="COMBAT performance" />
          {loading ? (
            <p className="support-state" role="status">
              Loading COMBAT statistics…
            </p>
          ) : null}
          {!loading && !failed ? (
            <>
              <div className="metric-row">
                <Metric value={String(combatRows.length)} label="Recorded" tone="ice" />
                <Metric value={String(combatWins)} label="Wins" tone="green" />
                <Metric value={String(combatLosses)} label="Losses" />
                <Metric value={String(combatDraws)} label="Draws" />
                <Metric value={combatWinRate} label="Win rate" />
              </div>
              {combatRows.length > 0 ? (
                <div className="stats-breakdown" role="table" aria-label="COMBAT results by lane">
                  {(['daily', 'practice'] as const).flatMap((source) =>
                    (['og', 'go'] as const).map((mode) => {
                      const matching = combatRows.filter(
                        (row) => row.source === source && row.mode === mode,
                      );
                      return (
                        <div className="stat-row" role="row" key={`${source}:${mode}`}>
                          <strong role="rowheader">
                            {source === 'daily' ? 'Daily' : 'Practice'} {mode.toUpperCase()}
                          </strong>
                          <span role="cell">{matching.length} played</span>
                          <span role="cell">
                            {matching.filter((row) => row.result.toLowerCase() === 'won').length}{' '}
                            wins
                          </span>
                          <span role="cell">
                            {matching.filter((row) => row.result.toLowerCase() === 'lost').length}{' '}
                            losses
                          </span>
                        </div>
                      );
                    }),
                  )}
                </div>
              ) : (
                <p className="empty-state">No completed COMBAT games are in History yet.</p>
              )}
            </>
          ) : null}
        </section>
        <section>
          <SectionHeading title="Progression" />
          {authStatus === 'loading' ? (
            <p className="support-state" role="status">
              Checking progression ownership…
            </p>
          ) : (
            <div className="metric-row">
              <Metric value={String(level.level)} label="Level" tone="green" />
              <Metric value={String(progression.xp)} label="XP" tone="green" />
              <Metric value={String(progression.coins)} label="Coins" tone="green" />
              <Metric value={String(progression.unlockedDailies.length)} label="Daily unlocks" />
            </div>
          )}
          <SectionHeading title="Ranked ratings" />
          <p className="empty-state">
            Public ratings for opted-in players appear on Leaderboards. Your completed ranked games
            remain available in History.
          </p>
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
  const [nameSearch, setNameSearch] = useState('');
  const [page, setPage] = useState(1);
  const { client } = useAuth();
  const repository = useMemo(() => (client ? new PublicRepository(client) : null), [client]);
  const bucketKey =
    {
      'Practice OG': 'multiplayer:og',
      'Practice GO': 'multiplayer:go',
      'Daily OG': 'multiplayer:og:daily:v1',
      'Daily GO': 'multiplayer:go:daily:v1',
    }[bucket] ?? 'multiplayer:og';
  const leaderboard = useQuery({
    queryKey: ['public-leaderboard', bucketKey],
    enabled: Boolean(repository),
    queryFn: () => repository!.getLeaderboard(bucketKey, 100, 0),
    staleTime: 30_000,
    retry: 1,
  });
  const rows = (leaderboard.data ?? []).filter((row) =>
    row.display_name
      .toLocaleLowerCase('en-US')
      .includes(nameSearch.trim().toLocaleLowerCase('en-US')),
  );
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const visiblePage = Math.min(page, pageCount);
  const visibleRows = rows.slice((visiblePage - 1) * pageSize, visiblePage * pageSize);
  return (
    <div className="page">
      <PageHeader
        title="Leaderboards"
        eyebrow="Public ranked"
        description="Only opted-in public profiles appear."
      />
      <div className="segmented">
        {['Practice OG', 'Practice GO', 'Daily OG', 'Daily GO'].map((value) => (
          <button
            className={bucket === value ? 'is-selected' : ''}
            type="button"
            key={value}
            onClick={() => {
              setBucket(value);
              setPage(1);
            }}
          >
            {value}
          </button>
        ))}
      </div>
      <label className="leaderboard-search">
        Search player names
        <input
          type="search"
          value={nameSearch}
          onChange={(event) => {
            setNameSearch(event.target.value);
            setPage(1);
          }}
        />
      </label>
      <div className="leaderboard-table" role="table" aria-label={`${bucket} ranking`}>
        <div className="leaderboard-row leaderboard-row--head" role="row">
          <span role="columnheader">Rank</span>
          <span role="columnheader">Player</span>
          <span role="columnheader">Rating</span>
          <span role="columnheader">Move</span>
          <span role="columnheader">Peak</span>
          <span role="columnheader">Games</span>
          <span role="columnheader">W–L–D</span>
        </div>
        {visibleRows.map((row) => (
          <div className="leaderboard-row" role="row" key={row.public_profile_id}>
            <span role="cell">{row.rank}</span>
            <span className="leaderboard-player" role="cell">
              <PublicAvatar
                displayName={row.display_name}
                accent={profileAccent(row.accent_color)}
                avatarUrl={row.avatar_url}
              />
              <span>
                <ButtonLink to={`/players/${row.public_profile_id}`} tone="quiet">
                  {row.display_name}
                </ButtonLink>
                <small>{row.provisional ? 'Provisional' : 'Established'}</small>
              </span>
            </span>
            <strong role="cell">{row.rating}</strong>
            <span role="cell">
              {row.latest_rating_delta > 0 ? '+' : ''}
              {row.latest_rating_delta}
            </span>
            <span role="cell">{row.peak_rating}</span>
            <span role="cell">{row.games_played}</span>
            <span role="cell">
              {row.wins}–{row.losses}–{row.draws}
            </span>
          </div>
        ))}
        {leaderboard.isPending ? <p role="status">Loading public ranking…</p> : null}
        {leaderboard.isError ? (
          <div className="support-state" role="alert">
            <strong>Public ranking could not be loaded.</strong>
            <Button onClick={() => void leaderboard.refetch()}>Retry ranking</Button>
          </div>
        ) : null}
        {!leaderboard.isPending && !leaderboard.isError && rows.length === 0 ? (
          <p className="empty-state">No opted-in public profiles qualify for this bucket.</p>
        ) : null}
      </div>
      {rows.length > pageSize ? (
        <nav className="word-pagination" aria-label="Leaderboard pages">
          <Button
            disabled={visiblePage === 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </Button>
          <span>
            Page {visiblePage} of {pageCount}
          </span>
          <Button
            disabled={visiblePage === pageCount}
            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
          >
            Next
          </Button>
        </nav>
      ) : null}
    </div>
  );
}

export function MarketplacePage() {
  const { status: authStatus, user } = useAuth();
  const { progression, economyPending, purchaseConsumable } = usePlayerState();
  const coins = authStatus === 'loading' ? undefined : progression.coins;
  const reveal = progression.consumables?.revealOneLetter ?? 0;
  const remove = progression.consumables?.removeIncorrectLetters ?? 0;
  const [message, setMessage] = useState(
    'Purchases add inventory and never activate automatically.',
  );
  const buy = async (kind: 'reveal' | 'remove') => {
    const cost = kind === 'reveal' ? 25 : 40;
    if (economyPending || coins === undefined) {
      setMessage('Your coin balance is still loading. No purchase was attempted.');
      return;
    }
    if (coins < cost) {
      setMessage(`${cost - coins} more coins required.`);
      return;
    }
    const result = await purchaseConsumable(
      kind === 'reveal' ? 'revealOneLetter' : 'removeIncorrectLetters',
      crypto.randomUUID(),
    );
    if (result.ok) {
      setMessage(
        `${kind === 'reveal' ? 'Reveal One Letter' : 'Remove Incorrect Letters'} added to ${user ? 'account' : 'local guest'} inventory.`,
      );
    } else {
      setMessage(
        result.code === 'insufficient_coins'
          ? `${cost - coins} more coins required.`
          : 'Purchase failed without changing inventory.',
      );
    }
  };
  const economyReady = authStatus !== 'loading' && !economyPending;
  return (
    <div className="page">
      <PageHeader
        title="Marketplace"
        eyebrow="Progression"
        description="Buy to inventory · activate only in Solo Practice"
        actions={
          <Metric
            value={coins === undefined ? '—' : coins}
            label={user ? 'Coins' : 'Local coins'}
            tone="amber"
          />
        }
      />
      {authStatus === 'loading' || economyPending ? (
        <p className="support-state" role="status">
          Loading private economy state…
        </p>
      ) : null}
      {!user && authStatus !== 'loading' ? (
        <p className="neutral-band">
          Guest coins and inventory stay on this device. Sign in to use account inventory; guest
          items do not merge into an account automatically.
        </p>
      ) : null}
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
          <Button
            onClick={() => void buy('reveal')}
            tone="primary"
            disabled={!economyReady || coins === undefined || coins < 25}
          >
            Buy 1 · 25 coins
          </Button>
        </section>
        <section>
          <Icon name="backspace" />
          <h2>Remove Incorrect Letters</h2>
          <StatusDot>Owned {remove}</StatusDot>
          <p>Disables up to five eligible answer-absent keyboard letters.</p>
          <div className="mini-keys">Q W E R T Y U I O P</div>
          <Button
            onClick={() => void buy('remove')}
            disabled={!economyReady || coins === undefined || coins < 40}
          >
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
  const { client, status: authStatus, user } = useAuth();
  const queryClient = useQueryClient();
  const repository = useMemo(() => (client ? new PublicRepository(client) : null), [client]);
  const profileQueryKey = [
    publicView ? 'public-profile' : 'my-public-profile',
    publicProfileId,
    user?.id,
  ] as const;
  const profile = useQuery({
    queryKey: profileQueryKey,
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
    raw.displayName ?? raw.display_name ?? (user ? 'Profile not created' : 'Guest player'),
  );
  const bio = String(raw.bio ?? '');
  const accent = profileAccent(raw.accentColor ?? raw.accent_color);
  const avatarUrl =
    typeof (raw.avatarUrl ?? raw.avatar_url) === 'string'
      ? String(raw.avatarUrl ?? raw.avatar_url)
      : null;
  const [saveStatus, setSaveStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>(emptyProfileDraft);
  const [baseline, setBaseline] = useState<ProfileDraft>(emptyProfileDraft);

  useEffect(() => {
    if (publicView) return;
    const ownerProjection = profile.data as OwnedPublicProfileProjection | null | undefined;
    const next = ownerProjection ? profileDraftFromProjection(ownerProjection) : emptyProfileDraft;
    setDraft(next);
    setBaseline(next);
  }, [profile.data, publicView, user?.id]);
  if ((!publicView && authStatus === 'loading') || (profile.isPending && (publicView || user))) {
    return (
      <div className="page page--narrow">
        <PageHeader title="Profile" eyebrow="Identity" />
        <p className="support-state" role="status">
          Loading approved profile fields…
        </p>
      </div>
    );
  }
  if (profile.isError && (publicView || user)) {
    return (
      <div className="page page--narrow">
        <PageHeader title="Profile unavailable" eyebrow="Identity" />
        <div className="support-state" role="alert">
          <strong>Approved profile fields could not be loaded.</strong>
          <Button onClick={() => void profile.refetch()}>Retry profile</Button>
        </div>
      </div>
    );
  }
  if (publicView && !profile.isPending && !profile.data) {
    return (
      <div className="page page--narrow">
        <PageHeader
          title="Player unavailable"
          eyebrow="Public player card"
          description="This player does not have an available public profile."
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
        <PublicAvatar displayName={displayName} accent={accent} avatarUrl={avatarUrl} size="xl" />
        <div>
          <h2>{displayName}</h2>
          <p>{bio || 'No public bio.'}</p>
          <StatusDot>
            {publicView ? 'Public profile' : user ? 'Your profile' : 'Guest preview'}
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
            <ButtonLink
              to={`/combat/practice?target=${encodeURIComponent(String(raw.publicProfileId ?? raw.public_profile_id ?? ''))}`}
            >
              Request private Practice match
            </ButtonLink>
            <ButtonLink
              to={`/settings?block=${encodeURIComponent(String(raw.publicProfileId ?? raw.public_profile_id ?? ''))}#alerts`}
            >
              Manage private-request block
            </ButtonLink>
          </section>
        </div>
      ) : (
        <form
          className="profile-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaveStatus('');
            if (!repository || !user) {
              setSaveStatus('Sign in before saving a public profile.');
              return;
            }
            setSaving(true);
            try {
              const saved = await repository.updateMyProfile(draft);
              const savedDraft = profileDraftFromProjection(saved);
              queryClient.setQueryData(profileQueryKey, saved);
              setDraft(savedDraft);
              setBaseline(savedDraft);
              setSaveStatus('Player profile saved.');
            } catch (error: unknown) {
              setSaveStatus(error instanceof Error ? error.message : 'Profile save failed.');
            } finally {
              setSaving(false);
            }
          }}
        >
          <label>
            Player name
            <input
              name="displayName"
              maxLength={50}
              value={draft.displayName}
              onChange={(event) =>
                setDraft((current) => ({ ...current, displayName: event.target.value }))
              }
              required
              disabled={saving}
            />
          </label>
          <label>
            Public visibility
            <select
              name="visibility"
              value={draft.visibility}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  visibility: event.target.value === 'public' ? 'public' : 'private',
                }))
              }
              disabled={saving}
            >
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
                  checked={value.toLowerCase() === draft.accentColor}
                  onChange={() =>
                    setDraft((current) => ({
                      ...current,
                      accentColor: profileAccent(value.toLowerCase()),
                    }))
                  }
                  disabled={saving}
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
              value={draft.avatarUrl}
              onChange={(event) =>
                setDraft((current) => ({ ...current, avatarUrl: event.target.value }))
              }
              disabled={saving}
            />
          </label>
          <label>
            Public bio
            <textarea
              name="bio"
              maxLength={160}
              value={draft.bio}
              onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value }))}
              disabled={saving}
            />
          </label>
          <Button type="submit" tone="primary" disabled={saving}>
            {saving ? 'Saving player profile…' : 'Save player profile'}
          </Button>
          <Button
            type="button"
            disabled={saving}
            onClick={() => {
              setDraft(baseline);
              setSaveStatus('');
            }}
          >
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

const WORD_EXPLORER_PAGE_SIZE = 25;

export function WordExplorerPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialParameters = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const initialWord = (initialParameters.get('word') ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  const initialQuery = (initialParameters.get('q') ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  const initialLengthValue = Number(initialParameters.get('length'));
  const initialLength =
    initialWord.length >= 2 && initialWord.length <= 35
      ? initialWord.length
      : Number.isInteger(initialLengthValue) && initialLengthValue >= 2 && initialLengthValue <= 35
        ? initialLengthValue
        : 5;
  const [query, setQuery] = useState(initialQuery);
  const [selected, setSelected] = useState(initialWord);
  const [length, setLength] = useState(initialLength);
  const [sort, setSort] = useState<'az' | 'za'>('az');
  const [page, setPage] = useState(1);
  const [copyStatus, setCopyStatus] = useState('');
  const normalizedQuery = query
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  const words = useQuery({
    queryKey: ['word-explorer', length],
    queryFn: ({ signal }) => wordListProvider.load(length, signal),
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });
  const filteredWords = [...(words.data?.validGuesses ?? [])]
    .filter((word) => !normalizedQuery || word.includes(normalizedQuery))
    .sort((left, right) => {
      const ascending = left < right ? -1 : left > right ? 1 : 0;
      return sort === 'az' ? ascending : -ascending;
    });
  const pageSize = WORD_EXPLORER_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(filteredWords.length / pageSize));
  const visiblePage = Math.min(page, pageCount);
  const visibleWords = filteredWords.slice((visiblePage - 1) * pageSize, visiblePage * pageSize);
  const selectedWord =
    selected && words.data?.validGuesses.includes(selected)
      ? selected
      : (visibleWords[0] ?? normalizedQuery);
  const isValidGuess = Boolean(selectedWord && words.data?.validGuesses.includes(selectedWord));
  const definitions = selectedWord ? (words.data?.definitions?.[selectedWord] ?? []) : [];
  return (
    <div className="page">
      <PageHeader
        title="Word Explorer"
        eyebrow="Word data"
        description="Explore the game’s valid-word list without exposing active answers."
      />
      <div className="explorer-layout">
        <section>
          <div className="word-search" data-sort={sort}>
            <div className="word-explorer-controls">
              <label>
                Word length
                <select
                  value={length}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setLength(next);
                    setQuery('');
                    setSelected('');
                    setPage(1);
                    setCopyStatus('');
                    navigate(`/word-explorer?length=${next}`, { replace: true });
                  }}
                >
                  {Array.from({ length: 34 }, (_, index) => index + 2).map((value) => (
                    <option value={value} key={value}>
                      {value} letters
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Sort
                <select
                  value={sort}
                  onInput={(event) => {
                    setSort(event.currentTarget.value === 'za' ? 'za' : 'az');
                    setSelected('');
                    setPage(1);
                  }}
                  onChange={(event) => {
                    setSort(event.target.value === 'za' ? 'za' : 'az');
                    setSelected('');
                    setPage(1);
                  }}
                >
                  <option value="az">A–Z</option>
                  <option value="za">Z–A</option>
                </select>
              </label>
            </div>
            <label className="search-control">
              <Icon name="search" />
              <span className="sr-only">Search words</span>
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelected('');
                  setPage(1);
                  setCopyStatus('');
                  const next = event.target.value
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z]/g, '');
                  const parameters = new URLSearchParams({ length: String(length) });
                  if (next) parameters.set('q', next);
                  navigate(`/word-explorer?${parameters}`, { replace: true });
                }}
                placeholder="Search words"
              />
            </label>
            <p className="search-metadata" aria-live="polite">
              {words.isPending
                ? `Loading ${length}-letter word data…`
                : words.isError
                  ? `${length}-letter word data unavailable`
                  : `${filteredWords.length} matching valid ${filteredWords.length === 1 ? 'word' : 'words'} · page ${visiblePage} of ${pageCount}`}
            </p>
          </div>
          <RuledList>
            {words.isPending ? (
              <p className="support-state" role="status">
                Loading valid game words…
              </p>
            ) : null}
            {words.isError ? (
              <div className="support-state" role="alert">
                <strong>Word data could not be loaded.</strong>
                <span>
                  Active answers were not exposed and no fallback was presented as current data.
                </span>
                <Button onClick={() => void words.refetch()}>Retry word data</Button>
              </div>
            ) : null}
            {!words.isPending && !words.isError
              ? visibleWords.map((word) => (
                  <button
                    type="button"
                    key={word}
                    className={`word-row ${selectedWord === word ? 'is-selected' : ''}`}
                    onClick={() => {
                      setSelected(word);
                      setCopyStatus('');
                      navigate(`/word-explorer?length=${length}&word=${encodeURIComponent(word)}`, {
                        replace: true,
                      });
                    }}
                  >
                    <strong>{word.toUpperCase()}</strong>
                    <span>Valid game word</span>
                    <small>{word.length} letters</small>
                  </button>
                ))
              : null}
            {!words.isPending && !words.isError && filteredWords.length === 0 ? (
              <p className="empty-state">No valid game word matched this search.</p>
            ) : null}
          </RuledList>
          {!words.isPending && !words.isError && filteredWords.length > pageSize ? (
            <nav className="word-pagination" aria-label="Word results pages">
              <Button
                disabled={visiblePage === 1}
                onClick={() => {
                  setSelected('');
                  setPage((current) => Math.max(1, current - 1));
                  setCopyStatus('');
                }}
              >
                Previous
              </Button>
              <span>
                Page {visiblePage} of {pageCount}
              </span>
              <Button
                disabled={visiblePage === pageCount}
                onClick={() => {
                  setSelected('');
                  setPage((current) => Math.min(pageCount, current + 1));
                  setCopyStatus('');
                }}
              >
                Next
              </Button>
            </nav>
          ) : null}
        </section>
        <section className="definition-panel">
          {words.isPending ? <p className="support-state">Word details are loading.</p> : null}
          {words.isError ? <p className="support-state">Word details are unavailable.</p> : null}
          {!words.isPending && !words.isError && selectedWord ? (
            <>
              <h2>{selectedWord.toUpperCase()}</h2>
              <p>
                {selectedWord.length} letters ·{' '}
                {isValidGuess ? 'Valid game word' : 'No valid-game-word match'}
              </p>
              <hr />
              <h3>Definitions</h3>
              <StatusDot tone="ice">
                {definitions.length > 0 ? 'Definition available' : 'Definition unavailable'}
              </StatusDot>
              {definitions.length > 0 ? (
                <ul className="definition-copy">
                  {definitions.map((entry, index) => (
                    <li key={`${selectedWord}:${index}`}>
                      {entry.partOfSpeech ? <em>{entry.partOfSpeech}: </em> : null}
                      {entry.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="definition-copy">
                  No definition is available. Search Google for this word.
                </p>
              )}
              <div className="word-actions">
                <Button
                  onClick={() => {
                    if (!navigator.clipboard) {
                      setCopyStatus('Clipboard access is unavailable. Select the word manually.');
                      return;
                    }
                    void navigator.clipboard
                      .writeText(selectedWord)
                      .then(() => setCopyStatus(`${selectedWord.toUpperCase()} copied.`))
                      .catch(() => setCopyStatus('Copy failed. Select the word manually.'));
                  }}
                >
                  Copy word
                </Button>
                <a
                  className="button button--secondary"
                  href={`https://www.google.com/search?q=define+${encodeURIComponent(selectedWord)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Icon name="external" /> Search Google{' '}
                  <span className="word-action-query">for “{selectedWord}”</span>
                </a>
              </div>
              {copyStatus ? <p role="status">{copyStatus}</p> : null}
            </>
          ) : null}
          {!words.isPending && !words.isError && !selectedWord ? (
            <p className="empty-state">Select a valid word to inspect its available definition.</p>
          ) : null}
        </section>
      </div>
      <p className="privacy-band">
        <Icon name="lock" /> This page shows which words can be played. It never identifies current
        or future answers.
      </p>
    </div>
  );
}

export function SettingsPage() {
  const location = useLocation();
  const { client, identity, user } = useAuth();
  const repository = useMemo(() => (client ? new AccountRepository(client) : null), [client]);
  const accountSettings = useQuery({
    queryKey: ['account-settings', user?.id],
    enabled: Boolean(repository && user),
    queryFn: () => repository!.loadSettings(user!.id),
    staleTime: 10_000,
    retry: 1,
  });
  if (user && accountSettings.isPending) {
    return (
      <div className="page page--narrow">
        <PageHeader title="Settings" eyebrow="Player system" />
        <p className="support-state" role="status">
          Loading account settings…
        </p>
      </div>
    );
  }
  return (
    <SettingsForm
      key={`${user?.id ?? 'guest'}:${accountSettings.data ? 'cloud' : 'local'}`}
      client={client}
      identity={identity}
      accountSettings={accountSettings.data}
      accountSettingsError={accountSettings.isError}
      blockTarget={(new URLSearchParams(location.search).get('block') ?? '').toLowerCase()}
      {...(user ? { userId: user.id } : {})}
    />
  );
}

function SettingsForm({
  client,
  identity,
  userId,
  accountSettings,
  accountSettingsError,
  blockTarget,
}: {
  client: ReturnType<typeof useAuth>['client'];
  identity: IdentityScope;
  userId?: string;
  accountSettings?: Json | null | undefined;
  accountSettingsError: boolean;
  blockTarget: string;
}) {
  const initial = useMemo(() => {
    const local = loadPlayerSettings(
      identity,
      typeof localStorage === 'undefined' ? undefined : localStorage,
    );
    return mergePlayerSettings(accountSettings, local.settings);
  }, [accountSettings, identity]);
  const [difficulty, setDifficulty] = useState(initial.difficulty);
  const [chain, setChain] = useState(initial.chain);
  const [hard, setHard] = useState(initial.hard);
  const [sound, setSound] = useState(initial.sound);
  const [motion, setMotion] = useState(initial.motion);
  const [notifications, setNotifications] = useState(initial.notifications);
  const [saveStatus, setSaveStatus] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const privateRepository = useMemo(
    () => (client && userId ? new PrivateRequestRepository(client) : null),
    [client, userId],
  );
  const privatePreference = useQuery({
    queryKey: ['private-request-preference', userId],
    enabled: Boolean(privateRepository),
    queryFn: () => privateRepository!.preference(),
    staleTime: 10_000,
    retry: 1,
  });
  const blocks = useQuery({
    queryKey: ['private-request-blocks', userId],
    enabled: Boolean(privateRepository),
    queryFn: () => privateRepository!.blocks(),
    staleTime: 10_000,
    retry: 1,
  });
  const publicRepository = useMemo(
    () => (client && userId ? new PublicRepository(client) : null),
    [client, userId],
  );
  const blockTargetProfile = useQuery({
    queryKey: ['settings-block-target', blockTarget],
    enabled: Boolean(
      publicRepository &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
        blockTarget,
      ),
    ),
    queryFn: () => publicRepository!.getProfile(blockTarget),
    staleTime: 30_000,
    retry: 1,
  });
  const save = async () => {
    const settings = { difficulty, chain, hard, sound, motion, notifications };
    try {
      const local = updatePlayerSettings(identity, settings, localStorage);
      if (!local.ok) throw new Error('Versioned local settings could not be saved.');
      if (client && userId) {
        await new AccountRepository(client).saveSettings(
          userId,
          settings,
          new Date().toISOString(),
        );
      }
      setSaveStatus(
        userId
          ? 'Settings saved to this device and your account.'
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
      {accountSettingsError ? (
        <p className="support-state" role="alert">
          Account settings could not be loaded. Local settings remain visible and no cloud value was
          overwritten.
        </p>
      ) : null}
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
                {(['Casual', 'Standard', 'Expert'] as const).map((value) => (
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
                {([5, 7, 10] as const).map((value) => (
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
                  onChange={(event) => {
                    setSound(event.target.checked);
                    writeSoundEnabled(identity, event.target.checked, localStorage);
                  }}
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
          <section id="alerts">
            <SectionHeading title="Alerts & private requests" />
            <SettingGroup
              label="In-app notifications"
              description="Status and navigation equivalents remain available when sound is off."
            >
              <label className="switch">
                <input
                  type="checkbox"
                  checked={notifications}
                  onChange={(event) => setNotifications(event.target.checked)}
                />
                <span>{notifications ? 'On' : 'Off'}</span>
              </label>
            </SettingGroup>
            {userId ? (
              <>
                <SettingGroup
                  label="Private Practice requests"
                  description="Choose whether other players can send you private Practice requests."
                >
                  <Button
                    disabled={privatePreference.isPending || !privateRepository}
                    onClick={() => {
                      if (!privateRepository) return;
                      const next = !(
                        privatePreference.data?.accept_private_practice_requests ?? true
                      );
                      void privateRepository
                        .updatePreference(next)
                        .then(() => privatePreference.refetch())
                        .then(() => setSaveStatus('Private-request preference updated.'))
                        .catch((error: unknown) =>
                          setSaveStatus(
                            error instanceof Error
                              ? error.message
                              : 'Private-request preference failed.',
                          ),
                        );
                    }}
                  >
                    {(privatePreference.data?.accept_private_practice_requests ?? true)
                      ? 'Accepting requests'
                      : 'Requests paused'}
                  </Button>
                </SettingGroup>
                <div className="setting-group setting-group--stacked">
                  <div>
                    <h3>Blocked public players</h3>
                    <p>Choose a player from their public profile.</p>
                  </div>
                  {blockTargetProfile.isPending && blockTarget ? (
                    <p role="status">Loading the selected public player…</p>
                  ) : null}
                  {blockTargetProfile.data ? (
                    <div className="button-row">
                      <strong>{blockTargetProfile.data.displayName ?? 'Public player'}</strong>
                      <Button
                        disabled={!privateRepository || blocks.isPending}
                        onClick={() => {
                          if (!privateRepository) return;
                          void privateRepository
                            .setBlock(blockTargetProfile.data!.publicProfileId, true)
                            .then(() => blocks.refetch())
                            .then(() =>
                              setSaveStatus('Player added to the private-request block list.'),
                            )
                            .catch((error: unknown) =>
                              setSaveStatus(
                                error instanceof Error ? error.message : 'Block update failed.',
                              ),
                            );
                        }}
                      >
                        Block player
                      </Button>
                    </div>
                  ) : (
                    <ButtonLink to="/leaderboards">Choose a public player</ButtonLink>
                  )}
                  {blocks.data?.length ? (
                    <ul className="legend-list" aria-label="Blocked players">
                      {blocks.data.map((block) => (
                        <li key={block.public_profile_id}>
                          <span>{block.display_name}</span>
                          <Button
                            onClick={() => {
                              if (!privateRepository) return;
                              void privateRepository
                                .setBlock(block.public_profile_id, false)
                                .then(() => blocks.refetch());
                            }}
                          >
                            Unblock
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="empty-state">No public players are blocked.</p>
                  )}
                </div>
              </>
            ) : (
              <p className="neutral-band">
                Sign in to manage private Practice requests and blocked players.
              </p>
            )}
          </section>
          <Disclosure
            label="Account & local data"
            meta={userId ? 'Account-scoped' : 'Guest · local'}
          >
            <p>
              Reset removes only this player’s local data from this browser. It never deletes the
              account, another account’s data, or server history.
            </p>
            <Button tone="danger" onClick={() => setResetOpen(true)}>
              Reset local player data
            </Button>
            {resetOpen ? (
              <div className="confirmation-bar" role="alertdialog" aria-label="Confirm local reset">
                <p>
                  Remove this player’s local sessions, history, settings, progression, continuation
                  and consumable operations, and notifications?
                </p>
                <Button
                  tone="danger"
                  onClick={() => {
                    const suffix = `:${ownerStorageSegment(identity)}`;
                    const prefixes = [
                      'amordle:solo:',
                      'amordle:solo-history:',
                      'amordle:solo-completion:',
                      'amordle:solo-continuation:',
                      'amordle:solo-consumable:',
                      'amordle:notifications:',
                      'amordle:progression:',
                      'amordle:practice-generation:',
                      'amordle:settings:',
                    ];
                    const exactKeys = Array.from({ length: localStorage.length }, (_, index) =>
                      localStorage.key(index),
                    ).filter((key): key is string =>
                      Boolean(
                        key &&
                        key.endsWith(suffix) &&
                        prefixes.some((prefix) => key.startsWith(prefix)),
                      ),
                    );
                    for (const key of exactKeys) localStorage.removeItem(key);
                    window.location.assign('/');
                  }}
                >
                  Confirm local reset
                </Button>
                <Button onClick={() => setResetOpen(false)}>Cancel</Button>
              </div>
            ) : null}
          </Disclosure>
          <div className="button-row settings-save-bar">
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
  const [step, setStep] = useState(0);
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
        {step === 0 ? (
          <p>
            amordle has two word formats: OG is one puzzle and GO is a linked sequence that carries
            prior solved-word evidence forward.
          </p>
        ) : null}
        {step === 1 ? (
          <div className="prose">
            <p>Solo Practice is configurable and remains available to guests on this device.</p>
            <p>
              Solo Daily follows the local calendar day. Daily COMBAT follows UTC and requires you
              to sign in.
            </p>
          </div>
        ) : null}
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
        ) : null}
        {step === 3 ? (
          <div className="prose">
            <p>
              Enter submits a valid guess; Backspace or Delete removes an editable letter. Correct
              evidence outranks present, which outranks absent.
            </p>
            <p>
              In COMBAT, absent tiles score 0, present tiles 2, and correct tiles 5. Solving adds
              100, unused attempts add 10 each, and a Hard Mode solve adds 15.
            </p>
            <p>
              Elo changes only after eligible ranked server settlement. Live points, result points,
              rating, turn, and clock are separate signals.
            </p>
          </div>
        ) : null}
        {step === 4 ? (
          <div className="prose">
            <p>
              Use Daily for date-bound play, History for accepted result records, Stats for
              available identity-scoped summaries, and Active Games to re-enter participant-owned
              COMBAT.
            </p>
            <p>
              Guest progress stays local. Public profiles are opt-in; answers, raw auth identifiers,
              private matches, and account data remain protected.
            </p>
          </div>
        ) : null}
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
      <Disclosure label="Recovery & accessibility" meta="Keyboard, sound, offline">
        <p>
          Tile meaning never depends on color alone. Sound is optional, reduced motion is respected,
          and saved local Solo Practice remains available when the network is unavailable.
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

function sanitizeIssueText(value: string): string {
  return Array.from(value.replace(/\r\n?/g, '\n'))
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint === 9 || codePoint === 10 || (codePoint >= 32 && codePoint !== 127);
    })
    .join('')
    .trim()
    .slice(0, 4_000);
}

export function FeedbackPage() {
  const [kind, setKind] = useState('Bug');
  const [message, setMessage] = useState('');
  const [previewBody, setPreviewBody] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState('');
  const [handoffError, setHandoffError] = useState('');
  const sanitizedMessage = sanitizeIssueText(message);
  const body = `## ${kind}\n\n${sanitizedMessage}\n\nNo private account or game state was attached.`;
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
          setCopyStatus('');
          if (sanitizedMessage.length < 10) {
            setPreviewBody(null);
            setHandoffError('Enter at least 10 visible characters after privacy sanitization.');
            return;
          }
          setHandoffError('');
          setPreviewBody(body);
        }}
        className="feedback-form"
      >
        <label>
          Feedback type
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPreviewBody(null);
              setCopyStatus('');
            }}
          >
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
            maxLength={4_000}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setPreviewBody(null);
              setCopyStatus('');
              setHandoffError('');
            }}
            placeholder="Describe the issue without personal information."
          />
        </label>
        <Button tone="primary" type="submit">
          Review handoff
        </Button>
        {handoffError ? <p role="alert">{handoffError}</p> : null}
      </form>
      {previewBody ? (
        <section className="issue-preview">
          <h2>Issue preview</h2>
          <pre>{previewBody}</pre>
          <Button
            onClick={() => {
              if (!navigator.clipboard) {
                setCopyStatus('Clipboard access is unavailable. Select the preview text manually.');
                return;
              }
              void navigator.clipboard
                .writeText(previewBody)
                .then(() => setCopyStatus('Issue text copied.'))
                .catch(() => setCopyStatus('Copy failed. Select the preview text manually.'));
            }}
          >
            Copy issue text
          </Button>
          <a
            className="button button--secondary"
            target="_blank"
            rel="noreferrer"
            href={`https://github.com/ryanjosephkamp/amordle/issues/new?body=${encodeURIComponent(previewBody)}`}
          >
            Open GitHub issue <Icon name="external" />
          </a>
          {copyStatus ? <p role="status">{copyStatus}</p> : null}
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
          Guest progress is local. Public profiles are opt-in. Daily answers, account data, private
          matches, and developer tools remain protected by server-side access controls.
        </p>
        <h2>Credits</h2>
        <p>
          Word data is curated from the project’s public English Openlist source and validated
          before use. The application uses self-hosted open fonts and original atmospheric artwork.
        </p>
        <h2>Release</h2>
        <p>
          Greenfield implementation in progress. This surface does not claim production promotion or
          release-candidate acceptance.
        </p>
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
  const requestedReturn = new URLSearchParams(location.search).get('returnTo');
  const returnTo =
    requestedReturn?.startsWith('/') && !requestedReturn.startsWith('//') ? requestedReturn : '/';
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
            Sign-in confirmed. Your account data is ready.
          </div>
        ) : null}
        <Button
          tone="primary"
          onClick={() => navigate(user ? returnTo : '/auth', { replace: true })}
        >
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
              ? service.signIn(email, password).then(() => navigate(returnTo, { replace: true }))
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
