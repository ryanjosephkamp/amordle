import type { GameMode, PlayScope } from '../game/types'
import { DEFAULT_DIFFICULTY_TIER, normalizeDifficultyTier, type DifficultyTier } from '../data/difficulty'
import { DEFAULT_GO_PUZZLE_COUNT, normalizeGoPuzzleCount, type GoPuzzleCount } from '../game/constants'
import { DEFAULT_THEME, normalizeTheme, type Theme } from '../theme/theme'
import { createEmptyStatistics } from '../stats/statistics'
import type { StatisticsState } from '../stats/types'
import type { MultiplayerState, MultiplayerCompetitiveState } from '../multiplayer'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  normalizeNotificationPreferences,
  type InAppNotificationMode,
  type NotificationSoundMode,
} from '../notifications/notificationPreferences'
import type { ResumeSlot, ResumeSlotCollection } from './resumeSlot'
import { createDefaultPracticeSeedState, type PracticeSeedState } from './practiceSeeds'
/**
 * Bumped to 2 in Phase 18.3 when `GuestSettingsState.difficultyDefault` was
 * added, to 3 in Phase 19.2 when `GuestSettingsState.goPuzzleCountDefault`
 * was added, to 5 in Phase 23 when multiplayer progress was added, and
 * to 6 in Phase 23 Stage 3 when competitive multiplayer result/rating display
 * state was added, to 7 in Phase 23 Stage 15 when per-account Practice seed
 * counters were added, to 8 in Phase 26.3 when in-app notification
 * preferences were added, and to 9 in Phase 26.4 when notification sound and
 * local browser-notification preferences were added. Older payloads are
 * upgraded by `migrateGuestProgress` (see `guestStorage.ts`), which preserves
 * all existing coins/XP/history/stats and backfills any missing setting with
 * its safe default via `normalizeGuestSettings`; bumped to 4 in Phase 20
 * Variant 03 so each play lane can remember its own unfinished puzzle.
 */
export const GUEST_PROGRESS_SCHEMA_VERSION = 11

export interface GuestProgressionState {
  readonly coins: number
  readonly consumables: {
    readonly removeIncorrectLetters: number
    readonly revealOneLetter: number
  }
  readonly level: number
  readonly xp: number
  /** Phase 57 idempotency cache; signed-in server revisions are authoritative. */
  readonly economyOperationIds: readonly string[]
  readonly economyRevision: number
}

export interface GuestSettingsState {
  readonly hardModeDefault: boolean
  readonly reducedMotion: boolean
  /**
   * Phase 18.3 — global default answer difficulty tier. Additive; defaults to
   * Expert so existing players keep today's behaviour. Synced to the Supabase
   * profile alongside other preferences when signed in (Phase 18.8).
   */
  readonly difficultyDefault: DifficultyTier
  /**
   * Phase 19.2 — global default go chain length (5/7/10). Additive; defaults to
   * 5 so existing players keep today's behaviour. Synced to the Supabase
   * profile alongside other preferences when signed in. The per-puzzle word
   * length is independent of this count.
   */
  readonly goPuzzleCountDefault: GoPuzzleCount
  /**
   * Phase 19.5 — global default visual theme (accent/border palette only).
   * Additive; defaults to `'icy'` so existing players keep today's look. The
   * per-puzzle layout and tile-state colors are unaffected. Synced to the
   * Supabase profile alongside other preferences when signed in.
   */
  readonly themeDefault: Theme
  /**
   * Phase 22 — global toggle for the cross-page daily countdown indicator and
   * its reset alerts (subtle visual cue + unique reset sound). Additive;
   * defaults to `true` so existing players see the new countdown. Disabling it
   * hides the countdown everywhere and suppresses the reset visual + sound.
   * Synced to the Supabase profile alongside other preferences when signed in.
   */
  readonly dailyCountdownEnabled: boolean
  /**
   * Phase 23 — separate toggle for the Daily Multiplayer UTC countdown and its
   * unique reset sound. Solo daily countdown behavior remains controlled by
   * `dailyCountdownEnabled`.
   */
  readonly dailyMultiplayerCountdownEnabled: boolean
  /**
   * Phase 26.3 — in-app notification preferences. Additive; defaults preserve
   * Phase 25 behavior by showing all in-app notifications until the player
   * chooses the quieter important-only filter or disables in-app notifications.
   * Synced through the existing guest/cloud progress payload.
   */
  readonly inAppNotificationsEnabled: boolean
  readonly inAppNotificationMode: InAppNotificationMode
  /**
   * Phase 26.4 — additive notification sound and browser-notification
   * preferences. Sounds default to important-only, stay gated by the master
   * sound toggle, and never affect gameplay. Browser notifications are off by
   * default and remain local/permission-gated with no service worker or push
   * infrastructure.
   */
  readonly notificationSoundMode: NotificationSoundMode
  readonly browserNotificationsEnabled: boolean
  /** Phase 56 - local/cloud display preference for private-request lifecycle notifications. */
  readonly privateRequestNotificationsEnabled: boolean
}

export interface GameHistoryEntry {
  readonly attemptsUsed: number
  readonly coinAward: number
  readonly completedAt: string
  /**
   * Phase 19.1 — additive, optional difficulty tier the game was played at.
   * Older history entries (pre-19.1) simply lack it and render in an
   * "untagged" group in tier-aware visualizations. Back-compatible: no
   * migration of historical rows and no default behaviour change.
   */
  readonly difficulty?: DifficultyTier
  readonly gameId: string
  readonly mode: GameMode
  readonly scope: PlayScope
  readonly status: 'won' | 'lost'
  readonly word: string
  readonly wordLength: number
  readonly xpAward: number
}

export interface GuestProgressState {
  readonly completedGameIds: readonly string[]
  readonly history: readonly GameHistoryEntry[]
  readonly progression: GuestProgressionState
  readonly schemaVersion: typeof GUEST_PROGRESS_SCHEMA_VERSION
  readonly settings: GuestSettingsState
  readonly stats: StatisticsState
  /**
   * Legacy most-recent unfinished game slot. Kept for backward compatibility
   * with existing saved guest progress and cloud payloads; new play flow reads
   * from `resumeSlots` so daily og, daily go, practice og, and practice go can
   * be preserved independently.
   */
  readonly resumeSlot?: ResumeSlot
  /**
   * Phase 20 Variant 03: independent in-progress slots for the four playable
   * lanes. Each entry is validated on load and removed when that lane finishes
   * or is replaced with a fresh puzzle.
   */
  readonly resumeSlots?: ResumeSlotCollection
  /**
   * Phase 22 Addendum (§27.10) — past dailies the player has permanently
   * unlocked by making at least one guess after paying the fixed coin cost.
   * Each entry is a `${mode}:${dateKey}` key (e.g. `og:2025-03-04`). Additive
   * and optional: legacy payloads simply lack it and start empty. Synced to the
   * cloud as part of the guest-progress payload (union-merged on transfer).
   */
  readonly unlockedDailies?: readonly string[]
  /**
   * Phase 23 Stage 1/8 — local-first turn-based multiplayer matches.
   * Stored separately from solo resume slots so up to five multiplayer games can
   * remain active without disturbing daily/practice solo progress.
   */
  readonly multiplayer?: MultiplayerState
  /**
   * Phase 23 Stage 3 — additive competitive multiplayer state. This stores
   * local/cacheable result summaries, custom-game lobby metadata, and rating
   * projections. Solo stats/economy/history remain separate.
   */
  readonly competitiveMultiplayer?: MultiplayerCompetitiveState
  /**
   * Phase 23 Stage 15 — per-mode counters used with the authenticated account
   * id to make Practice OG/GO sequences account-specific while Daily remains
   * globally deterministic.
   */
  readonly practiceSeeds: PracticeSeedState
}

export function createDefaultGuestSettings(): GuestSettingsState {
  return {
    hardModeDefault: false,
    reducedMotion: false,
    difficultyDefault: DEFAULT_DIFFICULTY_TIER,
    goPuzzleCountDefault: DEFAULT_GO_PUZZLE_COUNT,
    themeDefault: DEFAULT_THEME,
    dailyCountdownEnabled: true,
    dailyMultiplayerCountdownEnabled: true,
    inAppNotificationsEnabled: DEFAULT_NOTIFICATION_PREFERENCES.inAppNotificationsEnabled,
    inAppNotificationMode: DEFAULT_NOTIFICATION_PREFERENCES.inAppNotificationMode,
    notificationSoundMode: DEFAULT_NOTIFICATION_PREFERENCES.notificationSoundMode,
    browserNotificationsEnabled: DEFAULT_NOTIFICATION_PREFERENCES.browserNotificationsEnabled,
    privateRequestNotificationsEnabled: DEFAULT_NOTIFICATION_PREFERENCES.privateRequestNotificationsEnabled,
  }
}

/**
 * Normalize an untrusted settings record into a complete `GuestSettingsState`,
 * filling any missing field with its safe default. Used by the v1→v2 migration
 * so persisted preferences survive the schema bump.
 */
export function normalizeGuestSettings(raw: unknown): GuestSettingsState {
  const record = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const notificationPreferences = normalizeNotificationPreferences(record)
  return {
    hardModeDefault: typeof record.hardModeDefault === 'boolean' ? record.hardModeDefault : false,
    reducedMotion: typeof record.reducedMotion === 'boolean' ? record.reducedMotion : false,
    difficultyDefault: normalizeDifficultyTier(record.difficultyDefault),
    goPuzzleCountDefault: normalizeGoPuzzleCount(record.goPuzzleCountDefault),
    themeDefault: normalizeTheme(record.themeDefault),
    dailyCountdownEnabled: typeof record.dailyCountdownEnabled === 'boolean' ? record.dailyCountdownEnabled : true,
    dailyMultiplayerCountdownEnabled: typeof record.dailyMultiplayerCountdownEnabled === 'boolean' ? record.dailyMultiplayerCountdownEnabled : true,
    inAppNotificationsEnabled: notificationPreferences.inAppNotificationsEnabled,
    inAppNotificationMode: notificationPreferences.inAppNotificationMode,
    notificationSoundMode: notificationPreferences.notificationSoundMode,
    browserNotificationsEnabled: notificationPreferences.browserNotificationsEnabled,
    privateRequestNotificationsEnabled: notificationPreferences.privateRequestNotificationsEnabled,
  }
}

export function createDefaultGuestProgress(): GuestProgressState {
  return {
    completedGameIds: [],
    history: [],
    progression: {
      coins: 0,
      consumables: {
        removeIncorrectLetters: 0,
        revealOneLetter: 0,
      },
      level: 1,
      xp: 0,
      economyOperationIds: [],
      economyRevision: 0,
    },
    schemaVersion: GUEST_PROGRESS_SCHEMA_VERSION,
    settings: createDefaultGuestSettings(),
    stats: createEmptyStatistics(),
    multiplayer: { games: [] },
    competitiveMultiplayer: { customGames: [], rating: { profiles: [], transactions: [] }, results: [] },
    practiceSeeds: createDefaultPracticeSeedState(),
    unlockedDailies: [],
  }
}
