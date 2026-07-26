import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../app/auth-context';
import { usePlayerState } from '../../app/player-state-context';
import { Button, ButtonLink } from '../../components/Button';
import { Disclosure } from '../../components/Disclosure';
import { Icon } from '../../components/Icon';
import { PageHeader, SectionHeading } from '../../components/Surface';
import { canAccessDaily, localDateKey } from '../../domain/daily';
import { readLocalSoloProjections } from '../supporting/local-solo-projections';

const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type CalendarLaneState = 'available' | 'locked' | 'completed' | 'unavailable';

const laneMarks: Record<CalendarLaneState, string> = {
  available: '○',
  locked: '◇',
  completed: '✓',
  unavailable: '—',
};

function laneDescription(label: string, state: CalendarLaneState): string {
  return `${label}: ${state}`;
}

function CalendarLane({
  code,
  dateKey,
  label,
  mode,
  selected,
  state,
  unavailable,
  onSelect,
}: {
  code: 'S-OG' | 'S-GO' | 'C-OG' | 'C-GO';
  dateKey: string;
  label: string;
  mode?: 'og' | 'go';
  selected?: boolean;
  state: CalendarLaneState;
  unavailable?: boolean;
  onSelect?: () => void;
}) {
  const content = (
    <>
      <span className="day-state__label" aria-hidden="true">
        {code}
      </span>
      <span className="day-state__mark" aria-hidden="true">
        {laneMarks[state]}
      </span>
    </>
  );

  return mode && onSelect ? (
    <button
      type="button"
      className="day-state calendar-lane-button"
      data-state={state}
      data-date={dateKey}
      data-mode={mode}
      disabled={unavailable}
      aria-pressed={selected}
      aria-label={`Select ${label} for ${dateKey}; ${state}`}
      onClick={onSelect}
    >
      {content}
    </button>
  ) : (
    <span
      className="day-state"
      data-state={state}
      role="img"
      aria-label={laneDescription(label, state)}
    >
      {content}
    </span>
  );
}

export function CalendarPage() {
  const todayKey = localDateKey();
  const { identity, status: authStatus } = useAuth();
  const { progression, unlockDaily } = usePlayerState();
  const dailyEntitlements = [
    ...progression.unlockedDailies,
    ...Object.keys(progression.pendingDailyUnlocks ?? {}),
  ];
  const localSolo = useMemo(
    () => (authStatus === 'loading' ? [] : readLocalSoloProjections(identity)),
    [authStatus, identity],
  );
  const completedDaily = localSolo.filter(
    (session) => session.scope === 'daily' && session.status !== 'playing' && session.dateKey,
  );
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [selectedMode, setSelectedMode] = useState<'og' | 'go'>('og');
  const [unlockMessage, setUnlockMessage] = useState('');
  const [unlockingKey, setUnlockingKey] = useState<string | null>(null);
  const calendarPanelRef = useRef<HTMLElement>(null);
  const todayCellRef = useRef<HTMLDivElement>(null);
  const calendarRailRef = useRef<HTMLElement>(null);
  const autoPositionedMonthRef = useRef<string | null>(null);
  const shownDate = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  }, [monthOffset]);
  const today = new Date();
  const year = shownDate.getFullYear();
  const month = shownDate.getMonth();
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - first + 1;
    return day > 0 && day <= days ? day : null;
  });
  const title = shownDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const shownMonthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const todayMonthKey = todayKey.slice(0, 7);
  const selectedAllowed = canAccessDaily({
    mode: selectedMode,
    dateKey: selectedDate,
    todayKey,
    unlocked: dailyEntitlements,
  });
  const selectedIsPast = selectedDate < todayKey;
  const selectedLabel = `Solo ${selectedMode.toUpperCase()} · ${selectedDate}`;
  const unlockShortfall = Math.max(0, 60 - progression.coins);

  useLayoutEffect(() => {
    if (shownMonthKey !== todayMonthKey) {
      autoPositionedMonthRef.current = null;
      return;
    }
    if (autoPositionedMonthRef.current === shownMonthKey || window.innerWidth > 760) {
      return;
    }
    const panel = calendarPanelRef.current;
    const todayCell = todayCellRef.current;
    if (!panel || !todayCell) return;
    const maximum = Math.max(0, panel.scrollWidth - panel.clientWidth);
    const centered = todayCell.offsetLeft + todayCell.offsetWidth / 2 - panel.clientWidth / 2;
    panel.scrollLeft = Math.min(maximum, Math.max(0, centered));
    autoPositionedMonthRef.current = shownMonthKey;
  }, [shownMonthKey, todayMonthKey]);

  const selectSoloLane = (mode: 'og' | 'go', dateKey: string) => {
    setSelectedMode(mode);
    setSelectedDate(dateKey);
    setUnlockMessage('');
    if (window.innerWidth <= 760) {
      window.requestAnimationFrame(() => {
        calendarRailRef.current?.scrollIntoView({ block: 'start', inline: 'nearest' });
      });
    }
  };

  return (
    <div className="page page--calendar">
      <PageHeader title="Daily" eyebrow={`Calendar · ${title}`} />
      <div className="daily-actions">
        <ButtonLink tone="primary" to="/play/daily/og">
          <Icon name="play" /> Play today’s OG
        </ButtonLink>
        <ButtonLink to="/play/daily/go">
          <Icon name="play" /> Play today’s GO
        </ButtonLink>
        <ButtonLink to="/combat/daily">
          <Icon name="combat" /> Daily Combat
        </ButtonLink>
      </div>
      <div className="calendar-layout">
        <section className="calendar-panel" aria-labelledby="calendar-title" ref={calendarPanelRef}>
          <header>
            <Button
              type="button"
              onClick={() => setMonthOffset((value) => value - 1)}
              aria-label="Previous month"
            >
              ‹
            </Button>
            <h2 id="calendar-title">{title}</h2>
            <Button
              type="button"
              onClick={() => setMonthOffset((value) => value + 1)}
              aria-label="Next month"
            >
              ›
            </Button>
          </header>
          <div className="calendar-grid" role="grid" aria-label={title}>
            {weekday.map((day) => (
              <div role="columnheader" key={day}>
                {day}
              </div>
            ))}
            {cells.map((day, index) => {
              if (!day)
                return (
                  <div role="gridcell" className="calendar-day calendar-day--padding" key={index} />
                );
              const isToday =
                day === today.getDate() &&
                month === today.getMonth() &&
                year === today.getFullYear();
              const date = new Date(year, month, day);
              const inRange = date >= new Date(2025, 0, 1) && date <= today;
              const dateKey = localDateKey(date);
              const soloOgAvailable = canAccessDaily({
                mode: 'og',
                dateKey,
                todayKey,
                unlocked: dailyEntitlements,
              });
              const soloGoAvailable = canAccessDaily({
                mode: 'go',
                dateKey,
                todayKey,
                unlocked: dailyEntitlements,
              });
              const soloOgCompleted = completedDaily.some(
                (session) => session.mode === 'og' && session.dateKey === dateKey,
              );
              const soloGoCompleted = completedDaily.some(
                (session) => session.mode === 'go' && session.dateKey === dateKey,
              );
              const soloOgState: CalendarLaneState = soloOgCompleted
                ? 'completed'
                : soloOgAvailable
                  ? 'available'
                  : 'locked';
              const soloGoState: CalendarLaneState = soloGoCompleted
                ? 'completed'
                : soloGoAvailable
                  ? 'available'
                  : 'locked';
              const combatOgState: CalendarLaneState = 'unavailable';
              const combatGoState: CalendarLaneState = 'unavailable';
              return (
                <div
                  role="gridcell"
                  key={index}
                  className={`calendar-day ${isToday ? 'is-today' : ''}`}
                  data-available={inRange ? 'true' : 'false'}
                  aria-label={`${date.toDateString()}${isToday ? ', today' : ''}`}
                  ref={isToday ? todayCellRef : undefined}
                >
                  <span>
                    {day}
                    {isToday ? <small>Today</small> : null}
                  </span>
                  <span className="day-states">
                    <CalendarLane
                      code="S-OG"
                      dateKey={dateKey}
                      label="Solo OG"
                      mode="og"
                      state={soloOgState}
                      selected={selectedDate === dateKey && selectedMode === 'og'}
                      unavailable={!inRange}
                      onSelect={() => selectSoloLane('og', dateKey)}
                    />
                    <CalendarLane
                      code="S-GO"
                      dateKey={dateKey}
                      label="Solo GO"
                      mode="go"
                      state={soloGoState}
                      selected={selectedDate === dateKey && selectedMode === 'go'}
                      unavailable={!inRange}
                      onSelect={() => selectSoloLane('go', dateKey)}
                    />
                    <CalendarLane
                      code="C-OG"
                      dateKey={dateKey}
                      label="Combat OG"
                      state={combatOgState}
                    />
                    <CalendarLane
                      code="C-GO"
                      dateKey={dateKey}
                      label="Combat GO"
                      state={combatGoState}
                    />
                  </span>
                </div>
              );
            })}
          </div>
        </section>
        <aside className="calendar-rail" ref={calendarRailRef}>
          <strong>{authStatus === 'loading' ? '— coins' : `${progression.coins} coins`}</strong>
          <span>{authStatus === 'loading' ? 'Checking identity' : 'Available'}</span>
          <hr />
          <h2>{selectedDate === todayKey ? 'Today’s Solo Daily' : 'Past Solo Daily'}</h2>
          <p className="calendar-selection">{selectedLabel}</p>
          {selectedIsPast ? (
            <>
              <strong>60 coins</strong>
              <p>{progression.coins} coins available</p>
              {selectedAllowed ? (
                <p>This past Daily is already available for this player.</p>
              ) : unlockShortfall > 0 ? (
                <p>{unlockShortfall} coin shortfall</p>
              ) : (
                <p>Balance covers this one-time unlock.</p>
              )}
              <p>Selection is free. Coins are charged only after confirmation.</p>
            </>
          ) : (
            <p>Today’s Daily is available without a coin unlock.</p>
          )}
          {selectedAllowed ? (
            <ButtonLink tone="primary" to={`/play/daily/${selectedMode}?date=${selectedDate}`}>
              Play {selectedMode.toUpperCase()} · {selectedDate}
            </ButtonLink>
          ) : (
            <Button
              aria-label={`Unlock Solo ${selectedMode.toUpperCase()} for ${selectedDate}`}
              disabled={authStatus === 'loading' || progression.coins < 60 || unlockingKey !== null}
              onClick={() => {
                const operationKey = `${selectedMode}:${selectedDate}`;
                if (unlockingKey !== null) return;
                setUnlockingKey(operationKey);
                void unlockDaily(selectedMode, selectedDate, todayKey)
                  .then((result) => {
                    setUnlockMessage(
                      result === 'unlocked'
                        ? `${selectedMode.toUpperCase()} entitlement saved for ${selectedDate}. It becomes permanent after the first saved guess.`
                        : result === 'insufficient'
                          ? 'Not enough coins. Earn coins by completing puzzles.'
                          : result === 'already'
                            ? 'This puzzle was already unlocked.'
                            : 'That date cannot be unlocked.',
                    );
                  })
                  .finally(() => setUnlockingKey(null));
              }}
            >
              {unlockingKey ? 'Saving unlock…' : `Unlock ${selectedMode.toUpperCase()} · 60 coins`}
            </Button>
          )}
          {unlockMessage ? <p role="status">{unlockMessage}</p> : null}
          <SectionHeading title="Legend" />
          <ul className="legend-list">
            <li>
              <span>○</span>Available
            </li>
            <li>
              <span>◇</span>Locked
            </li>
            <li>
              <span className="state-green">✓</span>Completed locally
            </li>
            <li>
              <span>—</span>Unavailable
            </li>
          </ul>
          <Disclosure
            label="OG Daily records"
            meta={`${completedDaily.filter((session) => session.mode === 'og').length} local`}
          >
            <p>Only completed Daily OG games for this player are counted.</p>
          </Disclosure>
          <Disclosure
            label="GO Daily records"
            meta={`${completedDaily.filter((session) => session.mode === 'go').length} local`}
          >
            <p>Only completed Daily GO games for this player are counted.</p>
          </Disclosure>
        </aside>
      </div>
    </div>
  );
}
