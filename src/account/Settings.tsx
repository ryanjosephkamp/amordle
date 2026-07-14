import { useEffect, useState } from 'react'
import { exportGuestProgress } from './guestStorage'
import type { GuestProgressState, GuestSettingsState } from './storageSchema'
import { DELETE_ACCOUNT_CONFIRMATION, RESET_PROGRESS_CONFIRMATION } from './dangerZone'
import type { AuthState } from './auth'
import type { SyncStatusState } from './syncStatus'
import { Button, Panel, Tooltip } from '../ui'
import { DIFFICULTY_TIERS, getDifficultyTierMeta, isDifficultyTier } from '../data/difficulty'
import { GO_PUZZLE_COUNTS, isGoPuzzleCount } from '../game/constants'
import {
  getBrowserNotificationPermissionState,
  getBrowserNotificationStatusDescription,
  getBrowserNotificationStatusLabel,
  requestBrowserNotificationPermission,
} from '../notifications/browserNotifications'
import {
  IN_APP_NOTIFICATION_MODES,
  NOTIFICATION_SOUND_MODES,
  getInAppNotificationModeDescription,
  getInAppNotificationModeLabel,
  getNotificationSoundModeDescription,
  getNotificationSoundModeLabel,
  isInAppNotificationMode,
  isNotificationSoundMode,
} from '../notifications/notificationPreferences'
import { THEMES, getThemeMeta, isTheme } from '../theme'
import type { MultiplayerRepository } from '../multiplayer/multiplayerRepository'

type PrivateRequestSettingsActions = Pick<MultiplayerRepository, 'getPrivateRequestPreference' | 'updatePrivateRequestPreference'>

interface SettingsProps {
  readonly authState: AuthState
  readonly authMessage?: string
  readonly guestProgress: GuestProgressState
  readonly onResetProgress: () => void
  readonly onSendMagicLink?: (email: string) => void
  readonly onSignInWithPassword?: (email: string, password: string) => void
  readonly onSignUpWithPassword?: (email: string, password: string) => void
  readonly onRequestPasswordReset?: (email: string) => void
  readonly onSignOut?: () => void
  readonly onOpenAuthModal?: () => void
  readonly onOpenProfilePanel?: () => void
  readonly onOpenPasswordChange?: () => void
  readonly onSyncNow?: () => void
  readonly soundEnabled?: boolean
  readonly onToggleSound?: (enabled: boolean) => void
  readonly onUpdateSettings?: (patch: Partial<GuestSettingsState>) => void
  readonly syncStatus: SyncStatusState
  readonly privateRequestSettingsActions?: PrivateRequestSettingsActions
}

export function Settings({
  authState,
  authMessage,
  guestProgress,
  onResetProgress,
  onSignOut,
  onOpenAuthModal,
  onOpenProfilePanel,
  onOpenPasswordChange,
  onSyncNow,
  soundEnabled,
  onToggleSound,
  onUpdateSettings,
  syncStatus,
  privateRequestSettingsActions,
}: SettingsProps) {
  const {
    difficultyDefault,
    goPuzzleCountDefault,
    hardModeDefault,
    themeDefault,
    dailyCountdownEnabled,
    dailyMultiplayerCountdownEnabled,
    inAppNotificationsEnabled,
    inAppNotificationMode,
    notificationSoundMode,
    browserNotificationsEnabled,
    privateRequestNotificationsEnabled,
  } = guestProgress.settings
  const [acceptPrivateRequests, setAcceptPrivateRequests] = useState(true)
  const [privateRequestPreferenceBusy, setPrivateRequestPreferenceBusy] = useState(false)
  const [privateRequestPreferenceMessage, setPrivateRequestPreferenceMessage] = useState<string>()
  useEffect(() => {
    if (authState.status !== 'authenticated' || !privateRequestSettingsActions) return
    let active = true
    void privateRequestSettingsActions.getPrivateRequestPreference().then((result) => {
      if (active) setAcceptPrivateRequests(result.acceptPrivatePracticeRequests)
    }).catch(() => { if (active) setPrivateRequestPreferenceMessage('Unable to load private request preference.') })
    return () => { active = false }
  }, [authState.status, privateRequestSettingsActions])
  const [browserNotificationPermission, setBrowserNotificationPermission] = useState(() => (
    getBrowserNotificationPermissionState()
  ))
  const browserNotificationsSupported = browserNotificationPermission !== 'unsupported'
  const browserNotificationsAllowed = browserNotificationPermission === 'granted'
  const canRequestBrowserNotifications = browserNotificationPermission === 'default'
  const browserNotificationsChecked = browserNotificationsEnabled && browserNotificationsAllowed
  const handleRequestBrowserNotifications = () => {
    void requestBrowserNotificationPermission().then((permission) => {
      setBrowserNotificationPermission(permission)
      if (permission !== 'granted') {
        onUpdateSettings?.({ browserNotificationsEnabled: false })
      }
    })
  }
  return (
    <section className="space-y-4" aria-labelledby="settings-title">
      <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--color-ice-200)]">account and persistence</p>
      <h2 id="settings-title" className="text-3xl font-bold text-white">Settings</h2>
      {onUpdateSettings ? (
        <Panel className="space-y-4 text-sm leading-6 text-slate-300" tone="muted">
          <h3 className="text-xl font-bold text-white">Gameplay</h3>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="font-semibold text-cyan-100" htmlFor="settings-difficulty">Default difficulty</label>
              <Tooltip className="shrink-0" label="More information about default difficulty">
                Difficulty only changes which answers can be chosen, never which guesses are allowed. Casual uses the most common answers, Standard adds more, and Expert allows every answer. The daily puzzle and any in-progress game keep their difficulty until you start a new one.
              </Tooltip>
            </div>
            <select
              className="w-full rounded-2xl border border-slate-700 bg-slate-950 p-2 text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)] sm:max-w-xs"
              id="settings-difficulty"
              onChange={(event) => { if (isDifficultyTier(event.target.value)) onUpdateSettings({ difficultyDefault: event.target.value }) }}
              value={difficultyDefault}
            >
              {DIFFICULTY_TIERS.map((tier) => (
                <option key={tier} value={tier}>{getDifficultyTierMeta(tier).label}</option>
              ))}
            </select>
            <p className="text-xs text-slate-400">{getDifficultyTierMeta(difficultyDefault).description}</p>
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="font-semibold text-cyan-100" htmlFor="settings-go-count">Default go chain length</label>
              <Tooltip className="shrink-0" label="More information about go chain length">
                Sets how many linked puzzles a go chain contains by default (5, 7, or 10). Each puzzle keeps its own word length; daily go puzzles stay 5 letters. You can override this per game from the Customize menu until your first guess.
              </Tooltip>
            </div>
            <select
              className="w-full rounded-2xl border border-slate-700 bg-slate-950 p-2 text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)] sm:max-w-xs"
              id="settings-go-count"
              onChange={(event) => { const next = Number(event.target.value); if (isGoPuzzleCount(next)) onUpdateSettings({ goPuzzleCountDefault: next }) }}
              value={goPuzzleCountDefault}
            >
              {GO_PUZZLE_COUNTS.map((count) => (
                <option key={count} value={count}>{count} puzzles</option>
              ))}
            </select>
            <p className="text-xs text-slate-400">Applies to new go chains. Override per game until your first guess.</p>
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="font-semibold text-cyan-100" htmlFor="settings-theme">Theme</label>
              <Tooltip className="shrink-0" label="More information about themes">
                Themes change only the accent and highlight colors (buttons, focus rings, headings). Layout and the tile colors that show correct, present, and absent letters never change, so puzzles stay just as readable.
              </Tooltip>
            </div>
            <select
              className="w-full rounded-2xl border border-slate-700 bg-slate-950 p-2 text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)] sm:max-w-xs"
              id="settings-theme"
              onChange={(event) => { if (isTheme(event.target.value)) onUpdateSettings({ themeDefault: event.target.value }) }}
              value={themeDefault}
            >
              {THEMES.map((theme) => (
                <option key={theme} value={theme}>{getThemeMeta(theme).label}</option>
              ))}
            </select>
            <p className="text-xs text-slate-400">{getThemeMeta(themeDefault).description}</p>
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-3 text-slate-100">
              <input
                checked={hardModeDefault}
                onChange={(event) => onUpdateSettings({ hardModeDefault: event.target.checked })}
                type="checkbox"
              />
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                Start games in Hard Mode by default
                <Tooltip className="shrink-0" label="More information about Hard Mode">
                  Hard Mode forces every guess to reuse all revealed hints (correct letters stay in place and present letters must be used). You can still toggle Hard Mode per game before your first guess.
                </Tooltip>
              </span>
            </label>
            <p className="text-xs text-slate-400">Applies to new games. You can still change it per game until your first guess.</p>
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-3 text-slate-100">
              <input
                checked={dailyCountdownEnabled}
                onChange={(event) => onUpdateSettings({ dailyCountdownEnabled: event.target.checked })}
                type="checkbox"
              />
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                Show the daily countdown and reset alerts
                <Tooltip className="shrink-0" label="More information about the daily countdown">
                  Shows a small, non-intrusive countdown to the next daily reset (at your local midnight) on every page. Tap it to jump to the daily game. When a new daily is ready you get a subtle glow and a short unique chime. Turn this off to hide the countdown everywhere and silence the reset alert.
                </Tooltip>
              </span>
            </label>
            <p className="text-xs text-slate-400">The daily still rolls over at your local midnight; this only controls the countdown and its alerts.</p>
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-3 text-slate-100">
              <input
                checked={dailyMultiplayerCountdownEnabled}
                onChange={(event) => onUpdateSettings({ dailyMultiplayerCountdownEnabled: event.target.checked })}
                type="checkbox"
              />
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                Show the Daily Multiplayer UTC countdown and reset alerts
                <Tooltip className="shrink-0" label="More information about the Daily Multiplayer countdown">
                  Daily Multiplayer closes at midnight UTC, separately from your solo daily reset. This countdown shows the UTC deadline on every page and plays its own reset chime when the multiplayer daily turns over.
                </Tooltip>
              </span>
            </label>
            <p className="text-xs text-slate-400">Daily Multiplayer uses midnight UTC. Toggle this off to hide only the multiplayer deadline and its unique alert sound.</p>
          </div>
        </Panel>
      ) : null}
      {onToggleSound ? (
        <Panel className="space-y-3 text-sm leading-6 text-slate-300" tone="muted">
          <h3 className="text-xl font-bold text-white">Sound effects</h3>
          <label className="flex items-center gap-3 text-slate-100">
            <input
              checked={Boolean(soundEnabled)}
              onChange={(event) => onToggleSound(event.target.checked)}
              type="checkbox"
            />
            <span>Play tile flips, key clicks, win/loss tones, and invalid-guess feedback.</span>
          </label>
          <p className="text-xs text-slate-400">On by default. Toggle off to silence every sound immediately.</p>
        </Panel>
      ) : null}
      {onUpdateSettings ? (
        <Panel className="space-y-4 text-sm leading-6 text-slate-300" tone="muted">
          <div className="space-y-1">
            <h3 className="text-xl font-bold text-white">Notifications</h3>
            <p className="text-xs text-slate-400">Preferences follow the current guest or signed-in progress scope. Read and dismissed item state stays local to this browser.</p>
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-3 text-slate-100">
              <input
                checked={inAppNotificationsEnabled}
                onChange={(event) => onUpdateSettings({ inAppNotificationsEnabled: event.target.checked })}
                type="checkbox"
              />
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                Show in-app notifications
                <Tooltip className="shrink-0" label="More information about in-app notifications">
                  Controls the Notification Center items and Home notification badge. Turning this off does not erase read or dismissed notification state.
                </Tooltip>
              </span>
            </label>
            <p className="text-xs text-slate-400">When disabled, existing notification metadata is preserved so items can stay read or dismissed if you turn notifications back on.</p>
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-3 text-slate-100">
              <input checked={privateRequestNotificationsEnabled} disabled={!inAppNotificationsEnabled} onChange={(event) => onUpdateSettings({ privateRequestNotificationsEnabled: event.target.checked })} type="checkbox" />
              <span>Show private Practice request notifications</span>
            </label>
            <p className="text-xs text-slate-400">Controls request lifecycle items only. It does not change whether other players may send requests.</p>
          </div>
          {authState.status === 'authenticated' && privateRequestSettingsActions ? (
            <div className="space-y-2">
              <label className="flex items-center gap-3 text-slate-100">
                <input checked={acceptPrivateRequests} disabled={privateRequestPreferenceBusy} onChange={(event) => {
                  const next = event.target.checked
                  setPrivateRequestPreferenceBusy(true)
                  void privateRequestSettingsActions.updatePrivateRequestPreference(next).then((result) => {
                    setAcceptPrivateRequests(result.acceptPrivatePracticeRequests)
                    setPrivateRequestPreferenceMessage('Private request preference saved.')
                  }).catch(() => setPrivateRequestPreferenceMessage('Unable to save private request preference.')).finally(() => setPrivateRequestPreferenceBusy(false))
                }} type="checkbox" />
                <span>Allow new private Practice requests</span>
              </label>
              <p className="text-xs text-slate-400">This signed-in account preference is enforced by the server.</p>
              {privateRequestPreferenceMessage ? <p className="text-xs font-semibold" role="status">{privateRequestPreferenceMessage}</p> : null}
            </div>
          ) : null}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="font-semibold text-cyan-100" htmlFor="settings-in-app-notification-mode">In-app notification level</label>
              <Tooltip className="shrink-0" label="More information about notification level">
                Important-only keeps Daily readiness, multiplayer turns, and completed-game alerts while hiding lower-priority Lobby and Live freshness cues.
              </Tooltip>
            </div>
            <select
              className="w-full rounded-2xl border border-slate-700 bg-slate-950 p-2 text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)] disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-xs"
              disabled={!inAppNotificationsEnabled}
              id="settings-in-app-notification-mode"
              onChange={(event) => {
                if (isInAppNotificationMode(event.target.value)) {
                  onUpdateSettings({ inAppNotificationMode: event.target.value })
                }
              }}
              value={inAppNotificationMode}
            >
              {IN_APP_NOTIFICATION_MODES.map((mode) => (
                <option key={mode} value={mode}>{getInAppNotificationModeLabel(mode)}</option>
              ))}
            </select>
            <p className="text-xs text-slate-400">{getInAppNotificationModeDescription(inAppNotificationMode)}</p>
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="font-semibold text-cyan-100" htmlFor="settings-notification-sound-mode">Notification sound mode</label>
              <Tooltip className="shrink-0" label="More information about notification sounds">
                Important-only sounds play for multiplayer turns and completed multiplayer matches. The master Sound effects toggle still silences every notification sound immediately.
              </Tooltip>
            </div>
            <select
              className="w-full rounded-2xl border border-slate-700 bg-slate-950 p-2 text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)] disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-xs"
              disabled={!inAppNotificationsEnabled}
              id="settings-notification-sound-mode"
              onChange={(event) => {
                if (isNotificationSoundMode(event.target.value)) {
                  onUpdateSettings({ notificationSoundMode: event.target.value })
                }
              }}
              value={notificationSoundMode}
            >
              {NOTIFICATION_SOUND_MODES.map((mode) => (
                <option key={mode} value={mode}>{getNotificationSoundModeLabel(mode)}</option>
              ))}
            </select>
            <p className="text-xs text-slate-400">{getNotificationSoundModeDescription(notificationSoundMode)}</p>
            <p className="text-xs text-slate-400">
              Master sound is currently {soundEnabled ? 'on' : 'off'}; turning it off silences all notification sounds.
            </p>
          </div>
          <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/55 p-3">
            <div className="space-y-1">
              <p className="font-semibold text-cyan-100">Browser notification controls</p>
              <p className="text-xs text-slate-400">
                Local and optional. This preference only allows foreground browser notifications after this browser grants permission; no service worker, push delivery, or background cross-device delivery is used.
              </p>
            </div>
            <p className="text-xs text-slate-400">
              Browser permission: <span className="font-semibold text-slate-200">{getBrowserNotificationStatusLabel(browserNotificationPermission)}</span>. {getBrowserNotificationStatusDescription(browserNotificationPermission)}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                disabled={!canRequestBrowserNotifications}
                onClick={handleRequestBrowserNotifications}
                variant="secondary"
              >
                Ask this browser for permission
              </Button>
              <label className="flex items-center gap-3 text-slate-100">
                <input
                  checked={browserNotificationsChecked}
                  disabled={!browserNotificationsSupported || !browserNotificationsAllowed}
                  onChange={(event) => onUpdateSettings({ browserNotificationsEnabled: event.target.checked })}
                  type="checkbox"
                />
                <span>Allow foreground browser notifications on this device</span>
              </label>
            </div>
            {!browserNotificationsAllowed && browserNotificationsEnabled ? (
              <p className="text-xs text-amber-200">
                Browser notification preference is saved, but this browser will not show notifications until permission is granted.
              </p>
            ) : null}
          </div>
        </Panel>
      ) : null}
      <Panel className="space-y-4 text-sm leading-6 text-slate-300" tone="muted">
        <h3 className="text-xl font-bold text-white">Account management</h3>
        {authState.status === 'authenticated' ? (
          <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/55 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-cyan-100">Signed in</p>
                <p className="break-words text-slate-300">{authState.user?.email ?? 'Authenticated Supabase user'}</p>
              </div>
              {onSignOut ? (
                <Button onClick={onSignOut} variant="secondary">Sign out</Button>
              ) : null}
            </div>
            <p>Profile is where you edit player identity. Settings is the account-management home for Sign out, password changes, cloud sync, progress export, reset, and gated account actions.</p>
            <div className="flex flex-wrap gap-2">
              {onOpenProfilePanel ? (
                <Button onClick={onOpenProfilePanel} variant="primary">Open Profile tab</Button>
              ) : null}
              {onOpenPasswordChange ? (
                <Button onClick={onOpenPasswordChange} variant="secondary">Change password</Button>
              ) : null}
            </div>
            <p className="text-xs text-slate-400">
              Email changes remain gated until Supabase email confirmation and redirect settings are verified for the deployed site.
            </p>
          </div>
        ) : authState.status === 'anonymous' ? (
          <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/55 p-3">
            <p className="font-semibold text-cyan-100">Sign in to amordle</p>
            <p>Open a clean dialog with Magic Link, Email + Password, and Forgot Password.</p>
            {onOpenAuthModal ? (
              <Button onClick={onOpenAuthModal} variant="primary">Sign in / Create account</Button>
            ) : (
              <p className="text-xs text-slate-400">Use the account menu or Profile tab to sign in when account controls are available.</p>
            )}
          </div>
        ) : (
          <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/55 p-3">
            <p className="font-semibold text-cyan-100">Account sync setup</p>
            <p>Supabase is not configured in this environment. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to enable sign-in and cloud sync.</p>
          </div>
        )}
        {authMessage ? (
          <p aria-live="polite" className="text-sm text-rose-200">{authMessage}</p>
        ) : null}
        <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/55 p-3">
          <p className="font-semibold text-cyan-100">Cloud sync</p>
          <p>{syncStatus.message}</p>
          <p>After sign-in, the active account progress syncs to Supabase. Guest progress stays on this device unless a reviewed transfer path is used.</p>
          {onSyncNow ? (
            <Button onClick={onSyncNow} variant="secondary">Sync now</Button>
          ) : null}
        </div>
        <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/55 p-3">
          <p className="font-semibold text-cyan-100">Current progress snapshot</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><p className="font-semibold text-cyan-100">Level</p><p>{guestProgress.progression.level}</p></div>
            <div><p className="font-semibold text-cyan-100">XP</p><p>{guestProgress.progression.xp}</p></div>
            <div><p className="font-semibold text-cyan-100">Coins</p><p>{guestProgress.progression.coins}</p></div>
          </div>
          <textarea
            className="h-40 w-full rounded-2xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-200"
            readOnly
            value={exportGuestProgress(guestProgress)}
          />
          <Button onClick={onResetProgress} variant="secondary">Reset current progress</Button>
        </div>
        <div className="space-y-2 rounded-2xl border border-slate-800 bg-slate-950/55 p-3">
          <p className="font-semibold text-cyan-100">Danger zone</p>
          <p>Destructive actions must require typed confirmations: `{RESET_PROGRESS_CONFIRMATION}` for local resets and `{DELETE_ACCOUNT_CONFIRMATION}` for account deletion.</p>
          <p>Password changes use the signed-in Supabase account session. Danger Zone actions stay separated from Profile saves and remain gated by typed confirmations.</p>
        </div>
      </Panel>
    </section>
  )
}
