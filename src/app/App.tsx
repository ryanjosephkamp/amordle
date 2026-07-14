import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react'
import type { OgGame as OgGameComponent } from './games/OgGame'
import type { GoGame as GoGameComponent } from './games/GoGame'
import type { CalendarPanel as CalendarPanelComponent } from '../calendar/CalendarPanel'
import type { SoloWorkspace as SoloWorkspaceComponent } from '../solo/SoloWorkspace'
import type { MultiplayerPanel as MultiplayerPanelComponent } from '../multiplayer/MultiplayerPanel'
import type { MultiplayerWorkspace as MultiplayerWorkspaceComponent } from '../multiplayer/MultiplayerWorkspace'
import type { MarketplacePanel as MarketplacePanelComponent } from '../marketplace/MarketplacePanel'
import type { HistoryWorkspace as HistoryWorkspaceComponent } from '../history/HistoryWorkspace'
import type { StatsDashboard as StatsDashboardComponent } from '../stats/StatsDashboard'
import type { LeaderboardPanel as LeaderboardPanelComponent } from '../leaderboards/LeaderboardPanel'
import type { PublicProfilePage as PublicProfilePageComponent } from '../account/PublicProfilePage'
import type { Settings as SettingsComponent } from '../account/Settings'
import type { AdminPanel as AdminPanelComponent } from '../admin/AdminPanel'
import { AccountBadge, AuthModal, AuthPanel, PasswordResetModal, ProfileEditor, ProfilePanel, advancePracticeSeedState, canSyncProgressForAuthState, classifyAuthError, clearPasswordResetUrlMarker, clearSoloCompletionDisplaySlots, createAccountPracticeSeed, createBrrrdleSupabaseClient, AUTHENTICATED_PROGRESS_AUTO_SYNC_DEBOUNCE_MS, canRefreshAuthenticatedProgress, createAuthenticatedProgressSyncRequest, createDefaultGuestProgress, createResumeSlot, createSoloCloudWriteQueue, createSupabaseProgressRepository, createSupabasePublicProfileRepository, createSupabaseSoloCloudProgressRepository, createSyncStatus, getCurrentAuthState, getLatestResumeSlot, getProgressScopeForAuthState, getResumeSlotKey, isCaptureComplete, isCaptureInProgress, isPasswordResetUrl, loadAuthenticatedProgressForScope, loadGuestProgress, loadSoloCompletionDisplaySlots, mergeSoloCloudSessionsIntoProgress, normalizeGuestSettings, normalizeResumeSlots, recordCompletedGame, saveGuestProgress, saveSoloCompletionDisplaySlots, sendPasswordResetEmail, sendMagicLink, shouldInvalidateAuthenticatedProgressSyncForAuthState, shouldPersistProgressToGuestStorage, signInWithPassword, signOut, signUpWithPassword, shouldApplyAuthenticatedProgressSyncResult, subscribeToAuthChanges, syncAuthenticatedProgress, syncGuestProgress, updatePassword, updateProfile, type ActiveProgressScope, type AuthState, type CompletedGameInput, type GuestProgressState, type OwnerPublicProfile, type PracticeSeedState, type ProfileAccentColor, type PublicProfileRepository, type PublicProfileUpdateInput, type ResumeCapture, type ResumeSlot, type ResumeSlotCollection, type SoloCloudMutation, type SoloCloudProgressRepository } from '../account'
import { BUNDLED_WORD_LIST_LENGTHS, type DifficultyTier } from '../data'
import { applyEconomyCommand, calculateCoinAward, createEconomySnapshot, type ConsumableType, type EconomyCommand } from '../progression'
import { createSupabaseEconomyRepository, toEconomySnapshot, type EconomyRepository } from '../account/economyRepository'
import { DAILY_WORD_LENGTH, MAX_PRACTICE_WORD_LENGTH, MIN_PRACTICE_WORD_LENGTH, type GoPuzzleCount } from '../game/constants'
import { Button, Panel } from '../ui'
import { createSupabaseAdminOperationalDashboardRepository, type AdminOperationalDashboardRepository } from '../admin'
import { createSupabasePublicSiteStatsRepository, type PublicSiteStatsRepository } from '../stats'
import { createSupabasePublicRankedLeaderboardRepository, type PublicRankedLeaderboardRepository } from '../leaderboards'
import { HelpPanel } from '../help'
import { FeedbackPanel } from '../feedback'
import { SoundProvider, useSound } from '../sound'
import { DailyCountdown, MULTIPLAYER_DAILY_VARIANT, SimulateTimePanel, useDailyCycle } from '../daily'
import { applySurfaceTheme, applyTheme, DEFAULT_SURFACE_THEME } from '../theme'
import {
  DashboardHome,
  createDashboardViewModel,
  dispatchDashboardAction,
  type DashboardActionHandlers,
  type DashboardActionTarget,
  type DashboardViewModel,
} from '../dashboard'
import {
  activateNotificationItem,
  createNotificationViewModel,
  dispatchBrowserNotification,
  dismissNotificationItem,
  getBrowserNotificationFingerprints,
  getBrowserNotificationPermissionState,
  getNotificationSoundFingerprints,
  loadNotificationMetadata,
  markNotificationItemRead,
  markVisibleNotificationItemsRead,
  NotificationCenter,
  saveNotificationMetadata,
  selectBrowserNotificationDispatches,
  selectNotificationSoundDecision,
  type NotificationItemViewModel,
  type NotificationMetadataState,
} from '../notifications'
import {
  INITIAL_MULTIPLAYER_RATING,
  MULTIPLAYER_ELO_EXPECTED_SCORE_SCALE,
  MULTIPLAYER_ESTABLISHED_K,
  MULTIPLAYER_PROVISIONAL_GAMES,
  MULTIPLAYER_PROVISIONAL_K,
  MULTIPLAYER_REPOSITORY_READINESS_EVENT,
  createLocalStorageMultiplayerRepository,
  loadAuthenticatedLiveSpectatorRows,
  loadPublicLiveSpectatorRows,
  createMultiplayerProfileSummary,
  createSupabaseMultiplayerRepository,
  loadMultiplayerRepositoryWithRetry,
  expireStaleDailyMultiplayerGames,
  expireTimedOutPracticeMultiplayerGames,
  getViewerMultiplayerPlayerId,
  isTrustedRankedSettlementCandidate,
  loadMultiplayerState,
  applyTrustedSettlementResult,
  joinMultiplayerGame,
  mergeMultiplayerStates,
  normalizeCompetitiveMultiplayerState,
  saveMultiplayerState,
  settleMultiplayerStateResults,
  type MultiplayerRepository,
  type MultiplayerState,
  type MultiplayerProfileSummary,
  type MultiplayerCompetitiveState,
  type AuthenticatedLiveSpectatorGame,
} from '../multiplayer'
import type { CalendarLaunchRequest } from '../calendar'
import { isSoloActiveGameKey, type SoloActiveGameKey, type SoloMode, type SoloScope } from '../solo/soloViewModels'
import { createRouteAttentionMap, createWorkspaceAttentionMap, type WorkspaceAttentionMap } from './attentionViewModels'
import { selectScopedProgressMultiplayerState } from './scopedProgressMultiplayerState'
import {
  areBrowserNavigationViewStatesEqual,
  createBrowserNavigationViewState,
  readCurrentBrowserNavigationViewState,
  resolveBrowserNavigationViewState,
  subscribeBrowserNavigationViewState,
  writeBrowserNavigationViewState,
  type BrowserNavigationViewState,
} from './browserNavigationHistory'
import { BackToTopButton } from './BackToTopButton'
import { GAMEPLAY_AUTOCENTER_TARGETS, scheduleGameplayAutoCenter } from './gameplayAutoCenter'
import { LunarSignalStage } from './LunarSignalStage'
import { ProgressionHud } from './ProgressionHud'
import { createRetryableLazyRoute } from './RetryableLazyRoute'
import { getPrimaryNavigationRoutes, getRouteById, type AppRoute, type AppRouteId } from './routes'
import { DEFAULT_NAVIGATION_STATE, loadNavigationState, saveNavigationState, type HistoryFilters, type LegacyPracticeMode, type MultiplayerSubtabId, type NavigationState, type PublicProfileReturnRoute, type SoloSubtabId } from './navigationState'

type PracticeMode = LegacyPracticeMode

const OgGame = createRetryableLazyRoute<ComponentProps<typeof OgGameComponent>>(
  () => import('./games/OgGame').then((module) => ({ default: module.OgGame })),
  'Solo OG',
)
const GoGame = createRetryableLazyRoute<ComponentProps<typeof GoGameComponent>>(
  () => import('./games/GoGame').then((module) => ({ default: module.GoGame })),
  'Solo GO',
)
const CalendarPanel = createRetryableLazyRoute<ComponentProps<typeof CalendarPanelComponent>>(
  () => import('../calendar/CalendarPanel').then((module) => ({ default: module.CalendarPanel })),
  'Calendar',
)
const SoloWorkspace = createRetryableLazyRoute<ComponentProps<typeof SoloWorkspaceComponent>>(
  () => import('../solo/SoloWorkspace').then((module) => ({ default: module.SoloWorkspace })),
  'Solo',
)
const MultiplayerPanel = createRetryableLazyRoute<ComponentProps<typeof MultiplayerPanelComponent>>(
  () => import('../multiplayer/MultiplayerPanel').then((module) => ({ default: module.MultiplayerPanel })),
  'Multiplayer game',
)
const MultiplayerWorkspace = createRetryableLazyRoute<ComponentProps<typeof MultiplayerWorkspaceComponent>>(
  () => import('../multiplayer/MultiplayerWorkspace').then((module) => ({ default: module.MultiplayerWorkspace })),
  'Multiplayer',
)
const MarketplacePanel = createRetryableLazyRoute<ComponentProps<typeof MarketplacePanelComponent>>(
  () => import('../marketplace/MarketplacePanel').then((module) => ({ default: module.MarketplacePanel })),
  'Marketplace',
)
const HistoryWorkspace = createRetryableLazyRoute<ComponentProps<typeof HistoryWorkspaceComponent>>(
  () => import('../history/HistoryWorkspace').then((module) => ({ default: module.HistoryWorkspace })),
  'History',
)
const WordExplorerPanel = createRetryableLazyRoute<Record<string, never>>(
  () => import('../wordExplorer/WordExplorerPanel').then((module) => ({ default: module.WordExplorerPanel })),
  'Word Explorer',
)
const StatsDashboard = createRetryableLazyRoute<ComponentProps<typeof StatsDashboardComponent>>(
  () => import('../stats/StatsDashboard').then((module) => ({ default: module.StatsDashboard })),
  'Stats',
)
const LeaderboardPanel = createRetryableLazyRoute<ComponentProps<typeof LeaderboardPanelComponent>>(
  () => import('../leaderboards/LeaderboardPanel').then((module) => ({ default: module.LeaderboardPanel })),
  'Leaderboard',
)
const PublicProfilePage = createRetryableLazyRoute<ComponentProps<typeof PublicProfilePageComponent>>(
  () => import('../account/PublicProfilePage').then((module) => ({ default: module.PublicProfilePage })),
  'Public profile',
)
const Settings = createRetryableLazyRoute<ComponentProps<typeof SettingsComponent>>(
  () => import('../account/Settings').then((module) => ({ default: module.Settings })),
  'Settings',
)
const AdminPanel = createRetryableLazyRoute<ComponentProps<typeof AdminPanelComponent>>(
  () => import('../admin/AdminPanel').then((module) => ({ default: module.AdminPanel })),
  'Admin',
)
type RankedQueueActions = Pick<
  MultiplayerRepository,
  'cancelRankedQueueRequest'
  | 'claimRankedQueuePair'
  | 'createRankedQueueRequest'
  | 'finalizeRankedQueueGame'
  | 'getRankedQueueStatus'
  | 'load'
>
type PracticeRematchActions = Pick<
  MultiplayerRepository,
  'acceptPracticeRematch'
  | 'cancelPracticeRematch'
  | 'declinePracticeRematch'
  | 'listPracticeRematchRequests'
  | 'requestPracticeRematch'
>
type ParticipantIdentityActions = Pick<
  MultiplayerRepository,
  'getParticipantIdentitySummaries'
>
type PrivateMatchActions = Pick<
  MultiplayerRepository,
  'acceptPrivateMatchRequest'
  | 'cancelPrivateMatchRequest'
  | 'createPrivateMatchRequest'
  | 'declinePrivateMatchRequest'
  | 'listPrivateMatchRequests'
  | 'getPrivateRequestPreference'
  | 'updatePrivateRequestPreference'
  | 'listPrivateRequestBlocks'
  | 'setPrivateRequestBlock'
  | 'load'
>

const LIVE_SPECTATOR_ACTIVE_POLL_INTERVAL_MS = 5_000
const MULTIPLAYER_STATE_READINESS_EVENT = 'brrrdle:multiplayer-state-readiness'

function reportMultiplayerStateReadiness(kind: 'expiry-applied' | 'progress-selected' | 'repository-applied', gameCount: number): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(MULTIPLAYER_STATE_READINESS_EVENT, {
    detail: { gameCount, kind },
  }))
}
const LIVE_SPECTATOR_IDLE_POLL_INTERVAL_MS = 30_000
export const RANKED_ELO_ABOUT_SECTION_ID = 'ranked-elo-about'

function isSameResumeSlot(left: ResumeSlot | undefined, right: ResumeSlot): boolean {
  if (!left) {
    return false
  }

  return left.difficulty === right.difficulty
    && left.mode === right.mode
    && left.scope === right.scope
    && left.wordLength === right.wordLength
    && (left.mode !== 'go' || (right.mode === 'go' && left.goPuzzleCount === right.goPuzzleCount))
    && JSON.stringify(left.serializedSession) === JSON.stringify(right.serializedSession)
}

function isStartupRouteHandoff(navigation: NavigationState): boolean {
  return navigation.activeRouteId === 'public-profile' && Boolean(navigation.selectedPublicProfileId)
}

function selectInitialNavigationState(browserNavigation: BrowserNavigationViewState | undefined): NavigationState {
  if (browserNavigation && isStartupRouteHandoff(browserNavigation.navigation)) {
    return browserNavigation.navigation
  }

  return DEFAULT_NAVIGATION_STATE
}

function setSoloDisplaySlot(slots: ResumeSlotCollection, slotKey: SoloActiveGameKey, slot: ResumeSlot): ResumeSlotCollection {
  if (isSameResumeSlot(slots[slotKey], slot)) {
    return slots
  }
  return { ...slots, [slotKey]: slot }
}

function clearSoloDisplaySlot(slots: ResumeSlotCollection, slotKey: SoloActiveGameKey): ResumeSlotCollection {
  if (!slots[slotKey]) {
    return slots
  }
  const nextSlots = { ...slots }
  delete nextSlots[slotKey]
  return nextSlots
}

function mergeSoloDisplaySlots(slots: ResumeSlotCollection, additions: ResumeSlotCollection): ResumeSlotCollection {
  let nextSlots = slots
  for (const key of Object.keys(additions) as SoloActiveGameKey[]) {
    const slot = additions[key]
    if (!slot) {
      continue
    }
    const currentSlot = nextSlots[key]
    if (currentSlot && currentSlot.updatedAt.localeCompare(slot.updatedAt) >= 0) {
      continue
    }
    nextSlots = setSoloDisplaySlot(nextSlots, key, slot)
  }
  return nextSlots
}

function selectPracticeSoloResumeSlot(completedSlot: ResumeSlot | undefined, resumeSlot: ResumeSlot | undefined): ResumeSlot | undefined {
  if (!completedSlot) {
    return resumeSlot
  }
  if (!resumeSlot) {
    return completedSlot
  }
  return resumeSlot.updatedAt.localeCompare(completedSlot.updatedAt) >= 0 ? resumeSlot : completedSlot
}

function hasSoloDisplaySlots(slots: ResumeSlotCollection): boolean {
  return Object.keys(slots).length > 0
}

function getProgressOwnerKey(scope: ActiveProgressScope): string {
  return scope.kind === 'authenticated' ? `account:${scope.userId}` : scope.kind
}

function getPracticeSoloSlotKey(mode: PracticeMode): SoloActiveGameKey {
  return mode === 'go' ? 'practice-go' : 'practice-og'
}

function clearProgressResumeSlot(progress: GuestProgressState, slotKey: SoloActiveGameKey): GuestProgressState {
  const currentSlots = normalizeResumeSlots(progress.resumeSlots)
  const currentLegacySlotMatches = progress.resumeSlot ? getResumeSlotKey(progress.resumeSlot) === slotKey : false
  if (!currentSlots[slotKey] && !currentLegacySlotMatches) {
    return progress
  }

  const nextSlots = { ...currentSlots }
  delete nextSlots[slotKey]
  const resumeSlotsForSave = Object.keys(nextSlots).length > 0 ? nextSlots : undefined
  return {
    ...progress,
    resumeSlot: getLatestResumeSlot(resumeSlotsForSave ?? {}),
    resumeSlots: resumeSlotsForSave,
  }
}

function getCurrentPracticeCloudSeeds(userId: string, progress: GuestProgressState): { readonly go: number; readonly og: number } {
  return {
    go: createAccountPracticeSeed('go', userId, progress.practiceSeeds.go),
    og: createAccountPracticeSeed('og', userId, progress.practiceSeeds.og),
  }
}

function PracticeGameSwitcher({
  multiplayer,
  coins,
  consumables,
  competitiveMultiplayer,
  defaultDifficulty,
  defaultGoPuzzleCount,
  defaultHardMode,
  keyboardDisabled,
  onMultiplayerChange,
  onCompetitiveMultiplayerChange,
  onGameComplete,
  onPracticeModeChange,
  onPracticeSeedAdvance,
  onResumeCapture,
  onSoloCloudMutation,
  onSaveDifficultyDefault,
  onSaveGoPuzzleCountDefault,
  onConsumeConsumable,
  onSpendCoins,
  onOpenEloAbout,
  practiceMode,
  practiceSeeds,
  progressOwnerKey,
  postgameActions,
  privateMatchActions,
  participantIdentityActions,
  rankedQueueActions,
  resumeSlots,
  completedSoloSlots,
  authStatus,
  viewerUserId,
  viewerProfile,
}: {
  readonly authStatus: AuthState['status']
  readonly multiplayer?: MultiplayerState
  readonly coins: number
  readonly consumables: GuestProgressState['progression']['consumables']
  readonly competitiveMultiplayer?: MultiplayerCompetitiveState
  readonly defaultDifficulty: DifficultyTier
  readonly defaultGoPuzzleCount: GoPuzzleCount
  readonly defaultHardMode: boolean
  readonly keyboardDisabled?: boolean
  readonly onMultiplayerChange: (state: MultiplayerState) => void | Promise<{ readonly error?: string }>
  readonly onCompetitiveMultiplayerChange: (state: MultiplayerCompetitiveState) => void
  readonly onGameComplete: (input: CompletedGameInput) => void
  readonly onPracticeModeChange: (mode: PracticeMode) => void
  readonly onPracticeSeedAdvance: (mode: PracticeMode) => void
  readonly onResumeCapture: (capture: ResumeCapture) => void
  readonly onSoloCloudMutation?: (mutation: SoloCloudMutation) => void
  readonly onSaveDifficultyDefault: (tier: DifficultyTier) => void
  readonly onSaveGoPuzzleCountDefault: (count: GoPuzzleCount) => void
  readonly onConsumeConsumable: (type: ConsumableType, operationId: string) => boolean | Promise<boolean>
  readonly onSpendCoins: (amount: number, operationId?: string) => boolean | Promise<boolean>
  readonly practiceMode: PracticeMode
  readonly practiceSeeds: PracticeSeedState
  readonly progressOwnerKey: string
  readonly postgameActions?: PracticeRematchActions
  readonly privateMatchActions?: PrivateMatchActions
  readonly participantIdentityActions?: ParticipantIdentityActions
  readonly rankedQueueActions?: RankedQueueActions
  readonly resumeSlots: ResumeSlotCollection
  readonly completedSoloSlots: ResumeSlotCollection
  readonly viewerUserId?: string
  readonly viewerProfile?: MultiplayerProfileSummary
  readonly onOpenEloAbout?: () => void
}) {
  const practiceOgResume = selectPracticeSoloResumeSlot(completedSoloSlots['practice-og'], resumeSlots['practice-og'])
  const practiceGoResume = selectPracticeSoloResumeSlot(completedSoloSlots['practice-go'], resumeSlots['practice-go'])

  return (
    <section className="space-y-5" aria-label="Practice mode selector">
      <div className="flex flex-wrap gap-2 rounded-lg border border-white/10 bg-slate-950/75 p-2 shadow-inner shadow-white/5">
        <Button onClick={() => onPracticeModeChange('og')} variant={practiceMode === 'og' ? 'primary' : 'secondary'}>og practice</Button>
        <Button onClick={() => onPracticeModeChange('go')} variant={practiceMode === 'go' ? 'primary' : 'secondary'}>go practice</Button>
      </div>
      {practiceMode === 'og'
        ? <OgGame key={`practice-og-${progressOwnerKey}`} coins={coins} consumables={consumables} defaultDifficulty={defaultDifficulty} defaultHardMode={defaultHardMode} initialResume={practiceOgResume?.mode === 'og' ? practiceOgResume : undefined} keyboardDisabled={keyboardDisabled} onAdvancePracticeSeed={() => onPracticeSeedAdvance('og')} onConsumeConsumable={onConsumeConsumable} onGameComplete={onGameComplete} onResumeCapture={onResumeCapture} onSaveDifficultyDefault={onSaveDifficultyDefault} onSoloCloudMutation={onSoloCloudMutation} onSpendCoins={onSpendCoins} practiceSeedCounter={practiceSeeds.og} practiceSeedUserId={viewerUserId} progressOwnerKey={progressOwnerKey} scope="practice" />
        : <GoGame key={`practice-go-${progressOwnerKey}`} coins={coins} consumables={consumables} defaultDifficulty={defaultDifficulty} defaultGoPuzzleCount={defaultGoPuzzleCount} defaultHardMode={defaultHardMode} initialResume={practiceGoResume?.mode === 'go' ? practiceGoResume : undefined} keyboardDisabled={keyboardDisabled} onAdvancePracticeSeed={() => onPracticeSeedAdvance('go')} onConsumeConsumable={onConsumeConsumable} onGameComplete={onGameComplete} onResumeCapture={onResumeCapture} onSaveDifficultyDefault={onSaveDifficultyDefault} onSaveGoPuzzleCountDefault={onSaveGoPuzzleCountDefault} onSoloCloudMutation={onSoloCloudMutation} onSpendCoins={onSpendCoins} practiceSeedCounter={practiceSeeds.go} practiceSeedUserId={viewerUserId} progressOwnerKey={progressOwnerKey} scope="practice" />}
      <MultiplayerPanel
        authStatus={authStatus}
        competitiveState={competitiveMultiplayer}
        defaultDifficulty={defaultDifficulty}
        defaultGoPuzzleCount={defaultGoPuzzleCount}
        onChange={onMultiplayerChange}
        onCompetitiveChange={onCompetitiveMultiplayerChange}
        onOpenEloAbout={onOpenEloAbout}
        postgameActions={postgameActions}
        privateMatchActions={privateMatchActions}
        participantIdentityActions={participantIdentityActions}
        rankedQueueActions={rankedQueueActions}
        scope="practice"
        state={multiplayer}
        viewerProfile={viewerProfile}
        viewerUserId={viewerUserId}
      />
    </section>
  )
}

export function AboutBrrrdlePanel() {
  return (
    <section className="space-y-5" aria-labelledby="about-brrrdle-title">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--color-ice-200)]">About</p>
        <h2 id="about-brrrdle-title" className="text-3xl font-bold text-white">About amordle</h2>
        <p className="max-w-3xl text-base leading-7 text-slate-300">
          amordle is a word-game playground built around og single boards, go chains, daily puzzles, and wide-range practice lengths.
        </p>
      </div>

      <Panel className="grid gap-4 text-sm leading-6 text-slate-300 md:grid-cols-3" tone="muted">
        <div>
          <p className="font-semibold text-cyan-100">Game modes</p>
          <p>OG plays one board at a time, while GO links multiple boards into a chain across Solo and Multiplayer.</p>
        </div>
        <div>
          <p className="font-semibold text-cyan-100">Word lists</p>
          <p>Answer banks, valid guesses, difficulty tiers, and definitions are bundled into the local word library.</p>
        </div>
        <div>
          <p className="font-semibold text-cyan-100">Credits</p>
          <p>Release notes, design notes, feedback, and account controls live in their dedicated workspaces.</p>
        </div>
      </Panel>

      <Panel className="space-y-4 text-sm leading-6 text-slate-300" tone="muted">
        <div className="space-y-1">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100">Rules and surfaces</p>
          <h3 className="text-2xl font-bold text-white">Current amordle reference</h3>
          <p>
            Help stays focused on quick orientation. This page keeps the deeper reference material for modes, public surfaces, and multiplayer boundaries.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-black/30 p-3">
            <p className="font-semibold text-cyan-100">Daily and Practice</p>
            <p className="mt-1">
              Daily games are fixed shared puzzles. Practice games are configurable before the first submitted guess, including word length, difficulty, GO chain length, and Hard Mode where the mode allows it.
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/30 p-3">
            <p className="font-semibold text-cyan-100">OG and GO</p>
            <p className="mt-1">
              OG is one board. GO is a chain of boards where prior solved rows carry forward as visible context while each board keeps its own answer.
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/30 p-3">
            <p className="font-semibold text-cyan-100">Multiplayer boundaries</p>
            <p className="mt-1">
              Practice Multiplayer supports OG, GO, lobbies, private Practice requests, active-game resume, and signed-in ranked Practice. Daily Multiplayer stays asynchronous, five letters, UTC-day keyed, and separate from Solo Daily.
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/30 p-3">
            <p className="font-semibold text-cyan-100">Public surfaces</p>
            <p className="mt-1">
              Leaderboards show eligible public ranked Practice and ranked Daily rows. Public profile links use approved public fields only, Stats separates private local play from aggregate site totals, History keeps completed results browsable, and public or guest Live spectator surfaces stay read-only with Daily spectator access excluded.
            </p>
          </div>
        </div>
      </Panel>

      <Panel className="space-y-4 text-sm leading-6 text-slate-300" tone="muted">
        <section
          aria-labelledby="ranked-elo-about-title"
          className="space-y-4"
          id={RANKED_ELO_ABOUT_SECTION_ID}
          tabIndex={-1}
        >
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-100">Ranked transparency</p>
            <h3 id="ranked-elo-about-title" className="text-2xl font-bold text-white">How Elo is calculated</h3>
            <p>
              Ranked matchmaking is signed-in only. Untimed Practice, canonical five-minute Practice, and ranked Daily OG/GO use separate rating buckets. Ranked Daily uses fixed five-letter, no-clock OG and GO queues; custom ranked games and unsupported timers remain deferred. Public leaderboards are display-only surfaces separate from Elo authority.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-black/30 p-3">
              <p className="font-semibold text-cyan-100">Rating buckets</p>
              <p className="mt-1">
                Each mode has its own ranked bucket, such as multiplayer OG or multiplayer GO. Every bucket starts at {INITIAL_MULTIPLAYER_RATING}, so an OG rating and a GO rating can move independently.
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/30 p-3">
              <p className="font-semibold text-cyan-100">Provisional games and K factor</p>
              <p className="mt-1">
                K is the rating-movement multiplier. Your first {MULTIPLAYER_PROVISIONAL_GAMES} ranked Practice games in a bucket are provisional and use K={MULTIPLAYER_PROVISIONAL_K}; established games use K={MULTIPLAYER_ESTABLISHED_K} for steadier movement.
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/30 p-3">
              <p className="font-semibold text-cyan-100">Expected score</p>
              <p className="mt-1">
                amordle uses the standard {MULTIPLAYER_ELO_EXPECTED_SCORE_SCALE}-point Elo curve.
              </p>
              <div
                aria-label="Expected score formula"
                className="mt-2 overflow-x-auto rounded-lg border border-cyan-300/20 bg-slate-950/80 px-3 py-2 font-mono text-xs not-italic text-cyan-50"
              >
                expected score = 1 / (1 + 10 ^ ((opponent rating - your rating) / {MULTIPLAYER_ELO_EXPECTED_SCORE_SCALE}))
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/30 p-3">
              <p className="font-semibold text-cyan-100">Outcome scores</p>
              <p className="mt-1">
                Wins count as 1, draws count as 0.5, and losses count as 0. Your rating delta is K times the difference between your actual outcome score and your expected score, rounded to a whole number.
              </p>
            </div>
          </div>

          <p className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-3 text-cyan-50">
            Match points decide the match result first. Elo movement happens afterward only when trusted settlement confirms server-authorized ranked Practice or ranked Daily evidence against your rival's rating. Local previews, spectators, custom games, unranked Daily games, unsupported timed Practice games, guest games, corrupt evidence, and other unranked games do not move Elo.
          </p>
        </section>
      </Panel>
    </section>
  )
}

function CurrentPlayerProfileRoute({
  authMessage,
  authState,
  busy,
  onRequestPasswordReset,
  onOpenSettings,
  onSave,
  onSavePublicProfile,
  onSendMagicLink,
  onSignInWithPassword,
  onSignOut,
  onSignUpWithPassword,
  publicProfile,
  publicProfileBusy,
  publicProfileStatusMessage,
  statusMessage,
  supabaseClient,
}: {
  readonly authMessage?: string
  readonly authState: AuthState
  readonly busy?: boolean
  readonly onRequestPasswordReset: (email: string) => void
  readonly onOpenSettings: () => void
  readonly onSave: (input: { readonly displayName?: string; readonly accentColor?: ProfileAccentColor; readonly avatarUrl?: string }) => Promise<void> | void
  readonly onSavePublicProfile?: (input: PublicProfileUpdateInput) => Promise<void> | void
  readonly onSendMagicLink: (email: string) => void
  readonly onSignInWithPassword: (email: string, password: string) => void
  readonly onSignOut: () => void
  readonly onSignUpWithPassword: (email: string, password: string) => void
  readonly publicProfile?: OwnerPublicProfile
  readonly publicProfileBusy?: boolean
  readonly publicProfileStatusMessage?: string
  readonly statusMessage?: string
  readonly supabaseClient?: ReturnType<typeof createBrrrdleSupabaseClient>
}) {
  return (
    <section className="space-y-4" aria-labelledby="profile-title">
      <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--color-ice-200)]">current player</p>
      <div className="space-y-2">
        <h2 id="profile-title" className="text-3xl font-bold text-white">Profile</h2>
        <p className="max-w-3xl text-sm leading-6 text-slate-300">
          Manage the Player name and player-card details other signed-in players can see.
        </p>
      </div>

      {authState.status === 'authenticated' ? (
        <Panel className="space-y-4 text-sm leading-6 text-slate-300" tone="muted">
          <ProfileEditor
            authState={authState}
            busy={busy}
            onOpenSettings={onOpenSettings}
            onSave={onSave}
            onSavePublicProfile={onSavePublicProfile}
            onSignOut={onSignOut}
            publicProfile={publicProfile}
            publicProfileBusy={publicProfileBusy}
            publicProfileStatusMessage={publicProfileStatusMessage}
            statusMessage={statusMessage}
            supabaseClient={supabaseClient}
          />
        </Panel>
      ) : authState.status === 'anonymous' ? (
        <Panel className="space-y-4 text-sm leading-6 text-slate-300" tone="muted">
          <div className="space-y-1">
            <h3 className="text-xl font-bold text-white">Sign in to manage your profile</h3>
            <p>Your Player name, account controls, and player-card details appear here after sign-in.</p>
          </div>
          <AuthPanel
            authMessage={authMessage}
            authStatus={authState.status}
            onRequestPasswordReset={onRequestPasswordReset}
            onSendMagicLink={onSendMagicLink}
            onSignInWithPassword={onSignInWithPassword}
            onSignOut={onSignOut}
            onSignUpWithPassword={onSignUpWithPassword}
          />
        </Panel>
      ) : (
        <Panel className="space-y-2 text-sm leading-6 text-slate-300" tone="muted">
          <h3 className="text-xl font-bold text-white">Profile sync unavailable</h3>
          <p>Profile editing requires Supabase account configuration in this environment.</p>
        </Panel>
      )}
    </section>
  )
}

function RoutePanel({
  dashboard,
  route,
  keyboardDisabled,
  multiplayer,
  liveSpectatorRows,
  guestProgress,
  onGameComplete,
  onMultiplayerChange,
  onCompetitiveMultiplayerChange,
  authState,
  authMessage,
  onResetProgress,
  onResumeCapture,
  onSoloCloudMutation,
  onDashboardAction,
  onSelectRoute,
  onSelectMultiplayerGame,
  onSoloDailyModeChange,
  onOpenSoloHistory,
  onOpenMultiplayerHistory,
  onOpenFocusedLiveSpectatorGame,
  onCloseFocusedLiveSpectatorGame,
  onLiveSurfaceActiveChange,
  onHistoryFiltersChange,
  onResumeSoloGame,
  onResumeMultiplayerGame,
  onSoloSubtabChange,
  onMultiplayerSubtabChange,
  onSendMagicLink,
  onRequestPasswordReset,
  onSignInWithPassword,
  onSignUpWithPassword,
  onConsumeConsumable,
  onPurchaseConsumable,
  onSpendCoins,
  onSignOut,
  onSaveProfile,
  onSavePublicProfile,
  onOpenAuthModal,
  onOpenSettings,
  onOpenProfilePanel,
  onOpenPublicProfile,
  onOpenPasswordChange,
  onSyncNow,
  onPracticeModeChange,
  onPracticeSeedAdvance,
  practiceMode,
  soloDailyMode,
  soloSubtab,
  selectedMultiplayerGameId,
  selectedPublicProfileId,
  publicProfileReturnRoute,
  focusedLiveSpectatorGameId,
  multiplayerSubtab,
  historyFilters,
  profileBusy,
  profileMessage,
  publicProfile,
  publicProfileBusy,
  publicProfileMessage,
  resumeSlots,
  completedSoloSlots,
  progressOwnerKey,
  soundEnabled,
  onToggleSound,
  onUpdateSettings,
  supabaseClient,
  syncStatus,
  workspaceAttention,
  todayDateKey,
  multiplayerDailyDateKey,
  onMarkPastDailyUnlocked,
  calendarLaunch,
  onCalendarLaunchConsumed,
  postgameActions,
  privateMatchActions,
  participantIdentityActions,
  rankedQueueActions,
  onOpenEloAbout,
  publicProfileRepository,
  publicRankedLeaderboardRepository,
  publicSiteStatsRepository,
  adminDashboardRepository,
}: {
  readonly authState: AuthState
  readonly authMessage?: string
  readonly dashboard: DashboardViewModel
  readonly multiplayer: MultiplayerState
  readonly liveSpectatorRows: readonly AuthenticatedLiveSpectatorGame[]
  readonly guestProgress: ReturnType<typeof loadGuestProgress>
  readonly keyboardDisabled?: boolean
  readonly onGameComplete: (input: CompletedGameInput) => void
  readonly onMultiplayerChange: (state: MultiplayerState) => void | Promise<{ readonly error?: string }>
  readonly onCompetitiveMultiplayerChange: (state: MultiplayerCompetitiveState) => void
  readonly onDashboardAction: (target: DashboardActionTarget) => void
  readonly onResetProgress: () => void
  readonly onResumeCapture: (capture: ResumeCapture) => void
  readonly onSoloCloudMutation?: (mutation: SoloCloudMutation) => void
  readonly onPracticeModeChange: (mode: PracticeMode) => void
  readonly onPracticeSeedAdvance: (mode: PracticeMode) => void
  readonly onSelectMultiplayerGame: (id: string) => void
  readonly onSoloDailyModeChange: (mode: SoloMode) => void
  readonly onOpenSoloHistory: (filters?: { readonly mode?: SoloMode; readonly scope?: SoloScope }) => void
  readonly onOpenMultiplayerHistory: () => void
  readonly onOpenFocusedLiveSpectatorGame: (id: string) => void
  readonly onCloseFocusedLiveSpectatorGame: () => void
  readonly onLiveSurfaceActiveChange: (active: boolean) => void
  readonly onHistoryFiltersChange: (filters: HistoryFilters) => void
  readonly onResumeSoloGame: (key: SoloActiveGameKey) => void
  readonly onResumeMultiplayerGame: (id: string) => void
  readonly onSendMagicLink: (email: string) => void
  readonly onRequestPasswordReset: (email: string) => void
  readonly onSignInWithPassword: (email: string, password: string) => void
  readonly onSignUpWithPassword: (email: string, password: string) => void
  readonly onConsumeConsumable: (type: ConsumableType, operationId: string) => boolean | Promise<boolean>
  readonly onPurchaseConsumable: (type: ConsumableType) => boolean | Promise<boolean>
  readonly onSignOut: () => void
  readonly onSaveProfile: (input: { readonly displayName?: string; readonly accentColor?: ProfileAccentColor; readonly avatarUrl?: string }) => Promise<void> | void
  readonly onSavePublicProfile: (input: PublicProfileUpdateInput) => Promise<void> | void
  readonly onOpenAuthModal: () => void
  readonly onOpenSettings: () => void
  readonly onOpenProfilePanel: () => void
  readonly onOpenPublicProfile: (publicProfileId: string, returnRoute?: PublicProfileReturnRoute) => void
  readonly onOpenPasswordChange: () => void
  readonly onSyncNow: () => void
  readonly practiceMode: PracticeMode
  readonly soloDailyMode: SoloMode
  readonly selectedMultiplayerGameId?: string
  readonly selectedPublicProfileId?: string
  readonly publicProfileReturnRoute?: PublicProfileReturnRoute
  readonly focusedLiveSpectatorGameId?: string
  readonly resumeSlots: ResumeSlotCollection
  readonly progressOwnerKey: string
  readonly route: AppRoute
  readonly onSelectRoute: (routeId: AppRouteId) => void
  readonly soloSubtab: SoloSubtabId
  readonly multiplayerSubtab: MultiplayerSubtabId
  readonly historyFilters: ReturnType<typeof loadNavigationState>['historyFilters']
  readonly profileBusy?: boolean
  readonly profileMessage?: string
  readonly publicProfile?: OwnerPublicProfile
  readonly publicProfileBusy?: boolean
  readonly publicProfileMessage?: string
  readonly onSoloSubtabChange: (subtab: SoloSubtabId) => void
  readonly onMultiplayerSubtabChange: (subtab: MultiplayerSubtabId) => void
  readonly soundEnabled: boolean
  readonly completedSoloSlots: ResumeSlotCollection
  readonly onToggleSound: (enabled: boolean) => void
  readonly onUpdateSettings: (patch: Partial<ReturnType<typeof loadGuestProgress>['settings']>) => void
  readonly supabaseClient: ReturnType<typeof createBrrrdleSupabaseClient>
  readonly syncStatus: ReturnType<typeof createSyncStatus>
  readonly workspaceAttention: WorkspaceAttentionMap
  readonly onSpendCoins: (amount: number, operationId?: string) => boolean | Promise<boolean>
  readonly todayDateKey: string
  readonly multiplayerDailyDateKey: string
  readonly onMarkPastDailyUnlocked: (mode: 'og' | 'go', dateKey: string) => void
  readonly calendarLaunch: CalendarLaunchRequest | null
  readonly onCalendarLaunchConsumed: () => void
  readonly postgameActions?: PracticeRematchActions
  readonly privateMatchActions?: PrivateMatchActions
  readonly participantIdentityActions?: ParticipantIdentityActions
  readonly rankedQueueActions?: RankedQueueActions
  readonly onOpenEloAbout?: () => void
  readonly publicProfileRepository?: Pick<PublicProfileRepository, 'loadPublicProfile'>
  readonly publicRankedLeaderboardRepository?: PublicRankedLeaderboardRepository
  readonly publicSiteStatsRepository?: PublicSiteStatsRepository
  readonly adminDashboardRepository?: AdminOperationalDashboardRepository
}) {
  const dailyOgResume = completedSoloSlots['daily-og'] ?? resumeSlots['daily-og']
  const dailyGoResume = completedSoloSlots['daily-go'] ?? resumeSlots['daily-go']
  const practiceOgResume = selectPracticeSoloResumeSlot(completedSoloSlots['practice-og'], resumeSlots['practice-og'])
  const practiceGoResume = selectPracticeSoloResumeSlot(completedSoloSlots['practice-go'], resumeSlots['practice-go'])
  const viewerProfile = authState.status === 'authenticated' && authState.user?.profile
    ? createMultiplayerProfileSummary(authState.user.profile, 'Player')
    : undefined
  const requestMultiplayerGameplayAutoCenter = useCallback(() => {
    scheduleGameplayAutoCenter(GAMEPLAY_AUTOCENTER_TARGETS.multiplayer)
  }, [])
  const renderSoloDailyGame = (mode: SoloMode) => mode === 'og'
    ? (
      <OgGame
        coins={guestProgress.progression.coins}
        defaultDifficulty={guestProgress.settings.difficultyDefault}
        defaultHardMode={guestProgress.settings.hardModeDefault}
        initialResume={dailyOgResume?.mode === 'og' ? dailyOgResume : undefined}
        keyboardDisabled={keyboardDisabled}
        onGameComplete={onGameComplete}
        onResumeCapture={onResumeCapture}
        onSaveDifficultyDefault={(tier) => onUpdateSettings({ difficultyDefault: tier })}
        onSoloCloudMutation={onSoloCloudMutation}
        onSpendCoins={onSpendCoins}
        progressOwnerKey={progressOwnerKey}
        scope="daily"
      />
    )
    : (
      <GoGame
        coins={guestProgress.progression.coins}
        defaultDifficulty={guestProgress.settings.difficultyDefault}
        defaultGoPuzzleCount={guestProgress.settings.goPuzzleCountDefault}
        defaultHardMode={guestProgress.settings.hardModeDefault}
        initialResume={dailyGoResume?.mode === 'go' ? dailyGoResume : undefined}
        keyboardDisabled={keyboardDisabled}
        onGameComplete={onGameComplete}
        onResumeCapture={onResumeCapture}
        onSaveDifficultyDefault={(tier) => onUpdateSettings({ difficultyDefault: tier })}
        onSaveGoPuzzleCountDefault={(count) => onUpdateSettings({ goPuzzleCountDefault: count })}
        onSoloCloudMutation={onSoloCloudMutation}
        onSpendCoins={onSpendCoins}
        progressOwnerKey={progressOwnerKey}
        scope="daily"
      />
    )
  const renderSoloPracticeGame = (mode: SoloMode) => mode === 'og'
    ? (
      <OgGame
        key={`solo-practice-og-${progressOwnerKey}`}
        coins={guestProgress.progression.coins}
        consumables={guestProgress.progression.consumables}
        defaultDifficulty={guestProgress.settings.difficultyDefault}
        defaultHardMode={guestProgress.settings.hardModeDefault}
        initialResume={practiceOgResume?.mode === 'og' ? practiceOgResume : undefined}
        keyboardDisabled={keyboardDisabled}
        onAdvancePracticeSeed={() => onPracticeSeedAdvance('og')}
        onConsumeConsumable={onConsumeConsumable}
        onGameComplete={onGameComplete}
        onResumeCapture={onResumeCapture}
        onSaveDifficultyDefault={(tier) => onUpdateSettings({ difficultyDefault: tier })}
        onSoloCloudMutation={onSoloCloudMutation}
        onSpendCoins={onSpendCoins}
        practiceSeedCounter={guestProgress.practiceSeeds.og}
        practiceSeedUserId={authState.user?.id}
        progressOwnerKey={progressOwnerKey}
        scope="practice"
      />
    )
    : (
      <GoGame
        key={`solo-practice-go-${progressOwnerKey}`}
        coins={guestProgress.progression.coins}
        consumables={guestProgress.progression.consumables}
        defaultDifficulty={guestProgress.settings.difficultyDefault}
        defaultGoPuzzleCount={guestProgress.settings.goPuzzleCountDefault}
        defaultHardMode={guestProgress.settings.hardModeDefault}
        initialResume={practiceGoResume?.mode === 'go' ? practiceGoResume : undefined}
        keyboardDisabled={keyboardDisabled}
        onAdvancePracticeSeed={() => onPracticeSeedAdvance('go')}
        onConsumeConsumable={onConsumeConsumable}
        onGameComplete={onGameComplete}
        onResumeCapture={onResumeCapture}
        onSaveDifficultyDefault={(tier) => onUpdateSettings({ difficultyDefault: tier })}
        onSaveGoPuzzleCountDefault={(count) => onUpdateSettings({ goPuzzleCountDefault: count })}
        onSoloCloudMutation={onSoloCloudMutation}
        onSpendCoins={onSpendCoins}
        practiceSeedCounter={guestProgress.practiceSeeds.go}
        practiceSeedUserId={authState.user?.id}
        progressOwnerKey={progressOwnerKey}
        scope="practice"
      />
    )
  const handleJoinLobbyMultiplayerGame = useCallback((gameId: string) => {
    const targetGame = multiplayer.games.find((entry) => entry.id === gameId)
    if (!targetGame) {
      return
    }

    const nextSubtab: MultiplayerSubtabId = targetGame.scope === 'daily' ? 'daily' : 'practice'
    if (authState.status === 'authenticated' && authState.user?.id) {
      const result = joinMultiplayerGame(multiplayer, {
        gameId,
        playerProfile: viewerProfile,
        userId: authState.user.id,
      })
      if (!result.error) {
        onMultiplayerChange(result.state)
      }
    }

    onSelectRoute('multiplayer')
    onSelectMultiplayerGame(gameId)
    onMultiplayerSubtabChange(nextSubtab)
    requestMultiplayerGameplayAutoCenter()
  }, [
    authState.status,
    authState.user,
    multiplayer,
    onMultiplayerChange,
    onMultiplayerSubtabChange,
    onSelectMultiplayerGame,
    onSelectRoute,
    requestMultiplayerGameplayAutoCenter,
    viewerProfile,
  ])
  const renderMultiplayerPanel = (scope: 'daily' | 'practice') => (
      <MultiplayerPanel
        authStatus={authState.status}
      competitiveState={guestProgress.competitiveMultiplayer}
      dailyDateKey={scope === 'daily' ? multiplayerDailyDateKey : undefined}
      defaultDifficulty={guestProgress.settings.difficultyDefault}
      defaultGoPuzzleCount={guestProgress.settings.goPuzzleCountDefault}
        onChange={onMultiplayerChange}
        onCompetitiveChange={onCompetitiveMultiplayerChange}
        onOpenEloAbout={onOpenEloAbout}
        onGameplayAutoCenterRequest={requestMultiplayerGameplayAutoCenter}
        onSelectedGameChange={onSelectMultiplayerGame}
        postgameActions={postgameActions}
        privateMatchActions={privateMatchActions}
        participantIdentityActions={participantIdentityActions}
        rankedQueueActions={rankedQueueActions}
        scope={scope}
      selectedGameId={selectedMultiplayerGameId}
      state={multiplayer}
      viewerProfile={viewerProfile}
      viewerUserId={authState.user?.id}
    />
  )

  if (route.id === 'home') {
    return <DashboardHome dashboard={dashboard} onAction={onDashboardAction} />
  }

  if (route.id === 'calendar') {
    return (
      <CalendarPanel
        guestProgress={guestProgress}
        keyboardDisabled={keyboardDisabled}
        launchRequest={calendarLaunch}
        multiplayer={multiplayer}
        onGameComplete={onGameComplete}
        onLaunchConsumed={onCalendarLaunchConsumed}
        onMarkPastDailyUnlocked={onMarkPastDailyUnlocked}
        onResumeCapture={onResumeCapture}
        onSoloCloudMutation={onSoloCloudMutation}
        onSpendCoins={onSpendCoins}
        onUpdateSettings={onUpdateSettings}
        progressOwnerKey={progressOwnerKey}
        resumeSlots={resumeSlots}
        onMultiplayerChange={onMultiplayerChange}
        onCompetitiveMultiplayerChange={onCompetitiveMultiplayerChange}
        multiplayerDailyDateKey={multiplayerDailyDateKey}
        authStatus={authState.status}
        viewerUserId={authState.user?.id}
        viewerProfile={viewerProfile}
        todayDateKey={todayDateKey}
      />
    )
  }

  if (route.id === 'marketplace') {
    return (
      <MarketplacePanel
        coins={guestProgress.progression.coins}
        consumables={guestProgress.progression.consumables}
        onPurchase={onPurchaseConsumable}
      />
    )
  }

  if (route.id === 'solo') {
    return (
      <SoloWorkspace
        activeSubtab={soloSubtab}
        attention={workspaceAttention.solo}
        dailyMode={soloDailyMode}
        history={guestProgress.history}
        onDailyModeChange={onSoloDailyModeChange}
        onOpenCalendar={() => onSelectRoute('calendar')}
        onOpenHistory={onOpenSoloHistory}
        onPracticeModeChange={onPracticeModeChange}
        onResumeGame={onResumeSoloGame}
        onSubtabChange={onSoloSubtabChange}
        practiceMode={practiceMode}
        renderDailyGame={renderSoloDailyGame}
        renderPracticeGame={renderSoloPracticeGame}
        resumeSlots={resumeSlots}
      />
    )
  }

  if (route.id === 'og-daily') {
    return <OgGame coins={guestProgress.progression.coins} defaultDifficulty={guestProgress.settings.difficultyDefault} defaultHardMode={guestProgress.settings.hardModeDefault} initialResume={dailyOgResume?.mode === 'og' ? dailyOgResume : undefined} keyboardDisabled={keyboardDisabled} onGameComplete={onGameComplete} onResumeCapture={onResumeCapture} onSaveDifficultyDefault={(tier) => onUpdateSettings({ difficultyDefault: tier })} onSoloCloudMutation={onSoloCloudMutation} onSpendCoins={onSpendCoins} progressOwnerKey={progressOwnerKey} scope="daily" />
  }

  if (route.id === 'go-daily') {
    return <GoGame coins={guestProgress.progression.coins} defaultDifficulty={guestProgress.settings.difficultyDefault} defaultGoPuzzleCount={guestProgress.settings.goPuzzleCountDefault} defaultHardMode={guestProgress.settings.hardModeDefault} initialResume={dailyGoResume?.mode === 'go' ? dailyGoResume : undefined} keyboardDisabled={keyboardDisabled} onGameComplete={onGameComplete} onResumeCapture={onResumeCapture} onSaveDifficultyDefault={(tier) => onUpdateSettings({ difficultyDefault: tier })} onSaveGoPuzzleCountDefault={(count) => onUpdateSettings({ goPuzzleCountDefault: count })} onSoloCloudMutation={onSoloCloudMutation} onSpendCoins={onSpendCoins} progressOwnerKey={progressOwnerKey} scope="daily" />
  }

  if (route.id === 'practice') {
    return <PracticeGameSwitcher multiplayer={multiplayer} authStatus={authState.status} coins={guestProgress.progression.coins} consumables={guestProgress.progression.consumables} competitiveMultiplayer={guestProgress.competitiveMultiplayer} completedSoloSlots={completedSoloSlots} defaultDifficulty={guestProgress.settings.difficultyDefault} defaultGoPuzzleCount={guestProgress.settings.goPuzzleCountDefault} defaultHardMode={guestProgress.settings.hardModeDefault} keyboardDisabled={keyboardDisabled} onMultiplayerChange={onMultiplayerChange} onCompetitiveMultiplayerChange={onCompetitiveMultiplayerChange} onConsumeConsumable={onConsumeConsumable} onGameComplete={onGameComplete} onOpenEloAbout={onOpenEloAbout} onPracticeModeChange={onPracticeModeChange} onPracticeSeedAdvance={onPracticeSeedAdvance} onResumeCapture={onResumeCapture} onSaveDifficultyDefault={(tier) => onUpdateSettings({ difficultyDefault: tier })} onSaveGoPuzzleCountDefault={(count) => onUpdateSettings({ goPuzzleCountDefault: count })} onSoloCloudMutation={onSoloCloudMutation} onSpendCoins={onSpendCoins} participantIdentityActions={participantIdentityActions} practiceMode={practiceMode} practiceSeeds={guestProgress.practiceSeeds} privateMatchActions={privateMatchActions} postgameActions={postgameActions} rankedQueueActions={rankedQueueActions} resumeSlots={resumeSlots} progressOwnerKey={progressOwnerKey} viewerProfile={viewerProfile} viewerUserId={authState.user?.id} />
  }

  if (route.id === 'multiplayer') {
    return (
      <MultiplayerWorkspace
        activeSubtab={multiplayerSubtab}
        attention={workspaceAttention.multiplayer}
        competitiveState={guestProgress.competitiveMultiplayer}
        dailyDateKey={multiplayerDailyDateKey}
        focusedSpectatorGameId={focusedLiveSpectatorGameId}
        onCloseFocusedSpectatorGame={onCloseFocusedLiveSpectatorGame}
        onLiveSurfaceActiveChange={onLiveSurfaceActiveChange}
        onOpenHistory={onOpenMultiplayerHistory}
        onOpenFocusedSpectatorGame={onOpenFocusedLiveSpectatorGame}
        onOpenPublicProfile={(publicProfileId) => onOpenPublicProfile(publicProfileId, 'multiplayer')}
        onJoinGame={handleJoinLobbyMultiplayerGame}
        onResumeGame={onResumeMultiplayerGame}
        onSelectGame={onSelectMultiplayerGame}
        onSubtabChange={onMultiplayerSubtabChange}
        participantIdentityActions={participantIdentityActions}
        renderDailyPanel={() => renderMultiplayerPanel('daily')}
        renderPracticePanel={() => renderMultiplayerPanel('practice')}
        selectedGameId={selectedMultiplayerGameId}
        state={multiplayer}
        liveSpectatorRows={liveSpectatorRows}
        viewerUserId={authState.user?.id}
      />
    )
  }

  if (route.id === 'history') {
    return (
      <HistoryWorkspace
        competitiveState={guestProgress.competitiveMultiplayer}
        filters={historyFilters}
        history={guestProgress.history}
        onFiltersChange={onHistoryFiltersChange}
        viewerUserId={authState.user?.id}
      />
    )
  }

  if (route.id === 'word-explorer') {
    return <WordExplorerPanel />
  }

  if (route.id === 'feedback') {
    return <FeedbackPanel />
  }

  if (route.id === 'stats') {
    return (
      <StatsDashboard
        authStatus={authState.status}
        competitiveMultiplayer={guestProgress.competitiveMultiplayer}
        history={guestProgress.history}
        progression={guestProgress.progression}
        publicSiteStatsRepository={publicSiteStatsRepository}
        stats={guestProgress.stats}
        viewerUserId={authState.user?.id}
      />
    )
  }

  if (route.id === 'help') {
    return <HelpPanel onNavigate={onSelectRoute} />
  }

  if (route.id === 'leaderboard') {
    return (
      <LeaderboardPanel
        authStatus={authState.status}
        competitiveMultiplayer={guestProgress.competitiveMultiplayer}
        onOpenEloAbout={onOpenEloAbout}
        onOpenPublicProfile={onOpenPublicProfile}
        publicRankedLeaderboardRepository={publicRankedLeaderboardRepository}
        viewerUserId={authState.user?.id}
      />
    )
  }

  if (route.id === 'public-profile') {
    const backToMultiplayer = publicProfileReturnRoute === 'multiplayer'
    return (
      <PublicProfilePage
        authStatus={authState.status}
        backLabel={backToMultiplayer ? 'Back to Multiplayer' : undefined}
        privateMatchActions={privateMatchActions}
        privateMatchViewerSessionKey={authState.user?.id}
        onBack={() => onSelectRoute(backToMultiplayer ? 'multiplayer' : 'leaderboard')}
        onEnterPrivateMatch={(gameId) => {
          onSelectMultiplayerGame(gameId)
          onMultiplayerSubtabChange('practice')
          onSelectRoute('multiplayer')
        }}
        onGoToPracticeMultiplayer={() => {
          onMultiplayerSubtabChange('practice')
          onSelectRoute('multiplayer')
        }}
        publicProfileId={selectedPublicProfileId}
        publicRankedLeaderboardRepository={publicRankedLeaderboardRepository}
        repository={publicProfileRepository}
      />
    )
  }

  if (route.id === 'profile') {
    return (
      <CurrentPlayerProfileRoute
        authMessage={authMessage}
        authState={authState}
        busy={profileBusy}
        onRequestPasswordReset={onRequestPasswordReset}
        onOpenSettings={onOpenSettings}
        onSave={onSaveProfile}
        onSavePublicProfile={onSavePublicProfile}
        onSendMagicLink={onSendMagicLink}
        onSignInWithPassword={onSignInWithPassword}
        onSignOut={onSignOut}
        onSignUpWithPassword={onSignUpWithPassword}
        publicProfile={publicProfile}
        publicProfileBusy={publicProfileBusy}
        publicProfileStatusMessage={publicProfileMessage}
        statusMessage={profileMessage}
        supabaseClient={supabaseClient}
      />
    )
  }

  if (route.id === 'settings') {
    return (
      <Settings
        authMessage={authMessage}
        authState={authState}
        guestProgress={guestProgress}
        onOpenAuthModal={onOpenAuthModal}
        onOpenPasswordChange={onOpenPasswordChange}
        onOpenProfilePanel={onOpenProfilePanel}
        onResetProgress={onResetProgress}
        onRequestPasswordReset={onRequestPasswordReset}
        onSendMagicLink={onSendMagicLink}
        onSignInWithPassword={onSignInWithPassword}
        onSignOut={onSignOut}
        onSignUpWithPassword={onSignUpWithPassword}
        onSyncNow={onSyncNow}
        onToggleSound={onToggleSound}
        onUpdateSettings={onUpdateSettings}
        privateRequestSettingsActions={privateMatchActions}
        soundEnabled={soundEnabled}
        syncStatus={syncStatus}
      />
    )
  }

  if (route.id === 'about') {
    return <AboutBrrrdlePanel />
  }

  if (route.id === 'admin') {
    return <AdminPanel adminDashboardRepository={adminDashboardRepository} authState={authState} supabaseClient={supabaseClient} />
  }

  return (
    <section className="space-y-4" aria-labelledby="route-title">
      <p className="text-sm font-semibold uppercase text-[var(--color-ice-200)]">{route.navigationGroup}</p>
      <h2 id="route-title" className="text-3xl font-bold text-white">{route.label}</h2>
      <p className="max-w-3xl text-base leading-7 text-slate-300">{route.description}</p>
      <Panel className="text-sm leading-6 text-slate-300" tone="muted">
        <p>
          This route is ready for later gameplay, definitions, persistence, account, and admin phases. No unfinished game behavior is exposed in Phase 3.3.
        </p>
      </Panel>
    </section>
  )
}

function App() {
  return (
    <SoundProvider>
      <AppInner />
    </SoundProvider>
  )
}

function AppInner() {
  const sound = useSound()
  const [initialBrowserNavigation] = useState(() => readCurrentBrowserNavigationViewState())
  const [initialNavigation] = useState(() => selectInitialNavigationState(initialBrowserNavigation))
  const [initialFocusedLiveSpectatorGameId] = useState<string | undefined>(undefined)
  const [activeRouteId, setActiveRouteId] = useState<AppRouteId>(() => initialNavigation.activeRouteId)
  const [focusModeEnabled, setFocusModeEnabled] = useState(false)
  const [guestProgress, setGuestProgress] = useState(() => loadGuestProgress())
  const [multiplayer, setMultiplayer] = useState(() => guestProgress.multiplayer ?? loadMultiplayerState())
  const [liveSpectatorRows, setLiveSpectatorRows] = useState<readonly AuthenticatedLiveSpectatorGame[]>([])
  const [initialMultiplayerSeed] = useState(() => guestProgress.multiplayer)
  const supabaseClient = useMemo(() => createBrrrdleSupabaseClient(), [])
  const phase57EconomyAuthorityEnabled = import.meta.env.VITE_PHASE57_ECONOMY_AUTHORITY !== 'disabled'
  const [authState, setAuthState] = useState<AuthState>(() => supabaseClient ? { status: 'anonymous' } : { status: 'unconfigured' })
  const [activeProgressScope, setActiveProgressScope] = useState<ActiveProgressScope>(() => getProgressScopeForAuthState(authState))
  const [completedSoloSlots, setCompletedSoloSlots] = useState<ResumeSlotCollection>(() => loadSoloCompletionDisplaySlots(getProgressOwnerKey(getProgressScopeForAuthState(authState))))
  const authenticatedMultiplayerUserId = authState.status === 'authenticated' && authState.user ? authState.user.id : undefined
  const multiplayerRepository = useMemo<MultiplayerRepository>(
    () => authenticatedMultiplayerUserId && supabaseClient
      ? createSupabaseMultiplayerRepository({
          client: supabaseClient,
          onReadinessEvent: (event) => {
            window.dispatchEvent(new CustomEvent(MULTIPLAYER_REPOSITORY_READINESS_EVENT, { detail: event }))
          },
          userId: authenticatedMultiplayerUserId,
        })
      : createLocalStorageMultiplayerRepository(undefined, initialMultiplayerSeed),
    [authenticatedMultiplayerUserId, initialMultiplayerSeed, supabaseClient],
  )
  const publicRankedLeaderboardRepository = useMemo<PublicRankedLeaderboardRepository | undefined>(
    () => authState.status === 'authenticated' && supabaseClient
      ? createSupabasePublicRankedLeaderboardRepository(supabaseClient)
      : undefined,
    [authState.status, supabaseClient],
  )
  const publicSiteStatsRepository = useMemo<PublicSiteStatsRepository | undefined>(
    () => supabaseClient ? createSupabasePublicSiteStatsRepository(supabaseClient) : undefined,
    [supabaseClient],
  )
  const adminDashboardRepository = useMemo<AdminOperationalDashboardRepository | undefined>(
    () => supabaseClient ? createSupabaseAdminOperationalDashboardRepository(supabaseClient) : undefined,
    [supabaseClient],
  )
  const publicProfileRepository = useMemo<PublicProfileRepository | undefined>(
    () => supabaseClient ? createSupabasePublicProfileRepository(supabaseClient) : undefined,
    [supabaseClient],
  )
  const soloCloudProgressRepository = useMemo<SoloCloudProgressRepository | undefined>(
    () => supabaseClient ? createSupabaseSoloCloudProgressRepository(supabaseClient) : undefined,
    [supabaseClient],
  )
  const economyRepository = useMemo<EconomyRepository | undefined>(
    () => phase57EconomyAuthorityEnabled && supabaseClient ? createSupabaseEconomyRepository(supabaseClient) : undefined,
    [phase57EconomyAuthorityEnabled, supabaseClient],
  )
  const multiplayerRepositoryRef = useRef(multiplayerRepository)
  const trustedRankedSettlementInFlightRef = useRef(new Set<string>())
  const trustedRankedSettlementCompletedRef = useRef(new Set<string>())
  const [authMessage, setAuthMessage] = useState<string | undefined>(undefined)
  const [authBusy, setAuthBusy] = useState(false)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [passwordResetOpen, setPasswordResetOpen] = useState(false)
  const [passwordResetMessage, setPasswordResetMessage] = useState<string | undefined>(undefined)
  const [profilePanelOpen, setProfilePanelOpen] = useState(false)
  const [profileMessage, setProfileMessage] = useState<string | undefined>(undefined)
  const [profileBusy, setProfileBusy] = useState(false)
  const [publicProfile, setPublicProfile] = useState<OwnerPublicProfile | undefined>(undefined)
  const [publicProfileMessage, setPublicProfileMessage] = useState<string | undefined>(undefined)
  const [publicProfileBusy, setPublicProfileBusy] = useState(false)
  const [syncStatus, setSyncStatus] = useState(() => createSyncStatus(supabaseClient ? 'idle' : 'error'))
  const [notificationMetadata, setNotificationMetadata] = useState(() => loadNotificationMetadata())
  const [privateMatchRequestsForNotifications, setPrivateMatchRequestsForNotifications] = useState<readonly import('../multiplayer/multiplayerRepository').PrivateMatchRequestResult[]>([])
  const browserNotificationFingerprintsRef = useRef<Set<string> | undefined>(undefined)
  const notificationSoundFingerprintsRef = useRef<Set<string> | undefined>(undefined)
  const [practiceMode, setPracticeModeState] = useState<PracticeMode>(() => initialNavigation.legacyPracticeMode)
  const [selectedSoloGameKey, setSelectedSoloGameKey] = useState<SoloActiveGameKey | undefined>(() => (
    isSoloActiveGameKey(initialNavigation.selectedSoloGameKey) ? initialNavigation.selectedSoloGameKey : undefined
  ))
  const [soloDailyMode, setSoloDailyMode] = useState<SoloMode>(() => selectedSoloGameKey === 'daily-go' ? 'go' : 'og')
  const [soloSubtab, setSoloSubtab] = useState<SoloSubtabId>(() => initialNavigation.soloSubtab)
  const [multiplayerSubtab, setMultiplayerSubtab] = useState<MultiplayerSubtabId>(() => initialNavigation.multiplayerSubtab)
  const [selectedMultiplayerGameId, setSelectedMultiplayerGameId] = useState<string | undefined>(() => initialNavigation.selectedMultiplayerGameId)
  const [selectedPublicProfileId, setSelectedPublicProfileId] = useState<string | undefined>(() => initialNavigation.selectedPublicProfileId)
  const [publicProfileReturnRoute, setPublicProfileReturnRoute] = useState<PublicProfileReturnRoute | undefined>(() => initialNavigation.publicProfileReturnRoute)
  const [focusedLiveSpectatorGameId, setFocusedLiveSpectatorGameId] = useState<string | undefined>(() => initialFocusedLiveSpectatorGameId)
  const [multiplayerLiveSurfaceActive, setMultiplayerLiveSurfaceActive] = useState(false)
  const [historyFilters, setHistoryFilters] = useState(() => initialNavigation.historyFilters)
  const [dailyAlerting, setDailyAlerting] = useState(false)
  const [dailyMultiplayerAlerting, setDailyMultiplayerAlerting] = useState(false)
  const dailyAlertTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const dailyMultiplayerAlertTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const autoResumedRef = useRef(false)
  const browserNavigationInitializedRef = useRef(false)
  const browserNavigationPopstateRef = useRef(false)
  const lastBrowserNavigationViewStateRef = useRef<BrowserNavigationViewState | undefined>(undefined)
  const guestProgressRef = useRef(guestProgress)
  const multiplayerRef = useRef(multiplayer)
  const multiplayerAuthorityUserIdRef = useRef<string | undefined>(undefined)
  const authStateRef = useRef(authState)
  const activeProgressScopeRef = useRef<ActiveProgressScope>(activeProgressScope)
  const authHydrationRequestRef = useRef(0)
  const authenticatedProgressSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const authenticatedProgressSyncInFlightRef = useRef(false)
  const authenticatedProgressSyncDirtyRef = useRef(false)
  const authenticatedProgressSyncVersionRef = useRef(0)
  const latestAuthenticatedProgressSyncRef = useRef<ReturnType<typeof createAuthenticatedProgressSyncRequest> | undefined>(undefined)
  const flushAuthenticatedProgressSyncRef = useRef<() => void>(() => {})
  const pendingAuthenticatedProgressSyncRef = useRef<Promise<void>>(Promise.resolve())
  const soloCloudWriteQueueRef = useRef(createSoloCloudWriteQueue())
  const invalidateAuthenticatedProgressSync = useCallback(() => {
    authenticatedProgressSyncVersionRef.current += 1
    authenticatedProgressSyncDirtyRef.current = false
    latestAuthenticatedProgressSyncRef.current = undefined
    if (authenticatedProgressSyncTimeoutRef.current) {
      clearTimeout(authenticatedProgressSyncTimeoutRef.current)
      authenticatedProgressSyncTimeoutRef.current = undefined
    }
  }, [])
  const applyScopedProgress = useCallback((progress: GuestProgressState, scope: ActiveProgressScope) => {
    if (scope.kind !== 'authenticated') {
      multiplayerAuthorityUserIdRef.current = undefined
    }
    activeProgressScopeRef.current = scope
    setActiveProgressScope(scope)
    setCompletedSoloSlots(loadSoloCompletionDisplaySlots(getProgressOwnerKey(scope)))
    guestProgressRef.current = progress
    setGuestProgress(progress)
    setMultiplayer((currentMultiplayerState) => {
      const nextMultiplayerState = selectScopedProgressMultiplayerState({
        currentAuthorityUserId: multiplayerAuthorityUserIdRef.current,
        currentMultiplayerState,
        nextProgress: progress,
        nextScope: scope,
      })
      reportMultiplayerStateReadiness('progress-selected', nextMultiplayerState.games.length)
      multiplayerRef.current = nextMultiplayerState
      return nextMultiplayerState
    })
    if (shouldPersistProgressToGuestStorage(scope)) {
      saveGuestProgress(progress)
    }
  }, [])
  const flushAuthenticatedProgressSync = useCallback(() => {
    if (!supabaseClient) {
      return
    }

    const request = latestAuthenticatedProgressSyncRef.current
    if (!request) {
      return
    }

    if (authenticatedProgressSyncTimeoutRef.current) {
      clearTimeout(authenticatedProgressSyncTimeoutRef.current)
      authenticatedProgressSyncTimeoutRef.current = undefined
    }

    authenticatedProgressSyncInFlightRef.current = true
    authenticatedProgressSyncDirtyRef.current = false
    setSyncStatus(createSyncStatus('syncing'))

    const syncPromise = syncAuthenticatedProgress({
      isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
      localProgress: request.localProgress,
      localUpdatedAt: request.localUpdatedAt,
      repository: createSupabaseProgressRepository(supabaseClient),
      userId: request.userId,
    }).then((result) => {
      if (!shouldApplyAuthenticatedProgressSyncResult({
        authState: authStateRef.current,
        currentVersion: authenticatedProgressSyncVersionRef.current,
        requestVersion: request.version,
        scope: activeProgressScopeRef.current,
        userId: request.userId,
      })) {
        return
      }
      applyScopedProgress(result.progress, { kind: 'authenticated', userId: request.userId })
      setSyncStatus(result.status)
    }).finally(() => {
      authenticatedProgressSyncInFlightRef.current = false
      if (authenticatedProgressSyncDirtyRef.current && latestAuthenticatedProgressSyncRef.current) {
        authenticatedProgressSyncTimeoutRef.current = setTimeout(
          () => flushAuthenticatedProgressSyncRef.current(),
          AUTHENTICATED_PROGRESS_AUTO_SYNC_DEBOUNCE_MS,
        )
      }
    })
    pendingAuthenticatedProgressSyncRef.current = syncPromise.then(
      () => undefined,
      () => undefined,
    )
    void syncPromise
  }, [applyScopedProgress, supabaseClient])
  useEffect(() => {
    flushAuthenticatedProgressSyncRef.current = flushAuthenticatedProgressSync
  }, [flushAuthenticatedProgressSync])
  const scheduleAuthenticatedProgressSync = useCallback((progress: GuestProgressState) => {
    if (!supabaseClient) {
      return
    }

    const nextVersion = authenticatedProgressSyncVersionRef.current + 1
    const request = createAuthenticatedProgressSyncRequest({
      authState: authStateRef.current,
      localProgress: progress,
      scope: activeProgressScopeRef.current,
      version: nextVersion,
    })
    if (!request) {
      return
    }

    authenticatedProgressSyncVersionRef.current = nextVersion
    latestAuthenticatedProgressSyncRef.current = request
    authenticatedProgressSyncDirtyRef.current = true
    if (authenticatedProgressSyncTimeoutRef.current) {
      clearTimeout(authenticatedProgressSyncTimeoutRef.current)
    }
    authenticatedProgressSyncTimeoutRef.current = setTimeout(
      flushAuthenticatedProgressSync,
      AUTHENTICATED_PROGRESS_AUTO_SYNC_DEBOUNCE_MS,
    )
  }, [flushAuthenticatedProgressSync, supabaseClient])
  const persistActiveProgress = useCallback((progress: GuestProgressState) => {
    if (shouldPersistProgressToGuestStorage(activeProgressScopeRef.current)) {
      saveGuestProgress(progress)
      return
    }
    scheduleAuthenticatedProgressSync(progress)
  }, [scheduleAuthenticatedProgressSync])
  const persistActiveMultiplayerState = useCallback((state: MultiplayerState) => {
    if (shouldPersistProgressToGuestStorage(activeProgressScopeRef.current)) {
      saveMultiplayerState(state)
    }
  }, [])
  const activeRoute = getRouteById(activeRouteId)
  const liveSpectatorSurfaceActive = activeRouteId === 'multiplayer'
    && (multiplayerLiveSurfaceActive || Boolean(focusedLiveSpectatorGameId))
  const resumeSlots = useMemo(() => normalizeResumeSlots(guestProgress.resumeSlots), [guestProgress.resumeSlots])
  const activeProgressOwnerKey = getProgressOwnerKey(activeProgressScope)
  const isAdmin = authState.user?.roles.includes('admin') ?? false
  const prismRoutes = useMemo(() => getPrimaryNavigationRoutes(isAdmin), [isAdmin])
  const [calendarLaunch, setCalendarLaunch] = useState<CalendarLaunchRequest | null>(null)
  const handleClearCalendarLaunch = useCallback(() => setCalendarLaunch(null), [])
  const handleMarkPastDailyUnlocked = useCallback((mode: 'og' | 'go', dateKey: string) => {
    setGuestProgress((currentProgress) => {
      const key = `${mode}:${dateKey}`
      const current = currentProgress.unlockedDailies ?? []
      if (current.includes(key)) {
        return currentProgress
      }
      const nextProgress = { ...currentProgress, unlockedDailies: [...current, key] }
      persistActiveProgress(nextProgress)
      return nextProgress
    })
  }, [persistActiveProgress])
  const countdownEnabled = guestProgress.settings.dailyCountdownEnabled
  const dailyMultiplayerCountdownEnabled = guestProgress.settings.dailyMultiplayerCountdownEnabled
  const handleDailyReset = useCallback(() => {
    // Subtle, non-modal alert: play the unique reset chime (respects the master
    // sound toggle inside the engine) and glow the countdown for a few seconds.
    sound.play('daily-reset')
    setDailyAlerting(true)
    if (dailyAlertTimeoutRef.current) {
      clearTimeout(dailyAlertTimeoutRef.current)
    }
    dailyAlertTimeoutRef.current = setTimeout(() => setDailyAlerting(false), 12_000)
  }, [sound])
  const daily = useDailyCycle({ alertsEnabled: countdownEnabled, onReset: handleDailyReset })
  const visibleCompletedSoloSlots = completedSoloSlots
  const handleDailyMultiplayerReset = useCallback(() => {
    sound.play('daily-multiplayer-reset')
    setDailyMultiplayerAlerting(true)
    if (dailyMultiplayerAlertTimeoutRef.current) {
      clearTimeout(dailyMultiplayerAlertTimeoutRef.current)
    }
    dailyMultiplayerAlertTimeoutRef.current = setTimeout(() => setDailyMultiplayerAlerting(false), 12_000)
  }, [sound])
  const dailyMultiplayer = useDailyCycle({
    alertsEnabled: dailyMultiplayerCountdownEnabled,
    onReset: handleDailyMultiplayerReset,
    variant: 'multiplayer',
  })
  const dashboard = useMemo(() => createDashboardViewModel({
    competitiveMultiplayerState: guestProgress.competitiveMultiplayer,
    dailyDateKey: dailyMultiplayer.dateKey,
    dailyMultiplayer: {
      actionLabel: dailyMultiplayerAlerting ? 'Play now' : 'Open daily',
      detailLabel: dailyMultiplayerAlerting
        ? 'Daily Multiplayer has refreshed.'
        : `Daily Multiplayer resets in ${dailyMultiplayer.countdownLabel} (${dailyMultiplayer.timeZone}).`,
      ready: dailyMultiplayerAlerting,
    },
    dailySolo: {
      actionLabel: dailyAlerting ? 'Play now' : 'Open daily',
      detailLabel: dailyAlerting
        ? 'Daily Solo has refreshed.'
        : `Daily Solo resets in ${daily.countdownLabel} (${daily.timeZone}).`,
      ready: dailyAlerting,
    },
    history: guestProgress.history,
    liveSpectatorRows,
    multiplayerState: multiplayer,
    resumeSlots,
    viewerUserId: authState.user?.id,
  }), [
    authState.user?.id,
    daily.countdownLabel,
    daily.timeZone,
    dailyAlerting,
    dailyMultiplayer.countdownLabel,
    dailyMultiplayer.dateKey,
    dailyMultiplayer.timeZone,
    dailyMultiplayerAlerting,
    guestProgress.competitiveMultiplayer,
    guestProgress.history,
    liveSpectatorRows,
    multiplayer,
    resumeSlots,
  ])
  const notifications = useMemo(() => createNotificationViewModel({
    dashboard,
    notificationMetadata,
    notificationPreferences: guestProgress.settings,
    now: dashboard.generatedAt,
    privateMatchRequests: privateMatchRequestsForNotifications,
  }), [
    dashboard,
    guestProgress.settings,
    notificationMetadata,
    privateMatchRequestsForNotifications,
  ])
  const routeAttention = useMemo(() => createRouteAttentionMap({
    dashboard,
    notifications,
  }), [dashboard, notifications])
  const workspaceAttention = useMemo(() => createWorkspaceAttentionMap({
    dashboard,
  }), [dashboard])
  const browserNavigationViewState = useMemo(() => createBrowserNavigationViewState({
    activeRouteId,
    focusedLiveSpectatorGameId,
    historyFilters,
    legacyPracticeMode: practiceMode,
    multiplayerSubtab,
    publicProfileReturnRoute,
    selectedMultiplayerGameId,
    selectedPublicProfileId,
    selectedSoloGameKey,
    soloSubtab,
  }), [
    activeRouteId,
    focusedLiveSpectatorGameId,
    historyFilters,
    multiplayerSubtab,
    practiceMode,
    publicProfileReturnRoute,
    selectedMultiplayerGameId,
    selectedPublicProfileId,
    selectedSoloGameKey,
    soloSubtab,
  ])
  const resolveCurrentBrowserNavigationViewState = useCallback((viewState: BrowserNavigationViewState) => resolveBrowserNavigationViewState(viewState, {
    completedSoloSlots: visibleCompletedSoloSlots,
    liveSpectatorRows,
    multiplayerGames: multiplayer.games,
    resumeSlots,
    viewerUserId: authState.user?.id,
  }), [
    authState.user?.id,
    liveSpectatorRows,
    multiplayer.games,
    resumeSlots,
    visibleCompletedSoloSlots,
  ])
  const applyBrowserNavigationViewState = useCallback((viewState: BrowserNavigationViewState) => {
    const resolved = resolveCurrentBrowserNavigationViewState(viewState)
    const navigation = resolved.navigation
    const selectedSoloSlot = navigation.selectedSoloGameKey && isSoloActiveGameKey(navigation.selectedSoloGameKey)
      ? resumeSlots[navigation.selectedSoloGameKey] ?? visibleCompletedSoloSlots[navigation.selectedSoloGameKey]
      : undefined

    setActiveRouteId(navigation.activeRouteId)
    setPracticeModeState(navigation.legacyPracticeMode)
    setSoloSubtab(navigation.soloSubtab)
    setSelectedSoloGameKey(navigation.selectedSoloGameKey && isSoloActiveGameKey(navigation.selectedSoloGameKey)
      ? navigation.selectedSoloGameKey
      : undefined)
    if (selectedSoloSlot?.scope === 'daily') {
      setSoloDailyMode(selectedSoloSlot.mode)
    } else if (selectedSoloSlot?.scope === 'practice') {
      setPracticeModeState(selectedSoloSlot.mode)
    }
    setMultiplayerSubtab(navigation.multiplayerSubtab)
    setSelectedMultiplayerGameId(navigation.selectedMultiplayerGameId)
    setSelectedPublicProfileId(navigation.selectedPublicProfileId)
    setPublicProfileReturnRoute(navigation.publicProfileReturnRoute)
    setFocusedLiveSpectatorGameId(resolved.focusedLiveSpectatorGameId)
    setHistoryFilters(navigation.historyFilters)
    saveNavigationState(navigation)
  }, [resolveCurrentBrowserNavigationViewState, resumeSlots, visibleCompletedSoloSlots])
  useEffect(() => subscribeBrowserNavigationViewState((viewState) => {
    browserNavigationPopstateRef.current = true
    applyBrowserNavigationViewState(viewState)
  }), [applyBrowserNavigationViewState])
  useEffect(() => {
    if (!browserNavigationInitializedRef.current) {
      writeBrowserNavigationViewState(browserNavigationViewState, 'replace')
      browserNavigationInitializedRef.current = true
      lastBrowserNavigationViewStateRef.current = browserNavigationViewState
      browserNavigationPopstateRef.current = false
      return
    }

    if (!areBrowserNavigationViewStatesEqual(lastBrowserNavigationViewStateRef.current, browserNavigationViewState)) {
      writeBrowserNavigationViewState(browserNavigationViewState, browserNavigationPopstateRef.current ? 'replace' : 'push')
      lastBrowserNavigationViewStateRef.current = browserNavigationViewState
    }
    browserNavigationPopstateRef.current = false
  }, [
    browserNavigationViewState,
  ])
  useEffect(() => {
    const currentFingerprints = getNotificationSoundFingerprints(notifications.items)
    const previousFingerprints = notificationSoundFingerprintsRef.current

    if (!previousFingerprints) {
      notificationSoundFingerprintsRef.current = new Set(currentFingerprints)
      return
    }

    const decision = selectNotificationSoundDecision({
      items: notifications.items,
      masterSoundEnabled: sound.enabled,
      preferences: guestProgress.settings,
      previousFingerprints: Array.from(previousFingerprints),
    })

    if (decision) {
      sound.play(decision.event)
    }

    notificationSoundFingerprintsRef.current = new Set([
      ...Array.from(previousFingerprints),
      ...currentFingerprints,
    ])
  }, [guestProgress.settings, notifications.items, sound])
  const requestSoloGameplayAutoCenter = useCallback(() => {
    scheduleGameplayAutoCenter(GAMEPLAY_AUTOCENTER_TARGETS.solo)
  }, [])
  const requestMultiplayerGameplayAutoCenter = useCallback(() => {
    scheduleGameplayAutoCenter(GAMEPLAY_AUTOCENTER_TARGETS.multiplayer)
  }, [])
  const handlePracticeModeChange = useCallback((mode: PracticeMode) => {
    const selectedSoloGameKey: SoloActiveGameKey = mode === 'go' ? 'practice-go' : 'practice-og'
    setPracticeModeState(mode)
    setSoloSubtab('practice')
    setSelectedSoloGameKey(selectedSoloGameKey)
    saveNavigationState({ legacyPracticeMode: mode, selectedSoloGameKey, soloSubtab: 'practice' })
  }, [])
  const handleSoloDailyModeChange = useCallback((mode: SoloMode) => {
    const selectedSoloGameKey: SoloActiveGameKey = mode === 'go' ? 'daily-go' : 'daily-og'
    setSoloDailyMode(mode)
    setSoloSubtab('daily')
    setSelectedSoloGameKey(selectedSoloGameKey)
    saveNavigationState({ selectedSoloGameKey, soloSubtab: 'daily' })
  }, [])
  const handleSoloSubtabChange = useCallback((subtab: SoloSubtabId) => {
    setSoloSubtab(subtab)
    saveNavigationState({ soloSubtab: subtab })
  }, [])
  const handleSelectSoloGame = useCallback((key: SoloActiveGameKey, options?: { readonly autoCenter?: boolean }) => {
    setSelectedSoloGameKey(key)
    saveNavigationState({ selectedSoloGameKey: key })
    if (options?.autoCenter) {
      requestSoloGameplayAutoCenter()
    }
  }, [requestSoloGameplayAutoCenter])
  const handleMultiplayerSubtabChange = useCallback((subtab: MultiplayerSubtabId) => {
    if (subtab !== 'live') {
      setFocusedLiveSpectatorGameId(undefined)
    }
    setMultiplayerSubtab(subtab)
    saveNavigationState({ multiplayerSubtab: subtab })
    if ((subtab === 'daily' || subtab === 'practice') && selectedMultiplayerGameId) {
      requestMultiplayerGameplayAutoCenter()
    }
  }, [requestMultiplayerGameplayAutoCenter, selectedMultiplayerGameId])
  const handleSelectMultiplayerGame = useCallback((id: string) => {
    setFocusedLiveSpectatorGameId(undefined)
    setSelectedMultiplayerGameId(id)
    saveNavigationState({ selectedMultiplayerGameId: id })
    requestMultiplayerGameplayAutoCenter()
  }, [requestMultiplayerGameplayAutoCenter])
  const handleOpenFocusedLiveSpectatorGame = useCallback((id: string) => {
    setFocusedLiveSpectatorGameId(id)
    setSelectedMultiplayerGameId(id)
    setActiveRouteId('multiplayer')
    setMultiplayerSubtab('live')
    saveNavigationState({
      activeRouteId: 'multiplayer',
      multiplayerSubtab: 'live',
      selectedMultiplayerGameId: id,
    })
    requestMultiplayerGameplayAutoCenter()
  }, [requestMultiplayerGameplayAutoCenter])
  const handleCloseFocusedLiveSpectatorGame = useCallback(() => {
    setFocusedLiveSpectatorGameId(undefined)
    setMultiplayerSubtab('live')
    saveNavigationState({ multiplayerSubtab: 'live' })
  }, [])
  const handleLiveSurfaceActiveChange = useCallback((active: boolean) => {
    setMultiplayerLiveSurfaceActive(active)
  }, [])
  const handlePracticeSeedAdvance = useCallback((mode: PracticeMode) => {
    const slotKey = getPracticeSoloSlotKey(mode)
    setActiveRouteId('solo')
    setPracticeModeState(mode)
    setSoloSubtab('practice')
    setSelectedSoloGameKey(slotKey)
    saveNavigationState({
      activeRouteId: 'solo',
      legacyPracticeMode: mode,
      selectedSoloGameKey: slotKey,
      soloSubtab: 'practice',
    })
    setCompletedSoloSlots((currentSlots) => {
      const nextSlots = clearSoloDisplaySlot(currentSlots, slotKey)
      if (nextSlots !== currentSlots) {
        saveSoloCompletionDisplaySlots(activeProgressOwnerKey, nextSlots)
      }
      return nextSlots
    })
    setGuestProgress((currentProgress) => {
      const progressWithoutSupersededSlot = clearProgressResumeSlot(currentProgress, slotKey)
      const practiceSeeds = advancePracticeSeedState(currentProgress.practiceSeeds, mode)
      const nextProgress = { ...progressWithoutSupersededSlot, practiceSeeds }
      persistActiveProgress(nextProgress)
      if (!shouldPersistProgressToGuestStorage(activeProgressScopeRef.current)) {
        window.setTimeout(() => flushAuthenticatedProgressSyncRef.current(), 0)
      }
      return nextProgress
    })
  }, [activeProgressOwnerKey, persistActiveProgress])
  const handleNavigate = useCallback((routeId: AppRoute['id']) => {
    // Phase 22 Addendum (§27.10): the dedicated daily routes are retired. Any
    // deep link to them gracefully redirects into the Calendar with today's
    // daily for the requested mode pre-launched.
    if (routeId === 'og-daily' || routeId === 'go-daily') {
      setFocusedLiveSpectatorGameId(undefined)
      setCalendarLaunch({ mode: routeId === 'og-daily' ? 'og' : 'go', dateKey: daily.dateKey })
      setActiveRouteId('calendar')
      setSoloSubtab('daily')
      saveNavigationState({ activeRouteId: 'calendar', soloSubtab: 'daily' })
      return
    }
    if (routeId === 'practice') {
      setFocusedLiveSpectatorGameId(undefined)
      setSoloSubtab('practice')
      saveNavigationState({ activeRouteId: 'solo', soloSubtab: 'practice' })
      setActiveRouteId('solo')
      return
    }
    if (routeId !== 'multiplayer') {
      setFocusedLiveSpectatorGameId(undefined)
    }
    if (routeId !== 'public-profile') {
      setPublicProfileReturnRoute(undefined)
    }
    setActiveRouteId(routeId)
    saveNavigationState({ activeRouteId: routeId, publicProfileReturnRoute: undefined })
  }, [daily.dateKey])
  const handleOpenPublicProfile = useCallback((publicProfileId: string, returnRoute: PublicProfileReturnRoute = 'leaderboard') => {
    setFocusedLiveSpectatorGameId(undefined)
    setSelectedPublicProfileId(publicProfileId)
    setPublicProfileReturnRoute(returnRoute)
    setActiveRouteId('public-profile')
    saveNavigationState({
      activeRouteId: 'public-profile',
      publicProfileReturnRoute: returnRoute,
      selectedPublicProfileId: publicProfileId,
    })
  }, [])
  const handleOpenEloAbout = useCallback(() => {
    handleNavigate('about')
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return
    }
    window.setTimeout(() => {
      const section = document.getElementById(RANKED_ELO_ABOUT_SECTION_ID)
      if (!section) {
        return
      }
      section.scrollIntoView({ block: 'start', behavior: 'smooth' })
      if (section instanceof HTMLElement) {
        section.focus({ preventScroll: true })
      }
    }, 0)
  }, [handleNavigate])
  const handleCountdownActivate = useCallback(() => {
    setDailyAlerting(false)
    setCalendarLaunch({ mode: 'og', dateKey: daily.dateKey })
    setActiveRouteId('calendar')
    setSoloSubtab('daily')
    saveNavigationState({ activeRouteId: 'calendar', soloSubtab: 'daily' })
  }, [daily.dateKey])
  const handleDailyMultiplayerCountdownActivate = useCallback(() => {
    setDailyMultiplayerAlerting(false)
    setCalendarLaunch(null)
    setActiveRouteId('multiplayer')
    setMultiplayerSubtab('daily')
    saveNavigationState({ activeRouteId: 'multiplayer', multiplayerSubtab: 'daily' })
  }, [])
  const cacheMultiplayerProgress = useCallback((currentProgress: GuestProgressState, nextMultiplayer: MultiplayerState): GuestProgressState => {
    const competitiveMultiplayer = settleMultiplayerStateResults(
      currentProgress.competitiveMultiplayer,
      nextMultiplayer,
      authState,
      { applyLocalRating: false },
    )
    return { ...currentProgress, multiplayer: nextMultiplayer, competitiveMultiplayer }
  }, [authState])
  const settleTrustedRankedGames = useCallback((nextMultiplayer: MultiplayerState) => {
    if (authState.status !== 'authenticated') {
      return
    }
    for (const game of nextMultiplayer.games) {
      if (!isTrustedRankedSettlementCandidate(game)) {
        continue
      }
      if (trustedRankedSettlementCompletedRef.current.has(game.id)) {
        continue
      }
      const settlementKey = `${game.id}:${game.updatedAt}`
      if (trustedRankedSettlementInFlightRef.current.has(settlementKey)) {
        continue
      }
      trustedRankedSettlementInFlightRef.current.add(settlementKey)
      void multiplayerRepositoryRef.current.settleRankedGame(game)
        .then((settlement) => {
          if (!settlement || settlement.transactions.length === 0) {
            trustedRankedSettlementCompletedRef.current.add(game.id)
            return
          }
          trustedRankedSettlementCompletedRef.current.add(game.id)
          setGuestProgress((currentProgress) => {
            const competitiveMultiplayer = applyTrustedSettlementResult(
              currentProgress.competitiveMultiplayer,
              game,
              settlement.transactions,
            )
            const nextProgress = { ...currentProgress, competitiveMultiplayer }
            persistActiveProgress(nextProgress)
            return nextProgress
          })
        })
        .catch(() => {
          // Trusted settlement can retry from the next durable snapshot.
        })
        .finally(() => {
          trustedRankedSettlementInFlightRef.current.delete(settlementKey)
        })
    }
  }, [authState.status, persistActiveProgress])
  useEffect(() => {
    trustedRankedSettlementInFlightRef.current.clear()
    trustedRankedSettlementCompletedRef.current.clear()
  }, [authenticatedMultiplayerUserId])
  const applyRemoteMultiplayerSnapshot = useCallback((snapshotState: MultiplayerState, authorityUserId?: string) => {
    multiplayerAuthorityUserIdRef.current = authorityUserId
    reportMultiplayerStateReadiness('repository-applied', snapshotState.games.length)
    multiplayerRef.current = snapshotState
    setMultiplayer(snapshotState)
    persistActiveMultiplayerState(snapshotState)
    setGuestProgress((currentProgress) => {
      const nextProgress = cacheMultiplayerProgress(currentProgress, snapshotState)
      persistActiveProgress(nextProgress)
      return nextProgress
    })
    settleTrustedRankedGames(snapshotState)
  }, [cacheMultiplayerProgress, persistActiveMultiplayerState, persistActiveProgress, settleTrustedRankedGames])
  const handleMultiplayerChange = useCallback(async (multiplayer: MultiplayerState) => {
    const previousMultiplayer = multiplayerRef.current
    multiplayerRef.current = multiplayer
    setMultiplayer(multiplayer)
    setGuestProgress((currentProgress) => {
      const nextProgress = cacheMultiplayerProgress(currentProgress, multiplayer)
      persistActiveProgress(nextProgress)
      return nextProgress
    })
    try {
      const snapshot = await multiplayerRepositoryRef.current.save(multiplayer)
      settleTrustedRankedGames(snapshot.state)
      return {}
    } catch {
      if (authState.status === 'authenticated') {
        try {
          const snapshot = await multiplayerRepositoryRef.current.load()
          applyRemoteMultiplayerSnapshot(snapshot.state, authenticatedMultiplayerUserId)
        } catch {
          multiplayerRef.current = previousMultiplayer
          setMultiplayer(previousMultiplayer)
          persistActiveMultiplayerState(previousMultiplayer)
          setGuestProgress((currentProgress) => {
            const restoredProgress = cacheMultiplayerProgress(currentProgress, previousMultiplayer)
            persistActiveProgress(restoredProgress)
            return restoredProgress
          })
        }
      } else {
        persistActiveMultiplayerState(multiplayer)
      }
      return { error: 'Unable to save this multiplayer update. The durable game was reloaded; please try again.' }
    }
  }, [applyRemoteMultiplayerSnapshot, authState.status, authenticatedMultiplayerUserId, cacheMultiplayerProgress, persistActiveMultiplayerState, persistActiveProgress, settleTrustedRankedGames])
  const handleCompetitiveMultiplayerChange = useCallback((competitiveMultiplayer: MultiplayerCompetitiveState) => {
    setGuestProgress((currentProgress) => {
      const nextProgress = { ...currentProgress, competitiveMultiplayer: normalizeCompetitiveMultiplayerState(competitiveMultiplayer) }
      persistActiveProgress(nextProgress)
      return nextProgress
    })
  }, [persistActiveProgress])
  const handleResumeCapture = useCallback((capture: ResumeCapture) => {
    const slotKey = getResumeSlotKey(capture)
    setCompletedSoloSlots((currentSlots) => {
      const nextSlots = isCaptureComplete(capture)
        ? setSoloDisplaySlot(currentSlots, slotKey, createResumeSlot(capture))
        : clearSoloDisplaySlot(currentSlots, slotKey)
      if (nextSlots !== currentSlots) {
        saveSoloCompletionDisplaySlots(activeProgressOwnerKey, nextSlots)
      }
      return nextSlots
    })
    setGuestProgress((currentProgress) => {
      const currentSlots = normalizeResumeSlots(currentProgress.resumeSlots)
      const currentSlot = currentSlots[slotKey]
      if (isCaptureInProgress(capture)) {
        const nextSlot = createResumeSlot(capture)
        if (isSameResumeSlot(currentSlot, nextSlot)) {
          return currentProgress
        }
        const nextSlots = { ...currentSlots, [slotKey]: nextSlot }
        const nextProgress = { ...currentProgress, resumeSlot: getLatestResumeSlot(nextSlots), resumeSlots: nextSlots }
        persistActiveProgress(nextProgress)
        return nextProgress
      }
      if (!currentSlot) {
        return currentProgress
      }
      const nextSlots = { ...currentSlots }
      delete nextSlots[slotKey]
      const resumeSlotsForSave = Object.keys(nextSlots).length > 0 ? nextSlots : undefined
      const nextProgress = { ...currentProgress, resumeSlot: getLatestResumeSlot(resumeSlotsForSave ?? {}), resumeSlots: resumeSlotsForSave }
      persistActiveProgress(nextProgress)
      return nextProgress
    })
  }, [activeProgressOwnerKey, persistActiveProgress])
  const handleSoloCloudMutation = useCallback((mutation: SoloCloudMutation) => {
    const currentAuth = authStateRef.current
    if (currentAuth.status !== 'authenticated' || !currentAuth.user || !soloCloudProgressRepository) {
      return
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSyncStatus(createSyncStatus('offline'))
      return
    }

    const userId = currentAuth.user.id
    setSyncStatus(createSyncStatus('syncing'))
    void soloCloudWriteQueueRef.current.enqueue(userId, () => soloCloudProgressRepository.saveMutation(userId, mutation))
      .then((session) => {
        const latestAuth = authStateRef.current
        if (latestAuth.status !== 'authenticated' || latestAuth.user?.id !== userId) {
          return
        }
        const hydrated = mergeSoloCloudSessionsIntoProgress(guestProgressRef.current, [session], {
          currentPracticeSeeds: getCurrentPracticeCloudSeeds(userId, guestProgressRef.current),
        })
        applyScopedProgress(hydrated.progress, { kind: 'authenticated', userId })
        if (hasSoloDisplaySlots(hydrated.completedSlots)) {
          setCompletedSoloSlots((currentSlots) => {
            const ownerKey = getProgressOwnerKey({ kind: 'authenticated', userId })
            const nextSlots = mergeSoloDisplaySlots(currentSlots, hydrated.completedSlots)
            if (nextSlots !== currentSlots) {
              saveSoloCompletionDisplaySlots(ownerKey, nextSlots)
            }
            return nextSlots
          })
        }
        setSyncStatus(createSyncStatus('synced'))
        flushAuthenticatedProgressSyncRef.current()
      })
      .catch(() => {
        const latestAuth = authStateRef.current
        if (latestAuth.status === 'authenticated' && latestAuth.user?.id === userId) {
          setSyncStatus(createSyncStatus('error'))
        }
      })

  }, [applyScopedProgress, soloCloudProgressRepository])
  const handleOpenSoloHistory = useCallback((filters?: { readonly mode?: SoloMode; readonly scope?: SoloScope }) => {
    const nextFilters: HistoryFilters = {
      mode: filters?.mode ?? 'all',
      player: 'solo',
      scope: filters?.scope ?? 'all',
    }
    setHistoryFilters(nextFilters)
    setActiveRouteId('history')
    saveNavigationState({ activeRouteId: 'history', historyFilters: nextFilters })
  }, [])
  const handleOpenMultiplayerHistory = useCallback(() => {
    const nextFilters: HistoryFilters = {
      mode: 'all',
      player: 'multiplayer',
      scope: 'all',
    }
    setHistoryFilters(nextFilters)
    setActiveRouteId('history')
    saveNavigationState({ activeRouteId: 'history', historyFilters: nextFilters })
  }, [])
  const handleHistoryFiltersChange = useCallback((filters: HistoryFilters) => {
    setHistoryFilters(filters)
    saveNavigationState({ historyFilters: filters })
  }, [])
  const handleResumeMultiplayerGame = useCallback((id: string): boolean => {
    const game = multiplayer.games.find((entry) => entry.id === id)
    const viewerUserId = authState.user?.id
    const viewerCanResume = Boolean(game && (!viewerUserId || getViewerMultiplayerPlayerId(game, viewerUserId)))

    if (!game || game.status !== 'playing' || !viewerCanResume) {
      setFocusedLiveSpectatorGameId(undefined)
      setSelectedMultiplayerGameId(undefined)
      setActiveRouteId('multiplayer')
      setMultiplayerSubtab('active')
      saveNavigationState({
        activeRouteId: 'multiplayer',
        multiplayerSubtab: 'active',
        selectedMultiplayerGameId: undefined,
      })
      return true
    }

    const nextSubtab: MultiplayerSubtabId = game.scope === 'daily' ? 'daily' : 'practice'
    setFocusedLiveSpectatorGameId(undefined)
    setSelectedMultiplayerGameId(id)
    setActiveRouteId('multiplayer')
    setMultiplayerSubtab(nextSubtab)
    saveNavigationState({
      activeRouteId: 'multiplayer',
      multiplayerSubtab: nextSubtab,
      selectedMultiplayerGameId: id,
    })
    requestMultiplayerGameplayAutoCenter()
    return true
  }, [authState.user?.id, multiplayer.games, requestMultiplayerGameplayAutoCenter])
  const dashboardActionHandlers = useMemo<DashboardActionHandlers>(() => ({
      onHistoryFiltersChange: handleHistoryFiltersChange,
      onMultiplayerSubtabChange: handleMultiplayerSubtabChange,
      onResumeMultiplayerGame: handleResumeMultiplayerGame,
      onSelectMultiplayerGame: handleSelectMultiplayerGame,
      onSelectRoute: handleNavigate,
      onSelectSoloGame: handleSelectSoloGame,
      onSoloSubtabChange: handleSoloSubtabChange,
  }), [
    handleHistoryFiltersChange,
    handleMultiplayerSubtabChange,
    handleNavigate,
    handleResumeMultiplayerGame,
    handleSelectMultiplayerGame,
    handleSelectSoloGame,
    handleSoloSubtabChange,
  ])
  const handleDashboardAction = useCallback((target: DashboardActionTarget) => {
    dispatchDashboardAction(target, dashboardActionHandlers)
  }, [dashboardActionHandlers])
  const updateNotificationMetadata = useCallback((
    updater: (current: NotificationMetadataState) => NotificationMetadataState,
  ) => {
    setNotificationMetadata((current) => {
      const next = updater(current)
      saveNotificationMetadata(next)
      return next
    })
  }, [])
  const handleMarkNotificationRead = useCallback((item: NotificationItemViewModel) => {
    markNotificationItemRead(item, updateNotificationMetadata)
  }, [updateNotificationMetadata])
  const handleMarkAllNotificationsRead = useCallback((items: readonly NotificationItemViewModel[]) => {
    markVisibleNotificationItemsRead(items, updateNotificationMetadata)
  }, [updateNotificationMetadata])
  const handleDismissNotification = useCallback((item: NotificationItemViewModel) => {
    dismissNotificationItem(item, updateNotificationMetadata)
  }, [updateNotificationMetadata])
  const handleNotificationAction = useCallback((item: NotificationItemViewModel) => {
    activateNotificationItem(item, {
      dashboardHandlers: dashboardActionHandlers,
      updateMetadata: updateNotificationMetadata,
    })
  }, [dashboardActionHandlers, updateNotificationMetadata])
  useEffect(() => {
    const currentFingerprints = getBrowserNotificationFingerprints(notifications.items)
    const previousFingerprints = browserNotificationFingerprintsRef.current

    if (!previousFingerprints) {
      browserNotificationFingerprintsRef.current = new Set(currentFingerprints)
      return
    }

    const decisions = selectBrowserNotificationDispatches({
      documentHidden: typeof document !== 'undefined' && document.visibilityState === 'hidden',
      items: notifications.items,
      permission: getBrowserNotificationPermissionState(),
      preferences: guestProgress.settings,
      previousFingerprints: Array.from(previousFingerprints),
      routeContext: {
        activeRouteId,
        multiplayerSubtab,
        selectedMultiplayerGameId,
        selectedSoloGameKey,
        soloSubtab,
      },
    })

    decisions.forEach((decision) => {
      dispatchBrowserNotification(decision.item, undefined, {
        onClick: handleNotificationAction,
      })
    })

    browserNotificationFingerprintsRef.current = new Set([
      ...Array.from(previousFingerprints),
      ...currentFingerprints,
    ])
  }, [
    activeRouteId,
    guestProgress.settings,
    handleNotificationAction,
    multiplayerSubtab,
    notifications.items,
    selectedMultiplayerGameId,
    selectedSoloGameKey,
    soloSubtab,
  ])
  const handleResumeSoloGame = useCallback((key: SoloActiveGameKey) => {
    const slot = resumeSlots[key]
    if (!slot) {
      return
    }

    setSelectedSoloGameKey(key)
    setActiveRouteId('solo')
    if (slot.scope === 'practice') {
      setPracticeModeState(slot.mode)
      setSoloSubtab('practice')
      saveNavigationState({
        activeRouteId: 'solo',
        legacyPracticeMode: slot.mode,
        selectedSoloGameKey: key,
        soloSubtab: 'practice',
      })
      requestSoloGameplayAutoCenter()
      return
    }

    setSoloDailyMode(slot.mode)
    setSoloSubtab('daily')
    saveNavigationState({
      activeRouteId: 'solo',
      selectedSoloGameKey: key,
      soloSubtab: 'daily',
    })
    requestSoloGameplayAutoCenter()
  }, [requestSoloGameplayAutoCenter, resumeSlots])
  const navigateToResumeSlot = useCallback((slot: ResumeSlot | undefined) => {
    if (!slot) {
      return
    }
    const slotKey = getResumeSlotKey(slot)
    if (slot.scope === 'practice') {
      setPracticeModeState(slot.mode)
      setSelectedSoloGameKey(slotKey)
      setActiveRouteId('solo')
      setSoloSubtab('practice')
      saveNavigationState({
        activeRouteId: 'solo',
        legacyPracticeMode: slot.mode,
        selectedSoloGameKey: slotKey,
        soloSubtab: 'practice',
      })
      requestSoloGameplayAutoCenter()
      return
    }
    // Daily resume now lands inside the Solo workspace; Calendar remains the
    // compatibility hub for past dailies and legacy daily routes.
    setSoloDailyMode(slot.mode)
    setSelectedSoloGameKey(slotKey)
    setActiveRouteId('solo')
    setSoloSubtab('daily')
    saveNavigationState({
      activeRouteId: 'solo',
      selectedSoloGameKey: slotKey,
      soloSubtab: 'daily',
    })
    requestSoloGameplayAutoCenter()
  }, [requestSoloGameplayAutoCenter])
  // Auto-resume the most recent unfinished game once per signed-in load (spec §2).
  const clearIdentityScopedSelections = useCallback(() => {
    setSelectedSoloGameKey(undefined)
    setSelectedMultiplayerGameId(undefined)
    setFocusedLiveSpectatorGameId(undefined)
    saveNavigationState({
      selectedSoloGameKey: undefined,
      selectedMultiplayerGameId: undefined,
    })
  }, [])
  // Called from async auth callbacks (not synchronously in an effect body).
  const maybeAutoResume = useCallback((nextAuthState: AuthState, progress: GuestProgressState = guestProgressRef.current) => {
    if (nextAuthState.status !== 'authenticated' || autoResumedRef.current) {
      return
    }
    const slot = getLatestResumeSlot(normalizeResumeSlots(progress.resumeSlots))
    if (!slot) {
      return
    }
    autoResumedRef.current = true
    navigateToResumeSlot(slot)
  }, [navigateToResumeSlot])
  const hydrateProgressForAuthState = useCallback((nextAuthState: AuthState, options: { readonly autoResume?: boolean; readonly clearSelections?: boolean } = {}) => {
    const requestId = ++authHydrationRequestRef.current
    if (shouldInvalidateAuthenticatedProgressSyncForAuthState({
      currentScope: activeProgressScopeRef.current,
      nextAuthState,
    })) {
      invalidateAuthenticatedProgressSync()
    }
    if (nextAuthState.status === 'authenticated' && nextAuthState.user && supabaseClient) {
      const userId = nextAuthState.user.id
      setSyncStatus(createSyncStatus('syncing'))
      void loadAuthenticatedProgressForScope({
        isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
        repository: createSupabaseProgressRepository(supabaseClient),
        userId,
      }).then(async (result) => {
        if (authHydrationRequestRef.current !== requestId) {
          return
        }
        const currentAuth = authStateRef.current
        if (currentAuth.status !== 'authenticated' || currentAuth.user?.id !== userId) {
          return
        }
        let hydratedProgress = result.progress
        let hydratedCompletedSlots: ResumeSlotCollection = {}
        let soloCloudStatus = result.status
        if (soloCloudProgressRepository) {
          try {
            const sessions = await soloCloudProgressRepository.loadRecentSessions(userId)
            const hydrated = mergeSoloCloudSessionsIntoProgress(result.progress, sessions, {
              currentPracticeSeeds: getCurrentPracticeCloudSeeds(userId, result.progress),
            })
            hydratedProgress = hydrated.progress
            hydratedCompletedSlots = hydrated.completedSlots
          } catch {
            soloCloudStatus = createSyncStatus('error')
          }
        }
        if (authHydrationRequestRef.current !== requestId) {
          return
        }
        const latestAuth = authStateRef.current
        if (latestAuth.status !== 'authenticated' || latestAuth.user?.id !== userId) {
          return
        }
        applyScopedProgress(hydratedProgress, { kind: 'authenticated', userId })
        if (hasSoloDisplaySlots(hydratedCompletedSlots)) {
          setCompletedSoloSlots((currentSlots) => {
            const ownerKey = getProgressOwnerKey({ kind: 'authenticated', userId })
            const nextSlots = mergeSoloDisplaySlots(currentSlots, hydratedCompletedSlots)
            if (nextSlots !== currentSlots) {
              saveSoloCompletionDisplaySlots(ownerKey, nextSlots)
            }
            return nextSlots
          })
        }
        if (options.clearSelections !== false) {
          clearIdentityScopedSelections()
        }
        setSyncStatus(soloCloudStatus)
        if (options.autoResume !== false) {
          maybeAutoResume(nextAuthState, hydratedProgress)
        }
      })
      return
    }

    const scope = getProgressScopeForAuthState(nextAuthState)
    applyScopedProgress(loadGuestProgress(), scope)
    clearIdentityScopedSelections()
    setSyncStatus(createSyncStatus(supabaseClient ? 'idle' : 'error'))
  }, [applyScopedProgress, clearIdentityScopedSelections, invalidateAuthenticatedProgressSync, maybeAutoResume, soloCloudProgressRepository, supabaseClient])
  const refreshAuthenticatedProgressFromCloud = useCallback(() => {
    const nextAuthState = authStateRef.current
    if (!canRefreshAuthenticatedProgress({
      authState: nextAuthState,
      hasPendingSoloCloudWrite: nextAuthState.status === 'authenticated' && nextAuthState.user?.id
        ? soloCloudWriteQueueRef.current.hasPending(nextAuthState.user.id)
        : false,
      hasPendingUpload: authenticatedProgressSyncDirtyRef.current,
      hasScheduledUpload: Boolean(authenticatedProgressSyncTimeoutRef.current),
      isUploadInFlight: authenticatedProgressSyncInFlightRef.current,
      scope: activeProgressScopeRef.current,
    })) {
      return
    }

    hydrateProgressForAuthState(nextAuthState, { autoResume: false, clearSelections: false })
  }, [hydrateProgressForAuthState])
  const applyAuthoritativeEconomySnapshot = useCallback((snapshot: ReturnType<typeof createEconomySnapshot>) => {
    const currentProgress = guestProgressRef.current
    if (snapshot.revision < currentProgress.progression.economyRevision) {
      return
    }
    const nextProgress: GuestProgressState = {
      ...currentProgress,
      progression: {
        ...currentProgress.progression,
        coins: snapshot.coins,
        consumables: snapshot.consumables,
        economyOperationIds: snapshot.appliedOperationIds,
        economyRevision: snapshot.revision,
      },
    }
    guestProgressRef.current = nextProgress
    persistActiveProgress(nextProgress)
    setGuestProgress(nextProgress)
  }, [persistActiveProgress])
  useEffect(() => {
    if (activeRouteId !== 'marketplace' || authState.status !== 'authenticated' || !economyRepository) {
      return undefined
    }
    let active = true
    void economyRepository.load().then((result) => {
      if (active && result) {
        applyAuthoritativeEconomySnapshot(toEconomySnapshot(result, guestProgressRef.current.progression.economyOperationIds))
      }
    }).catch(() => {
      if (active) setSyncStatus(createSyncStatus('error'))
    })
    return () => { active = false }
  }, [activeRouteId, applyAuthoritativeEconomySnapshot, authState.status, economyRepository])
  const handleEconomyCommand = useCallback(async (command: EconomyCommand): Promise<boolean> => {
    if (authStateRef.current.status === 'authenticated') {
      if (!economyRepository) {
        return false
      }
      try {
        const authoritative = await economyRepository.execute(command)
        applyAuthoritativeEconomySnapshot(toEconomySnapshot(authoritative, guestProgressRef.current.progression.economyOperationIds))
        return true
      } catch {
        setSyncStatus(createSyncStatus('error'))
        return false
      }
    }
    const currentProgress = guestProgressRef.current
    const result = applyEconomyCommand(createEconomySnapshot({
      appliedOperationIds: currentProgress.progression.economyOperationIds,
      coins: currentProgress.progression.coins,
      consumables: currentProgress.progression.consumables,
      revision: currentProgress.progression.economyRevision,
    }), command)
    if (!result.ok) {
      return false
    }
    applyAuthoritativeEconomySnapshot(result.snapshot)
    return true
  }, [applyAuthoritativeEconomySnapshot, economyRepository])
  const handleGameComplete = useCallback((input: CompletedGameInput) => {
    setGuestProgress((currentProgress) => {
      const recordedProgress = recordCompletedGame(input, currentProgress)
      if (recordedProgress === currentProgress) {
        return currentProgress
      }
      const usesServerAuthority = authStateRef.current.status === 'authenticated' && Boolean(economyRepository)
      const nextProgress = usesServerAuthority ? {
        ...recordedProgress,
        progression: {
          ...recordedProgress.progression,
          coins: currentProgress.progression.coins,
          consumables: currentProgress.progression.consumables,
          economyOperationIds: currentProgress.progression.economyOperationIds,
          economyRevision: currentProgress.progression.economyRevision,
        },
      } : recordedProgress
      guestProgressRef.current = nextProgress
      persistActiveProgress(nextProgress)
      if (usesServerAuthority && economyRepository) {
        void economyRepository.execute({
          amount: calculateCoinAward(input),
          operationId: `reward:${input.gameId}`,
          type: 'award',
        }).then((result) => {
          applyAuthoritativeEconomySnapshot(toEconomySnapshot(result, guestProgressRef.current.progression.economyOperationIds))
        }).catch(() => setSyncStatus(createSyncStatus('error')))
      }
      if (!shouldPersistProgressToGuestStorage(activeProgressScopeRef.current)) {
        window.setTimeout(() => flushAuthenticatedProgressSyncRef.current(), 0)
      }
      return nextProgress
    })
    if (input.status === 'won') {
      sound.play('game-over-win')
    } else if (input.status === 'lost') {
      sound.play('game-over-loss')
    }
  }, [applyAuthoritativeEconomySnapshot, economyRepository, persistActiveProgress, sound])
  const handleResetProgress = useCallback(() => {
    const scope = activeProgressScopeRef.current
    clearSoloCompletionDisplaySlots(getProgressOwnerKey(scope))
    applyScopedProgress(createDefaultGuestProgress(), scope)
    clearIdentityScopedSelections()
  }, [applyScopedProgress, clearIdentityScopedSelections])
  const handleUpdateSettings = useCallback((patch: Partial<ReturnType<typeof loadGuestProgress>['settings']>) => {
    setGuestProgress((currentProgress) => {
      const nextSettings = normalizeGuestSettings({ ...currentProgress.settings, ...patch })
      const nextProgress = { ...currentProgress, settings: nextSettings }
      persistActiveProgress(nextProgress)
      return nextProgress
    })
  }, [persistActiveProgress])
  const handleSpendCoins = useCallback((amount: number, operationId = `spend:${amount}:${guestProgressRef.current.progression.economyRevision + 1}`) => handleEconomyCommand({
    amount,
    operationId,
    type: 'spend',
  }), [handleEconomyCommand])
  const handlePurchaseConsumable = useCallback(async (consumable: ConsumableType) => {
    return handleEconomyCommand({
      consumable,
      operationId: `purchase:${consumable}:${guestProgressRef.current.progression.economyRevision + 1}`,
      type: 'purchase',
    })
  }, [handleEconomyCommand])
  const handleConsumeConsumable = useCallback((consumable: ConsumableType, operationId: string) => handleEconomyCommand({
    consumable,
    operationId,
    scope: 'practice',
    type: 'consume',
  }), [handleEconomyCommand])
  const handleSendMagicLink = useCallback((email: string) => {
    if (!supabaseClient || !email.trim()) {
      return
    }
    setAuthMessage(undefined)
    setAuthBusy(true)
    void sendMagicLink(supabaseClient, email).then((result) => {
      setAuthBusy(false)
      setAuthMessage(result.ok ? 'Magic link sent. Open the link in this same browser to finish signing in.' : classifyAuthError({ message: result.message }, 'magic-link'))
    })
  }, [supabaseClient])
  const handleSignInWithPassword = useCallback((email: string, password: string) => {
    if (!supabaseClient) {
      return
    }
    setAuthMessage(undefined)
    setAuthBusy(true)
    void signInWithPassword(supabaseClient, email, password).then((result) => {
      setAuthBusy(false)
      if (!result.ok) {
        setAuthMessage(result.message)
      }
    })
  }, [supabaseClient])
  const handleSignUpWithPassword = useCallback((email: string, password: string) => {
    if (!supabaseClient) {
      return
    }
    setAuthMessage(undefined)
    setAuthBusy(true)
    void signUpWithPassword(supabaseClient, email, password).then((result) => {
      setAuthBusy(false)
      if (!result.ok) {
        setAuthMessage(result.message)
      } else {
        setAuthMessage('Account request sent. Check your email for a confirmation link before signing in.')
      }
    })
  }, [supabaseClient])
  const handleRequestPasswordReset = useCallback((email: string) => {
    if (!supabaseClient) {
      return
    }
    setAuthMessage(undefined)
    setAuthBusy(true)
    void sendPasswordResetEmail(supabaseClient, email).then((result) => {
      setAuthBusy(false)
      if (!result.ok) {
        setAuthMessage(result.message)
      } else {
        setAuthMessage('Check your email for a password reset link.')
      }
    })
  }, [supabaseClient])
  const handleOpenPasswordChange = useCallback(() => {
    if (authState.status !== 'authenticated') {
      return
    }
    setAuthMessage(undefined)
    setPasswordResetMessage(undefined)
    setPasswordResetOpen(true)
  }, [authState.status])
  const handleClosePasswordReset = useCallback(() => {
    setPasswordResetOpen(false)
    setPasswordResetMessage(undefined)
    clearPasswordResetUrlMarker()
  }, [])
  const handleUpdatePassword = useCallback((password: string) => {
    if (!supabaseClient) {
      return
    }
    setPasswordResetMessage(undefined)
    setAuthBusy(true)
    void updatePassword(supabaseClient, password).then((result) => {
      setAuthBusy(false)
      if (!result.ok) {
        setPasswordResetMessage(result.message)
        return
      }
      setPasswordResetMessage('Password updated. You can close this window and continue playing.')
      clearPasswordResetUrlMarker()
    })
  }, [supabaseClient])
  const handleSignOut = useCallback(() => {
    if (!supabaseClient || authBusy) {
      return
    }

    setAuthMessage(undefined)
    setProfileMessage(undefined)
    setAuthBusy(true)
    flushAuthenticatedProgressSyncRef.current()
    void Promise.all([
      authStateRef.current.status === 'authenticated' && authStateRef.current.user
        ? soloCloudWriteQueueRef.current.waitFor(authStateRef.current.user.id)
        : Promise.resolve(),
      pendingAuthenticatedProgressSyncRef.current.catch(() => undefined),
    ]).then(() => signOut(supabaseClient)).then((result) => {
      setAuthBusy(false)
      if (!result.ok) {
        setAuthMessage(result.message)
        setProfileMessage(result.message)
        return
      }

      const anonymousAuthState: AuthState = { status: 'anonymous' }
      authStateRef.current = anonymousAuthState
      setAuthState(anonymousAuthState)
      hydrateProgressForAuthState(anonymousAuthState, { autoResume: false })
      setPublicProfile(undefined)
      setAuthModalOpen(false)
      setPasswordResetOpen(false)
      setProfilePanelOpen(false)
    })
  }, [authBusy, hydrateProgressForAuthState, supabaseClient])
  const handleOpenAuthModal = useCallback(() => {
    setAuthMessage(undefined)
    setAuthModalOpen(true)
  }, [])
  const handleCloseAuthModal = useCallback(() => {
    setAuthModalOpen(false)
  }, [])
  const handleOpenProfilePanel = useCallback(() => {
    setProfileMessage(undefined)
    setPublicProfileMessage(undefined)
    setProfilePanelOpen(false)
    handleNavigate('profile')
  }, [handleNavigate])
  const handleOpenSettings = useCallback(() => {
    setProfilePanelOpen(false)
    handleNavigate('settings')
  }, [handleNavigate])
  const handleOpenStats = useCallback(() => {
    handleNavigate('stats')
  }, [handleNavigate])
  const handleCloseProfilePanel = useCallback(() => {
    setProfilePanelOpen(false)
  }, [])
  const profileSurfaceActive = profilePanelOpen || activeRouteId === 'profile'
  useEffect(() => {
    if (!profileSurfaceActive) {
      return
    }
    if (authState.status !== 'authenticated' || !authState.user || !supabaseClient) {
      return
    }

    let cancelled = false
    const repository = createSupabasePublicProfileRepository(supabaseClient)
    void Promise.resolve()
      .then(() => {
        if (!cancelled) {
          setPublicProfileBusy(true)
          setPublicProfileMessage(undefined)
        }
        return repository.loadMine()
      })
      .then((profile) => {
        if (cancelled) {
          return
        }
        setPublicProfile(profile)
        setPublicProfileMessage(profile ? undefined : 'No public profile saved yet. Visibility starts private.')
      })
      .catch(() => {
        if (!cancelled) {
          setPublicProfileMessage('Unable to load public profile right now.')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPublicProfileBusy(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [authState.status, authState.user, profileSurfaceActive, supabaseClient])
  const handleSyncNow = useCallback(() => {
    if (authState.status !== 'authenticated' || !authState.user || !supabaseClient) {
      if (authState.status === 'anonymous') {
        handleOpenAuthModal()
      } else {
        handleNavigate('settings')
      }
      setSyncStatus(createSyncStatus(supabaseClient ? 'idle' : 'error'))
      return
    }

    if (!canSyncProgressForAuthState(authState, activeProgressScopeRef.current)) {
      hydrateProgressForAuthState(authState, { autoResume: false })
      return
    }

    const userId = authState.user.id
    setSyncStatus(createSyncStatus('syncing'))
    void syncGuestProgress({
      isOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
      localProgress: guestProgressRef.current,
      localUpdatedAt: new Date().toISOString(),
      repository: createSupabaseProgressRepository(supabaseClient),
      userId,
    }).then((result) => {
      applyScopedProgress(result.progress, { kind: 'authenticated', userId })
      setSyncStatus(result.status)
    })
  }, [applyScopedProgress, authState, handleNavigate, handleOpenAuthModal, hydrateProgressForAuthState, supabaseClient])
  const handleSaveProfile = useCallback(async (input: { readonly displayName?: string; readonly accentColor?: ProfileAccentColor; readonly avatarUrl?: string }) => {
    if (!supabaseClient) {
      return
    }
    setProfileMessage(undefined)
    setProfileBusy(true)
    const result = await updateProfile(supabaseClient, input)
    setProfileBusy(false)
    if (!result.ok) {
      setProfileMessage(result.message)
      return
    }
    setProfileMessage('Profile saved.')
    // Re-derive AuthState so the new metadata flows to AccountBadge immediately.
    const fresh = await getCurrentAuthState(supabaseClient)
    authStateRef.current = fresh
    setAuthState(fresh)
    setProfilePanelOpen(false)
  }, [supabaseClient])
  const handleSavePublicProfile = useCallback(async (input: PublicProfileUpdateInput) => {
    if (!supabaseClient || authState.status !== 'authenticated' || !authState.user) {
      setPublicProfileMessage('Sign in to save a public profile.')
      return
    }
    setPublicProfileMessage(undefined)
    setPublicProfileBusy(true)
    try {
      const repository = createSupabasePublicProfileRepository(supabaseClient)
      const saved = await repository.saveMine(input, authState.user.id)
      setPublicProfile(saved)
      setPublicProfileMessage(saved.visibility === 'public'
        ? 'Public profile saved and visible.'
        : 'Public profile saved privately.')
    } catch (error) {
      setPublicProfileMessage(error instanceof Error ? error.message : 'Unable to save public profile right now.')
    } finally {
      setPublicProfileBusy(false)
    }
  }, [authState, supabaseClient])

  useEffect(() => {
    guestProgressRef.current = guestProgress
  }, [guestProgress])

  useEffect(() => {
    multiplayerRef.current = mergeMultiplayerStates(multiplayerRef.current, multiplayer)
  }, [multiplayer])

  useEffect(() => () => {
    if (authenticatedProgressSyncTimeoutRef.current) {
      clearTimeout(authenticatedProgressSyncTimeoutRef.current)
      authenticatedProgressSyncTimeoutRef.current = undefined
    }
  }, [])

  useEffect(() => {
    authStateRef.current = authState
  }, [authState])

  useEffect(() => {
    if (authState.status !== 'authenticated') {
      return
    }

    const handleWindowFocus = () => refreshAuthenticatedProgressFromCloud()
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshAuthenticatedProgressFromCloud()
      }
    }

    window.addEventListener('focus', handleWindowFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', handleWindowFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [authState.status, refreshAuthenticatedProgressFromCloud])

  useEffect(() => {
    if (activeRouteId === 'solo') {
      refreshAuthenticatedProgressFromCloud()
    }
  }, [activeRouteId, refreshAuthenticatedProgressFromCloud, soloSubtab])

  useEffect(() => {
    multiplayerRepositoryRef.current = multiplayerRepository
    let isActive = true
    const applySnapshot = (snapshotState: MultiplayerState) => {
      if (!isActive) {
        return
      }
      applyRemoteMultiplayerSnapshot(snapshotState, authenticatedMultiplayerUserId)
    }
    const unsubscribe = multiplayerRepository.subscribe((snapshot) => {
      applySnapshot(snapshot.state)
    })
    void loadMultiplayerRepositoryWithRetry(multiplayerRepository).then((snapshot) => {
      applySnapshot(snapshot.state)
    }).catch(() => undefined)
    return () => {
      isActive = false
      unsubscribe()
    }
  }, [applyRemoteMultiplayerSnapshot, authenticatedMultiplayerUserId, multiplayerRepository])

  useEffect(() => {
    if (authState.status !== 'authenticated') {
      const timeoutId = window.setTimeout(() => setPrivateMatchRequestsForNotifications([]), 0)
      return () => window.clearTimeout(timeoutId)
    }
    let active = true
    let inFlight = false
    const refresh = () => {
      if (inFlight || (typeof document !== 'undefined' && document.visibilityState !== 'visible')) return
      inFlight = true
      void multiplayerRepository.listPrivateMatchRequests({ limit: 100 })
        .then((requests) => { if (active) setPrivateMatchRequestsForNotifications(requests) })
        .catch(() => { if (active) setPrivateMatchRequestsForNotifications([]) })
        .finally(() => { inFlight = false })
    }
    refresh()
    const intervalId = window.setInterval(refresh, 5_000)
    window.addEventListener('focus', refresh)
    return () => {
      active = false
      window.clearInterval(intervalId)
      window.removeEventListener('focus', refresh)
    }
  }, [authState.status, multiplayerRepository])

  useEffect(() => {
    if (activeRouteId !== 'multiplayer') {
      return undefined
    }

    let isActive = true
    let inFlight = false
    const isDocumentVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible'
    const refresh = () => {
      if (inFlight || !isDocumentVisible()) {
        return
      }
      inFlight = true
      void loadMultiplayerRepositoryWithRetry(multiplayerRepository)
        .then((snapshot) => {
          if (isActive) {
            applyRemoteMultiplayerSnapshot(snapshot.state, authenticatedMultiplayerUserId)
          }
        })
        .catch(() => undefined)
        .finally(() => {
          inFlight = false
        })
    }
    const handleVisibilityChange = () => {
      if (isDocumentVisible()) {
        refresh()
      }
    }

    const timeoutId = setTimeout(refresh, 0)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', refresh)
    }

    return () => {
      isActive = false
      clearTimeout(timeoutId)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', refresh)
      }
    }
  }, [activeRouteId, applyRemoteMultiplayerSnapshot, authenticatedMultiplayerUserId, multiplayerRepository])

  useEffect(() => {
    if (!supabaseClient) {
      const timeoutId = setTimeout(() => {
        setLiveSpectatorRows([])
        setFocusedLiveSpectatorGameId(undefined)
      }, 0)
      return () => clearTimeout(timeoutId)
    }

    let isActive = true
    let inFlight = false
    let intervalId: ReturnType<typeof setInterval> | undefined
    const isDocumentVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible'
    const refresh = () => {
      if (inFlight || !isDocumentVisible()) {
        return
      }
      inFlight = true
      const loadRows = authenticatedMultiplayerUserId
        ? loadAuthenticatedLiveSpectatorRows(supabaseClient)
        : loadPublicLiveSpectatorRows(supabaseClient)
      void loadRows
        .then((rows) => {
          if (isActive) {
            setLiveSpectatorRows(rows)
          }
        })
        .catch(() => undefined)
        .finally(() => {
          inFlight = false
        })
    }
    const clearScheduledRefresh = () => {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = undefined
      }
    }
    const scheduleRefresh = () => {
      clearScheduledRefresh()
      if (!isDocumentVisible()) {
        return
      }
      const intervalMs = liveSpectatorSurfaceActive
        ? LIVE_SPECTATOR_ACTIVE_POLL_INTERVAL_MS
        : LIVE_SPECTATOR_IDLE_POLL_INTERVAL_MS
      intervalId = setInterval(refresh, intervalMs)
    }
    const handleVisibilityChange = () => {
      if (isDocumentVisible()) {
        refresh()
      }
      scheduleRefresh()
    }

    refresh()
    scheduleRefresh()
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }
    return () => {
      isActive = false
      clearScheduledRefresh()
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
    }
  }, [authenticatedMultiplayerUserId, liveSpectatorSurfaceActive, supabaseClient])

  useEffect(() => () => {
    if (dailyAlertTimeoutRef.current) {
      clearTimeout(dailyAlertTimeoutRef.current)
    }
    if (dailyMultiplayerAlertTimeoutRef.current) {
      clearTimeout(dailyMultiplayerAlertTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const expired = expireStaleDailyMultiplayerGames(multiplayer)
      if (JSON.stringify(expired) === JSON.stringify(multiplayer)) {
        return
      }
      reportMultiplayerStateReadiness('expiry-applied', expired.games.length)
      setMultiplayer(expired)
      void multiplayerRepositoryRef.current.save(expired).then((snapshot) => {
        settleTrustedRankedGames(snapshot.state)
      }).catch(() => {
        persistActiveMultiplayerState(expired)
      })
      setGuestProgress((currentProgress) => {
        const nextProgress = cacheMultiplayerProgress(currentProgress, expired)
        persistActiveProgress(nextProgress)
        return nextProgress
      })
    }, 0)
    return () => clearTimeout(timeoutId)
  }, [cacheMultiplayerProgress, multiplayer, dailyMultiplayer.dateKey, persistActiveMultiplayerState, persistActiveProgress, settleTrustedRankedGames])

  const hasTimedPracticeMultiplayerGames = multiplayer.games.some((game) => (
    game.scope === 'practice'
    && game.status === 'playing'
    && typeof game.timeLimitMs === 'number'
    && game.timeLimitMs > 0
  ))

  useEffect(() => {
    if (!hasTimedPracticeMultiplayerGames) {
      return undefined
    }
    const intervalId = setInterval(() => {
      setMultiplayer((currentState) => {
        const expired = expireTimedOutPracticeMultiplayerGames(currentState, new Date(), authenticatedMultiplayerUserId)
        if (JSON.stringify(expired) === JSON.stringify(currentState)) {
          return currentState
        }
        void multiplayerRepositoryRef.current.save(expired).then((snapshot) => {
          settleTrustedRankedGames(snapshot.state)
        }).catch(() => {
          persistActiveMultiplayerState(expired)
        })
        setGuestProgress((currentProgress) => {
          const nextProgress = cacheMultiplayerProgress(currentProgress, expired)
          persistActiveProgress(nextProgress)
          return nextProgress
        })
        return expired
      })
    }, 1000)
    return () => clearInterval(intervalId)
  }, [authenticatedMultiplayerUserId, cacheMultiplayerProgress, hasTimedPracticeMultiplayerGames, persistActiveMultiplayerState, persistActiveProgress, settleTrustedRankedGames])

  useEffect(() => {
    applyTheme(guestProgress.settings.themeDefault)
  }, [guestProgress.settings.themeDefault])

  // Phase 21: the minimalist surface is the baseline. The Lunar Signal Deck
  // backdrop becomes a selectable surface theme in Phase 22.
  useEffect(() => {
    applySurfaceTheme(DEFAULT_SURFACE_THEME)
  }, [])

  useEffect(() => {
    let isMounted = true
    void getCurrentAuthState(supabaseClient).then((nextAuthState) => {
      if (isMounted) {
        const shouldOpenPasswordReset = isPasswordResetUrl() && nextAuthState.status === 'authenticated'
        authStateRef.current = nextAuthState
        setAuthState(nextAuthState)
        hydrateProgressForAuthState(nextAuthState, { autoResume: false })
        if (shouldOpenPasswordReset) {
          setAuthModalOpen(false)
          setProfilePanelOpen(false)
          setPasswordResetOpen(true)
          setPasswordResetMessage(undefined)
          return
        }
      }
    })
    const subscription = subscribeToAuthChanges(supabaseClient, (nextAuthState, event) => {
      if (isMounted) {
        const shouldOpenPasswordReset = event === 'PASSWORD_RECOVERY' || (isPasswordResetUrl() && nextAuthState.status === 'authenticated')
        authStateRef.current = nextAuthState
        setAuthState(nextAuthState)
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'PASSWORD_RECOVERY') {
          hydrateProgressForAuthState(nextAuthState, { autoResume: false })
        }
        if (shouldOpenPasswordReset) {
          setAuthModalOpen(false)
          setProfilePanelOpen(false)
          setPasswordResetOpen(true)
          setPasswordResetMessage(undefined)
          return
        }
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [hydrateProgressForAuthState, supabaseClient])

  return (
    <>
      <LunarSignalStage
        accountControls={(
          <div className="brrrdle-lunar-account-stack">
            <AccountBadge
              authState={authState}
              onOpenAuthModal={handleOpenAuthModal}
              onOpenProfile={handleOpenProfilePanel}
              onOpenSettings={handleOpenSettings}
              onSignOut={handleSignOut}
            />
            <NotificationCenter
              onActivate={handleNotificationAction}
              onDismiss={handleDismissNotification}
              onMarkAllRead={handleMarkAllNotificationsRead}
              onMarkRead={handleMarkNotificationRead}
              viewModel={notifications}
            />
          </div>
        )}
        activeRoute={activeRoute}
        dailyCountdown={(
          <>
            {countdownEnabled ? (
              <DailyCountdown
                alerting={dailyAlerting}
                clamped={daily.clamped}
                countdownLabel={daily.countdownLabel}
                onActivate={handleCountdownActivate}
                timeZone={daily.timeZone}
              />
            ) : null}
            {dailyMultiplayerCountdownEnabled ? (
              <DailyCountdown
                alerting={dailyMultiplayerAlerting}
                clamped={dailyMultiplayer.clamped}
                countdownLabel={dailyMultiplayer.countdownLabel}
                deadlineLabel={MULTIPLAYER_DAILY_VARIANT.deadlineLabel}
                label={MULTIPLAYER_DAILY_VARIANT.countdownLabel}
                onActivate={handleDailyMultiplayerCountdownActivate}
                readyLabel={MULTIPLAYER_DAILY_VARIANT.readyLabel}
                timeZone={dailyMultiplayer.timeZone}
              />
            ) : null}
          </>
        )}
        focusModeEnabled={focusModeEnabled}
        onFocusModeChange={setFocusModeEnabled}
        surfaceTheme={DEFAULT_SURFACE_THEME}
        metrics={[
          { label: 'daily', value: `${DAILY_WORD_LENGTH} letters` },
          { label: 'practice', value: `${MIN_PRACTICE_WORD_LENGTH}-${MAX_PRACTICE_WORD_LENGTH}` },
          { label: 'go chain', value: `${guestProgress.settings.goPuzzleCountDefault} boards` },
          { label: 'banks', value: BUNDLED_WORD_LIST_LENGTHS.length },
        ]}
        onNavigate={handleNavigate}
        progressionHud={<ProgressionHud progression={guestProgress.progression} onOpenStats={handleOpenStats} />}
        routeAttention={routeAttention}
        routes={prismRoutes}
      >
          <RoutePanel
            authMessage={authMessage}
            authState={authState}
            completedSoloSlots={visibleCompletedSoloSlots}
            dashboard={dashboard}
            multiplayer={multiplayer}
            liveSpectatorRows={liveSpectatorRows}
            calendarLaunch={calendarLaunch}
            guestProgress={guestProgress}
            historyFilters={historyFilters}
            onCalendarLaunchConsumed={handleClearCalendarLaunch}
            onMultiplayerChange={handleMultiplayerChange}
            onCompetitiveMultiplayerChange={handleCompetitiveMultiplayerChange}
            onDashboardAction={handleDashboardAction}
            onGameComplete={handleGameComplete}
            onHistoryFiltersChange={handleHistoryFiltersChange}
            onMarkPastDailyUnlocked={handleMarkPastDailyUnlocked}
            onMultiplayerSubtabChange={handleMultiplayerSubtabChange}
            onOpenEloAbout={handleOpenEloAbout}
            onOpenAuthModal={handleOpenAuthModal}
            onOpenPasswordChange={handleOpenPasswordChange}
            onOpenPublicProfile={handleOpenPublicProfile}
            onOpenSettings={handleOpenSettings}
            onCloseFocusedLiveSpectatorGame={handleCloseFocusedLiveSpectatorGame}
            onLiveSurfaceActiveChange={handleLiveSurfaceActiveChange}
            onOpenMultiplayerHistory={handleOpenMultiplayerHistory}
            onOpenFocusedLiveSpectatorGame={handleOpenFocusedLiveSpectatorGame}
            onOpenProfilePanel={handleOpenProfilePanel}
            onOpenSoloHistory={handleOpenSoloHistory}
            onPracticeModeChange={handlePracticeModeChange}
            onPracticeSeedAdvance={handlePracticeSeedAdvance}
            onResetProgress={handleResetProgress}
            onRequestPasswordReset={handleRequestPasswordReset}
            onResumeCapture={handleResumeCapture}
            onResumeMultiplayerGame={handleResumeMultiplayerGame}
            onResumeSoloGame={handleResumeSoloGame}
            onSelectMultiplayerGame={handleSelectMultiplayerGame}
            onSelectRoute={handleNavigate}
            onSendMagicLink={handleSendMagicLink}
            onSaveProfile={handleSaveProfile}
            onSavePublicProfile={handleSavePublicProfile}
            onSignInWithPassword={handleSignInWithPassword}
            onSignOut={handleSignOut}
            onSignUpWithPassword={handleSignUpWithPassword}
            onConsumeConsumable={handleConsumeConsumable}
            onPurchaseConsumable={handlePurchaseConsumable}
            onSoloCloudMutation={handleSoloCloudMutation}
            onSoloDailyModeChange={handleSoloDailyModeChange}
            onSoloSubtabChange={handleSoloSubtabChange}
            onSpendCoins={handleSpendCoins}
            onSyncNow={handleSyncNow}
            onToggleSound={sound.setEnabled}
            onUpdateSettings={handleUpdateSettings}
            practiceMode={practiceMode}
            adminDashboardRepository={adminDashboardRepository}
            publicProfileRepository={publicProfileRepository}
            publicRankedLeaderboardRepository={publicRankedLeaderboardRepository}
            publicSiteStatsRepository={publicSiteStatsRepository}
            postgameActions={multiplayerRepository}
            privateMatchActions={multiplayerRepository}
            profileBusy={profileBusy}
            profileMessage={profileMessage}
            publicProfile={publicProfile}
            publicProfileBusy={publicProfileBusy}
            publicProfileMessage={publicProfileMessage}
            publicProfileReturnRoute={publicProfileReturnRoute}
            participantIdentityActions={multiplayerRepository}
            rankedQueueActions={multiplayerRepository}
            progressOwnerKey={activeProgressOwnerKey}
            multiplayerSubtab={multiplayerSubtab}
            resumeSlots={resumeSlots}
            route={activeRoute}
            focusedLiveSpectatorGameId={focusedLiveSpectatorGameId}
            selectedMultiplayerGameId={selectedMultiplayerGameId}
            selectedPublicProfileId={selectedPublicProfileId}
            soundEnabled={sound.enabled}
            soloDailyMode={soloDailyMode}
            soloSubtab={soloSubtab}
            supabaseClient={supabaseClient}
            syncStatus={syncStatus}
            workspaceAttention={workspaceAttention}
            multiplayerDailyDateKey={dailyMultiplayer.dateKey}
            todayDateKey={daily.dateKey}
          />
      </LunarSignalStage>
      <BackToTopButton />

      {import.meta.env.DEV ? <SimulateTimePanel /> : null}

      <AuthModal
        authenticated={authState.status === 'authenticated'}
        authMessage={authMessage}
        busy={authBusy}
        isOpen={authModalOpen}
        onClose={handleCloseAuthModal}
        onRequestPasswordReset={handleRequestPasswordReset}
        onSendMagicLink={handleSendMagicLink}
        onSignInWithPassword={handleSignInWithPassword}
        onSignUpWithPassword={handleSignUpWithPassword}
      />

      <PasswordResetModal
        busy={authBusy}
        isOpen={passwordResetOpen}
        onClose={handleClosePasswordReset}
        onUpdatePassword={handleUpdatePassword}
        statusMessage={passwordResetMessage}
      />

      <ProfilePanel
        authState={authState}
        busy={profileBusy}
        isOpen={profilePanelOpen}
        onClose={handleCloseProfilePanel}
        onOpenSettings={handleOpenSettings}
        onSave={handleSaveProfile}
        onSavePublicProfile={handleSavePublicProfile}
        onSignOut={handleSignOut}
        publicProfile={publicProfile}
        publicProfileBusy={publicProfileBusy}
        publicProfileStatusMessage={publicProfileMessage}
        statusMessage={profileMessage}
        supabaseClient={supabaseClient}
      />
    </>
  )
}

export default App
