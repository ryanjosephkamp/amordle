import { useEffect, useState } from 'react'
import { Button, Dialog } from '../ui'
import { classNames } from '../ui/classNames'
import {
  AVATAR_STORAGE_BUCKET,
  hasAvatarStorage,
  uploadAvatar,
  type AuthState,
} from './auth'
import type { BrrrdleSupabaseClient } from './supabaseClient'
import {
  DEFAULT_PROFILE_ACCENT_COLOR,
  PROFILE_ACCENT_COLORS,
  PROFILE_AVATAR_MAX_BYTES,
  PROFILE_DISPLAY_NAME_ALLOWED_CHARACTERS_DESCRIPTION,
  PROFILE_DISPLAY_NAME_MAX_LENGTH,
  getPlayerDisplayNameValidationMessage,
  getProfileAccentAvatarBackground,
  type ProfileAccentColor,
} from './profile'
import {
  PUBLIC_PROFILE_BIO_MAX_LENGTH,
  type OwnerPublicProfile,
  type PublicProfileUpdateInput,
} from './publicProfile'

interface ProfileEditorProps {
  readonly active?: boolean
  readonly authState: AuthState
  readonly cancelLabel?: string
  readonly onSave: (input: { readonly displayName?: string; readonly accentColor?: ProfileAccentColor; readonly avatarUrl?: string }) => Promise<void> | void
  readonly onSavePublicProfile?: (input: PublicProfileUpdateInput) => Promise<void> | void
  readonly onCancel?: () => void
  readonly onOpenSettings?: () => void
  readonly onSignOut?: () => void
  readonly publicProfile?: OwnerPublicProfile
  readonly publicProfileBusy?: boolean
  readonly publicProfileStatusMessage?: string
  readonly supabaseClient?: BrrrdleSupabaseClient
  readonly statusMessage?: string
  readonly busy?: boolean
}

interface ProfilePanelProps extends Omit<ProfileEditorProps, 'active' | 'cancelLabel' | 'onCancel'> {
  readonly isOpen: boolean
  readonly onClose: () => void
}

const ACCENT_SWATCHES: Record<ProfileAccentColor, string> = {
  ice: 'bg-cyan-300',
  aurora: 'bg-emerald-300',
  cyan: 'bg-sky-400',
  violet: 'bg-violet-400',
  rose: 'bg-rose-300',
  amber: 'bg-amber-300',
}

/**
 * Phase 15.4 — User profile editor (display name, accent, optional avatar).
 *
 * Persists to auth.users.user_metadata via the supplied onSave callback,
 * which is wired in App.tsx to `updateProfile` (see Phase 15.1).
 *
 * Avatar upload is gated on a runtime probe of a Supabase Storage bucket
 * named `avatars`; if it isn't present, the upload affordance is hidden and
 * everything else continues to work.
 */
export function ProfileEditor({
  active = true,
  authState,
  cancelLabel = 'Cancel',
  onCancel,
  onOpenSettings,
  onSave,
  onSavePublicProfile,
  onSignOut,
  publicProfile,
  publicProfileBusy,
  publicProfileStatusMessage,
  supabaseClient,
  statusMessage,
  busy,
}: ProfileEditorProps) {
  const profile = authState.user?.profile
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '')
  const [accentColor, setAccentColor] = useState<ProfileAccentColor>(profile?.accentColor ?? DEFAULT_PROFILE_ACCENT_COLOR)
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(profile?.avatarUrl)
  const [storageAvailable, setStorageAvailable] = useState(false)
  const [localError, setLocalError] = useState<string | undefined>(undefined)
  const [uploading, setUploading] = useState(false)
  const [publicAvatarUrl, setPublicAvatarUrl] = useState(publicProfile?.avatarUrl ?? '')
  const [publicBio, setPublicBio] = useState(publicProfile?.bio ?? '')

  // Re-hydrate fields whenever the dialog re-opens. Uses the
  // compare-and-update-during-render idiom recommended by React 19's lint rules
  // (avoids setState-in-useEffect cascades).
  const [hydratedKey, setHydratedKey] = useState<string | undefined>(undefined)
  const profileKey = active ? `${profile?.displayName ?? ''}|${profile?.accentColor ?? ''}|${profile?.avatarUrl ?? ''}` : undefined
  if (active && hydratedKey !== profileKey) {
    setHydratedKey(profileKey)
    setDisplayName(profile?.displayName ?? '')
    setAccentColor(profile?.accentColor ?? DEFAULT_PROFILE_ACCENT_COLOR)
    setAvatarUrl(profile?.avatarUrl)
    setLocalError(undefined)
  } else if (!active && hydratedKey !== undefined) {
    setHydratedKey(undefined)
  }

  const [publicHydratedKey, setPublicHydratedKey] = useState<string | undefined>(undefined)
  const publicProfileKey = active
    ? `${publicProfile?.publicProfileId ?? 'new'}|${publicProfile?.avatarUrl ?? ''}|${publicProfile?.bio ?? ''}`
    : undefined
  if (active && publicHydratedKey !== publicProfileKey) {
    setPublicHydratedKey(publicProfileKey)
    setPublicAvatarUrl(publicProfile?.avatarUrl ?? '')
    setPublicBio(publicProfile?.bio ?? '')
  } else if (!active && publicHydratedKey !== undefined) {
    setPublicHydratedKey(undefined)
  }

  // Probe Storage exactly once per supabase client (and only while open).
  const [storageProbeKey, setStorageProbeKey] = useState<string | undefined>(undefined)
  const desiredProbeKey = active && supabaseClient ? 'active' : undefined
  if (desiredProbeKey !== storageProbeKey) {
    setStorageProbeKey(desiredProbeKey)
    if (!desiredProbeKey) {
      setStorageAvailable(false)
    }
  }
  useEffect(() => {
    if (!active || !supabaseClient) {
      return
    }
    let cancelled = false
    void hasAvatarStorage(supabaseClient).then((available) => {
      if (!cancelled) {
        setStorageAvailable(available)
      }
    })
    return () => { cancelled = true }
  }, [active, supabaseClient])

  async function handleFile(file: File) {
    setLocalError(undefined)
    if (!supabaseClient || !authState.user) {
      setLocalError('Sign in to upload an avatar.')
      return
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setLocalError('Please choose a PNG, JPEG, or WebP image.')
      return
    }
    if (file.size > PROFILE_AVATAR_MAX_BYTES) {
      setLocalError(`Image must be under ${Math.floor(PROFILE_AVATAR_MAX_BYTES / 1024)} KB.`)
      return
    }
    setUploading(true)
    const result = await uploadAvatar(supabaseClient, {
      contentType: file.type,
      data: file,
      userId: authState.user.id,
    })
    setUploading(false)
    if (!result.ok) {
      setLocalError(result.message)
      return
    }
    setAvatarUrl(result.publicUrl)
  }

  function handleSave() {
    void savePlayerProfile()
  }

  async function savePlayerProfile() {
    setLocalError(undefined)
    const playerNameError = getPlayerDisplayNameValidationMessage(displayName, 'Player name')
    if (playerNameError) {
      setLocalError(playerNameError)
      return
    }
    const trimmedDisplayName = displayName.trim()
    await onSave({
      displayName: trimmedDisplayName,
      accentColor,
      avatarUrl,
    })
    if (!onSavePublicProfile) {
      return
    }
    await onSavePublicProfile({
      accentColor,
      avatarUrl: publicAvatarUrl,
      bio: publicBio,
      displayName: trimmedDisplayName,
      flairKey: 'none',
      visibility: 'public',
    })
  }

  const message = localError ?? statusMessage
  const playerCardMessage = publicProfileStatusMessage
  const publicProfileLabel = displayName.trim() || 'Player'
  const publicProfilePreviewInitials = publicProfileLabel
    .split(/[\s._-]+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toLocaleUpperCase('en-US'))
    .join('') || '?'
  const publicAvatarPreviewUrl = publicAvatarUrl.trim().startsWith('https://') ? publicAvatarUrl.trim() : undefined

  return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={classNames(
              'inline-grid h-12 w-12 place-items-center overflow-hidden rounded-full bg-gradient-to-br text-sm font-bold text-white shadow-inner',
              getProfileAccentAvatarBackground(accentColor),
            )}
          >
            {avatarUrl ? (
              <img alt="" src={avatarUrl} className="h-full w-full object-cover" />
            ) : (
              <span>{profile?.initials ?? 'A'}</span>
            )}
          </span>
          <div>
            <p className="text-sm text-slate-300">Signed in as</p>
            <p className="font-semibold text-white">{authState.user?.email ?? 'Account'}</p>
          </div>
        </div>

        <div className="space-y-1 border-t border-slate-800 pt-4">
          <p className="font-semibold text-cyan-100">Player identity</p>
          <p className="text-xs leading-5 text-slate-400">
            This one Player name appears on the account chip, profiles, leaderboards, and multiplayer surfaces.
          </p>
        </div>

        <label className="grid gap-1 font-semibold text-cyan-100">
          Player name
          <input
            className="rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]"
            maxLength={PROFILE_DISPLAY_NAME_MAX_LENGTH}
            onChange={(event) => setDisplayName(event.target.value)}
            type="text"
            value={displayName}
          />
          <span className="text-xs text-slate-400">
            {displayName.length}/{PROFILE_DISPLAY_NAME_MAX_LENGTH} · Use {PROFILE_DISPLAY_NAME_ALLOWED_CHARACTERS_DESCRIPTION}; emoji and symbols are not supported.
          </span>
        </label>

        <fieldset className="space-y-2">
          <legend className="font-semibold text-cyan-100">Accent color</legend>
          <div role="radiogroup" aria-label="Accent color" className="flex flex-wrap gap-2">
            {PROFILE_ACCENT_COLORS.map((color) => (
              <button
                aria-checked={accentColor === color}
                aria-label={`Accent color ${color}`}
                key={color}
                onClick={() => setAccentColor(color)}
                role="radio"
                type="button"
                className={classNames(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]',
                  accentColor === color ? 'border-[var(--color-ice-200)] text-white' : 'border-slate-700 text-slate-300',
                )}
              >
                <span aria-hidden="true" className={classNames('inline-block h-3 w-3 rounded-full', ACCENT_SWATCHES[color])} />
                {color}
              </button>
            ))}
          </div>
        </fieldset>

        {storageAvailable ? (
          <label className="grid gap-1 font-semibold text-cyan-100">
            Avatar image
            <input
              accept="image/png,image/jpeg,image/webp"
              className="text-xs text-slate-300 file:mr-3 file:rounded-full file:border-0 file:bg-[var(--color-ice-200)] file:px-3 file:py-1 file:text-slate-950"
              disabled={uploading || busy}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) {
                  void handleFile(file)
                }
              }}
              type="file"
            />
            <span className="text-xs text-slate-400">PNG, JPEG, or WebP · max {Math.floor(PROFILE_AVATAR_MAX_BYTES / 1024)} KB · stored in the <code>{AVATAR_STORAGE_BUCKET}</code> bucket.</span>
          </label>
        ) : (
          <p className="text-xs text-slate-400">
            Image upload is unavailable. Your avatar uses your initials on a colored gradient.
            An admin can enable image uploads by creating an <code>{AVATAR_STORAGE_BUCKET}</code> Supabase Storage bucket.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleSave} variant="primary" disabled={busy || publicProfileBusy || uploading}>Save player profile</Button>
          {onCancel ? (
            <Button onClick={onCancel} variant="ghost">{cancelLabel}</Button>
          ) : null}
        </div>

        {onOpenSettings || onSignOut ? (
          <div className="space-y-2 border-t border-slate-800 pt-4">
            <div className="space-y-1">
              <p className="font-semibold text-cyan-100">Account management</p>
              <p className="text-xs leading-5 text-slate-400">
                Password changes, cloud sync, progress export, and reset controls stay in Settings.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {onOpenSettings ? (
                <Button onClick={onOpenSettings} variant="secondary">Open Settings</Button>
              ) : null}
              {onSignOut ? (
                <Button onClick={onSignOut} variant="secondary">Sign out</Button>
              ) : null}
            </div>
          </div>
        ) : null}

        <p className="text-xs text-slate-400">
          Settings remains the home for sign out, password, sync, export, and reset controls.
        </p>

        {message ? (
          <p aria-live="polite" className="text-sm text-rose-200">{message}</p>
        ) : null}

        {onSavePublicProfile ? (
          <div className="space-y-4 border-t border-slate-800 pt-4">
            <div className="space-y-1">
              <p className="font-semibold text-cyan-100">Player card</p>
              <p className="text-xs leading-5 text-slate-400">
                The Player name above is the only name shown to other players. Add an optional bio or public avatar URL for player-facing profile cards.
              </p>
            </div>

            <label className="grid gap-1 font-semibold text-cyan-100">
              Public avatar URL
              <input
                className="rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]"
                onChange={(event) => setPublicAvatarUrl(event.target.value)}
                placeholder="https://..."
                type="url"
                value={publicAvatarUrl}
              />
              <span className="text-xs text-slate-400">Optional. Use an https image URL that does not include your raw account ID.</span>
            </label>

            <label className="grid gap-1 font-semibold text-cyan-100">
              Bio
              <textarea
                className="min-h-20 rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus-ring)]"
                maxLength={PUBLIC_PROFILE_BIO_MAX_LENGTH}
                onChange={(event) => setPublicBio(event.target.value)}
                value={publicBio}
              />
              <span className="text-xs text-slate-400">{publicBio.length}/{PUBLIC_PROFILE_BIO_MAX_LENGTH}</span>
            </label>

            <div className="grid gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300">
              <p className="font-semibold text-cyan-100">Preview</p>
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={classNames(
                    'inline-grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-gradient-to-br text-xs font-bold text-white shadow-inner',
                    getProfileAccentAvatarBackground(accentColor),
                  )}
                >
                  {publicAvatarPreviewUrl ? <img alt="" src={publicAvatarPreviewUrl} className="h-full w-full object-cover" /> : publicProfilePreviewInitials}
                </span>
                <div>
                  <p className="break-words font-semibold text-white">{publicProfileLabel}</p>
                  <p className="text-xs text-slate-400">Visible to other players</p>
                </div>
              </div>
              {publicBio.trim() ? <p className="break-words text-slate-300">{publicBio.trim()}</p> : null}
            </div>

            {playerCardMessage ? (
              <p aria-live="polite" className="text-sm text-slate-300">{playerCardMessage}</p>
            ) : null}
          </div>
        ) : null}
      </div>
  )
}

export function ProfilePanel({
  authState,
  isOpen,
  onClose,
  onOpenSettings,
  onSave,
  onSavePublicProfile,
  onSignOut,
  publicProfile,
  publicProfileBusy,
  publicProfileStatusMessage,
  supabaseClient,
  statusMessage,
  busy,
}: ProfilePanelProps) {
  return (
    <Dialog
      description="Customize how you appear in amordle. Saved to your account."
      isOpen={isOpen}
      onClose={onClose}
      title="Your profile"
    >
      <ProfileEditor
        active={isOpen}
        authState={authState}
        busy={busy}
        onCancel={onClose}
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
    </Dialog>
  )
}
