import { useMemo, useState } from 'react';
import { usePlayerState } from '../../app/player-state-context';
import { Button, ButtonLink } from '../../components/Button';
import { Disclosure } from '../../components/Disclosure';
import { Icon } from '../../components/Icon';
import { PageHeader, SectionHeading } from '../../components/Surface';
import { canAccessDaily, localDateKey } from '../../domain/daily';

const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type CalendarLaneState = 'available' | 'locked' | 'recorded' | 'unavailable';

const laneMarks: Record<CalendarLaneState, string> = {
  available: '○',
  locked: '◇',
  recorded: '●',
  unavailable: '—',
};

function laneDescription(label: string, state: CalendarLaneState): string {
  return `${label}: ${state}`;
}

function CalendarLane({
  code,
  label,
  state,
}: {
  code: 'S-OG' | 'S-GO' | 'C-OG' | 'C-GO';
  label: string;
  state: CalendarLaneState;
}) {
  return (
    <span
      className="day-state"
      data-state={state}
      role="img"
      aria-label={laneDescription(label, state)}
    >
      <span className="day-state__label" aria-hidden="true">
        {code}
      </span>
      <span className="day-state__mark" aria-hidden="true">
        {laneMarks[state]}
      </span>
    </span>
  );
}

export function CalendarPage() {
  const todayKey = localDateKey();
  const { progression, unlockDaily } = usePlayerState();
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [unlockMessage, setUnlockMessage] = useState('');
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
        <section className="calendar-panel" aria-labelledby="calendar-title">
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
                unlocked: progression.unlockedDailies,
              });
              const soloGoAvailable = canAccessDaily({
                mode: 'go',
                dateKey,
                todayKey,
                unlocked: progression.unlockedDailies,
              });
              const soloOgState: CalendarLaneState = soloOgAvailable ? 'available' : 'locked';
              const soloGoState: CalendarLaneState = soloGoAvailable ? 'available' : 'locked';
              const combatOgState: CalendarLaneState = 'recorded';
              const combatGoState: CalendarLaneState = 'unavailable';
              return (
                <button
                  type="button"
                  role="gridcell"
                  key={index}
                  className={`calendar-day ${isToday ? 'is-today' : ''}`}
                  disabled={!inRange}
                  onClick={() => {
                    setSelectedDate(localDateKey(date));
                    setUnlockMessage('');
                  }}
                  aria-label={`${date.toDateString()}${isToday ? ', today' : ''}. ${[
                    laneDescription('Solo OG', soloOgState),
                    laneDescription('Solo GO', soloGoState),
                    laneDescription('Combat OG', combatOgState),
                    laneDescription('Combat GO', combatGoState),
                  ].join('; ')}`}
                >
                  <span>
                    {day}
                    {isToday ? <small>Today</small> : null}
                  </span>
                  <span className="day-states">
                    <CalendarLane code="S-OG" label="Solo OG" state={soloOgState} />
                    <CalendarLane code="S-GO" label="Solo GO" state={soloGoState} />
                    <CalendarLane code="C-OG" label="Combat OG" state={combatOgState} />
                    <CalendarLane code="C-GO" label="Combat GO" state={combatGoState} />
                  </span>
                </button>
              );
            })}
          </div>
        </section>
        <aside className="calendar-rail">
          <strong>{progression.coins} coins</strong>
          <span>Available</span>
          <hr />
          <h2>
            {selectedDate === todayKey ? 'Today’s Solo Daily' : `Past Solo Daily · ${selectedDate}`}
          </h2>
          <strong>60 coins</strong>
          <p>Unlock a past Solo puzzle once. It remains unlocked after the first guess.</p>
          {(['og', 'go'] as const).map((mode) => {
            const allowed = canAccessDaily({
              mode,
              dateKey: selectedDate,
              todayKey,
              unlocked: progression.unlockedDailies,
            });
            return allowed ? (
              <ButtonLink
                key={mode}
                tone={mode === 'og' ? 'primary' : 'secondary'}
                to={`/play/daily/${mode}?date=${selectedDate}`}
              >
                Play {mode.toUpperCase()} · {selectedDate}
              </ButtonLink>
            ) : (
              <Button
                key={mode}
                disabled={progression.coins < 60}
                onClick={() => {
                  const result = unlockDaily(mode, selectedDate, todayKey);
                  setUnlockMessage(
                    result === 'unlocked'
                      ? `${mode.toUpperCase()} unlocked for ${selectedDate}.`
                      : result === 'insufficient'
                        ? 'Not enough coins. Earn coins by completing puzzles.'
                        : result === 'already'
                          ? 'This puzzle was already unlocked.'
                          : 'That date cannot be unlocked.',
                  );
                }}
              >
                Unlock {mode.toUpperCase()} · 60 coins
              </Button>
            );
          })}
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
              <span className="state-green">●</span>Recorded
            </li>
            <li>
              <span>—</span>Unavailable
            </li>
          </ul>
          <Disclosure label="OG streaks" meta="Open">
            <p>Current 3 · Best 8</p>
          </Disclosure>
          <Disclosure label="GO streaks" meta="Open">
            <p>Current 1 · Best 4</p>
          </Disclosure>
        </aside>
      </div>
    </div>
  );
}
