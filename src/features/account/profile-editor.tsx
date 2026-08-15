'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { z } from 'zod';
import {
  accentPresetSchema,
  deleteMyAccentPreset,
  getMyAccentPresets,
  getMyPublicProfile,
  myPublicProfileSchema,
  saveMyPublicProfile,
  upsertMyAccentPreset,
} from '@/adapters/supabase/public';
import { myAccentPresetsQueryKey, myProfileQueryKey } from '@/application/query-keys';
import { CopyButton } from '@/components/copy-button';
import { useAuth } from '@/components/providers';
import { AccountGate, SkeletonRows } from '@/components/route-states';
import {
  accentCssColors,
  accentLabels,
  accentNameSchema,
  accentNames,
  defaultAccentName,
  flairIsSelectableBy,
  flairLabels,
  flairNameSchema,
  flairNames,
  publicAvatarUrlSchema,
  publicProfilePath,
} from '@/domain/profile';
import type { AccentSelection, FlairName } from '@/domain/profile';
import { ProfileAvatar } from '@/features/community/profile-avatar';
import { ContextHelpPopover } from '@/components/context-help-popover';
import { AccentPresetDialog, type AccentPresetDraft } from './accent-preset-dialog';
import {
  flushAvatarCleanup,
  ownedAvatarPathFromCurrentProject,
  prepareAvatarFile,
  queueAvatarCleanup,
  removeOwnedAvatar,
  uploadPreparedAvatar,
} from '@/adapters/avatar-storage';

type MyPublicProfile = z.infer<typeof myPublicProfileSchema>;
type AccentPreset = z.infer<typeof accentPresetSchema>;

export function ProfileEditor() {
  return (
    <AccountGate>
      <ProfileEditorInner />
    </AccountGate>
  );
}

function ProfileEditorInner() {
  const auth = useAuth();
  const userId = auth.user?.id ?? '';
  const profile = useQuery({
    queryKey: myProfileQueryKey(userId),
    queryFn: getMyPublicProfile,
    enabled: Boolean(userId),
  });
  const presets = useQuery({
    queryKey: myAccentPresetsQueryKey(userId),
    queryFn: getMyAccentPresets,
    enabled: Boolean(userId),
  });

  if (profile.isPending || presets.isPending) return <SkeletonRows label="Loading profile…" />;
  if (profile.isError || presets.isError) {
    return (
      <section className="status-panel">
        <h2>Profile unavailable</h2>
        <button
          onClick={() =>
            void Promise.all([
              profile.isError ? profile.refetch() : Promise.resolve(),
              presets.isError ? presets.refetch() : Promise.resolve(),
            ])
          }
        >
          Try again
        </button>
      </section>
    );
  }

  return <ProfileForm profile={profile.data} presets={presets.data} userId={userId} />;
}

function initialAccentSelection(profile: MyPublicProfile | null): AccentSelection {
  return profile?.active_accent_preset_id && profile.accent_hex
    ? {
        kind: 'custom',
        presetId: profile.active_accent_preset_id,
        hex: profile.accent_hex,
      }
    : { kind: 'named', name: profile?.accent_color ?? defaultAccentName };
}

function accentErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const normalized = message.toLowerCase();
  if (normalized.includes('24 accent') || normalized.includes('at most 24')) {
    return 'You can save up to 24 custom accents. Delete one before adding another.';
  }
  if (normalized.includes('duplicate') || normalized.includes('unique')) {
    return 'Each custom accent needs a unique name.';
  }
  if (normalized.includes('not found'))
    return 'That custom accent no longer exists. Refresh and try again.';
  return message || 'The custom accent could not be saved.';
}

function ProfileForm({
  profile,
  presets,
  userId,
}: {
  profile: MyPublicProfile | null;
  presets: AccentPreset[];
  userId: string;
}) {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? '');
  const [avatarError, setAvatarError] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const avatarPreviewUrl = useMemo(
    () => (avatarFile ? URL.createObjectURL(avatarFile) : null),
    [avatarFile],
  );
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [accentSelection, setAccentSelection] = useState<AccentSelection>(() =>
    initialAccentSelection(profile),
  );
  const [flairKey, setFlairKey] = useState<FlairName>(profile?.flair_key ?? 'none');
  const [editingPreset, setEditingPreset] = useState<AccentPreset | null | undefined>(undefined);
  const [presetError, setPresetError] = useState('');
  const lastDialogOpener = useRef<HTMLElement | null>(null);
  const savedAvatarUrl = useRef(profile?.avatar_url ?? '');

  useEffect(() => {
    void flushAvatarCleanup(userId);
  }, [userId]);

  useEffect(
    () => () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    },
    [avatarPreviewUrl],
  );

  const invalidatePublicProfile = (data: MyPublicProfile | null | undefined) => {
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ['leaderboard'] }),
      queryClient.invalidateQueries({ queryKey: ['player-directory'] }),
      ...(data
        ? [
            queryClient.invalidateQueries({
              queryKey: ['public-profile', data.public_profile_id],
            }),
            queryClient.invalidateQueries({
              queryKey: ['public-profile-stats', data.public_profile_id],
            }),
          ]
        : []),
    ]);
  };

  const save = useMutation({
    mutationFn: saveMyPublicProfile,
    onSuccess: (data) => {
      const previousUrl = savedAvatarUrl.current;
      const previousPath = ownedAvatarPathFromCurrentProject(previousUrl);
      savedAvatarUrl.current = data?.avatar_url ?? '';
      if (previousPath && data?.avatar_url !== previousUrl) {
        void removeOwnedAvatar(previousPath).then((removed) => {
          if (!removed) queueAvatarCleanup(userId, previousPath);
        });
      }
      queryClient.setQueryData(myProfileQueryKey(userId), data);
      queryClient.setQueryData<AccentPreset[]>(myAccentPresetsQueryKey(userId), (current = []) =>
        current.map((preset) => ({
          ...preset,
          is_active: data.active_accent_preset_id === preset.preset_id,
        })),
      );
      invalidatePublicProfile(data);
    },
  });

  const presetUpsert = useMutation({
    mutationFn: upsertMyAccentPreset,
    onSuccess: (data) => {
      queryClient.setQueryData<AccentPreset[]>(myAccentPresetsQueryKey(userId), (current = []) =>
        [data, ...current.filter((item) => item.preset_id !== data.preset_id)].map((item) => ({
          ...item,
          is_active: data.is_active ? item.preset_id === data.preset_id : item.is_active,
        })),
      );
      if (data.is_active) {
        setAccentSelection({ kind: 'custom', presetId: data.preset_id, hex: data.accent_hex });
        queryClient.setQueryData<MyPublicProfile | null>(myProfileQueryKey(userId), (current) =>
          current
            ? {
                ...current,
                accent_color: 'aurora',
                accent_hex: data.accent_hex,
                active_accent_preset_id: data.preset_id,
              }
            : current,
        );
      }
      void queryClient.invalidateQueries({ queryKey: myProfileQueryKey(userId) });
      invalidatePublicProfile(queryClient.getQueryData(myProfileQueryKey(userId)));
    },
  });

  const presetDelete = useMutation({
    mutationFn: deleteMyAccentPreset,
    onSuccess: (data, presetId) => {
      queryClient.setQueryData<AccentPreset[]>(myAccentPresetsQueryKey(userId), (current = []) =>
        current.filter((item) => item.preset_id !== presetId),
      );
      const deletedWasActive =
        accentSelection.kind === 'custom' && accentSelection.presetId === presetId;
      if (deletedWasActive) {
        setAccentSelection({ kind: 'named', name: data.active_accent_color });
        queryClient.setQueryData<MyPublicProfile | null>(myProfileQueryKey(userId), (current) =>
          current
            ? {
                ...current,
                accent_color: data.active_accent_color,
                accent_hex: data.active_accent_hex,
                active_accent_preset_id: null,
              }
            : current,
        );
      }
      void queryClient.invalidateQueries({ queryKey: myProfileQueryKey(userId) });
      invalidatePublicProfile(queryClient.getQueryData(myProfileQueryKey(userId)));
    },
  });

  const customAccentHex = accentSelection.kind === 'custom' ? accentSelection.hex : null;
  const namedAccent = accentSelection.kind === 'named' ? accentSelection.name : defaultAccentName;
  const dialogBusy = presetUpsert.isPending || presetDelete.isPending;

  function openPresetDialog(preset: AccentPreset | null, opener: HTMLElement) {
    lastDialogOpener.current = opener;
    setPresetError('');
    setEditingPreset(preset);
  }

  async function savePreset(draft: AccentPresetDraft): Promise<boolean> {
    setPresetError('');
    try {
      await presetUpsert.mutateAsync(draft);
      return true;
    } catch (error) {
      setPresetError(accentErrorMessage(error));
      return false;
    }
  }

  async function deletePreset(preset: AccentPreset): Promise<boolean> {
    setPresetError('');
    try {
      await presetDelete.mutateAsync(preset.preset_id);
      return true;
    } catch (error) {
      setPresetError(accentErrorMessage(error));
      return false;
    }
  }

  async function selectPreset(preset: AccentPreset) {
    setPresetError('');
    try {
      await presetUpsert.mutateAsync({
        presetId: preset.preset_id,
        name: preset.name,
        accentHex: preset.accent_hex,
        select: true,
      });
    } catch (error) {
      setPresetError(accentErrorMessage(error));
    }
  }

  async function uploadAvatarFile() {
    if (!avatarFile || avatarUploading) return;
    setAvatarUploading(true);
    setAvatarError('');
    let uploadedPath: string | null = null;
    try {
      const prepared = await prepareAvatarFile(avatarFile);
      const uploaded = await uploadPreparedAvatar(prepared);
      uploadedPath = uploaded.path;
      await save.mutateAsync({
        displayName,
        bio,
        visibility: 'public',
        accentSelection,
        avatarUrl: uploaded.publicUrl,
        flairKey,
      });
      setAvatarUrl(uploaded.publicUrl);
      setAvatarFile(null);
    } catch (error) {
      if (uploadedPath && !(await removeOwnedAvatar(uploadedPath))) {
        queueAvatarCleanup(userId, uploadedPath);
      }
      setAvatarError(error instanceof Error ? error.message : 'The image could not be uploaded.');
    } finally {
      setAvatarUploading(false);
    }
  }

  return (
    <>
      <form
        className="form-panel field-stack"
        onSubmit={(event) => {
          event.preventDefault();
          const parsedAvatar = publicAvatarUrlSchema.safeParse(avatarUrl);
          if (!parsedAvatar.success) {
            setAvatarError(parsedAvatar.error.issues[0]?.message ?? 'Use a valid HTTPS image URL.');
            return;
          }
          setAvatarError('');
          save.mutate({
            displayName,
            bio,
            visibility: 'public',
            accentSelection,
            avatarUrl: parsedAvatar.data,
            flairKey,
          });
        }}
      >
        <h2>PUBLIC PROFILE</h2>
        <div className="profile-editor-intro">
          <ProfileAvatar
            avatarUrl={(avatarPreviewUrl ?? avatarUrl) || null}
            displayName={displayName}
            accentColor={namedAccent}
            accentHex={customAccentHex}
            label="Profile image preview"
          />
        </div>
        <label>
          Player name
          <input
            required
            minLength={2}
            maxLength={30}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>
        <label>
          Bio
          <textarea
            maxLength={160}
            rows={4}
            value={bio}
            onChange={(event) => setBio(event.target.value)}
          />
        </label>
        <label>
          Profile image URL
          <input
            type="url"
            inputMode="url"
            maxLength={2048}
            placeholder="https://example.com/your-photo.jpg"
            value={avatarUrl}
            aria-describedby="profile-avatar-summary profile-avatar-error"
            aria-invalid={Boolean(avatarError)}
            onChange={(event) => {
              setAvatarUrl(event.target.value);
              setAvatarError('');
            }}
          />
        </label>
        <label>
          Upload profile image
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            aria-describedby="profile-avatar-summary profile-avatar-error"
            onChange={(event) => {
              setAvatarFile(event.target.files?.[0] ?? null);
              setAvatarError('');
            }}
          />
        </label>
        <p id="profile-avatar-summary" className="field-help">
          Profile images are public.
        </p>
        <ContextHelpPopover label="Image requirements">
          <p>
            Use a public HTTPS image URL, or upload a PNG, JPEG, WebP, or animated GIF up to 6 MiB
            and 4096 × 4096 pixels.
          </p>
          <p>Still-image metadata is removed during processing. GIF metadata may remain.</p>
        </ContextHelpPopover>
        {avatarFile && (
          <button
            type="button"
            disabled={avatarUploading || save.isPending}
            onClick={() => void uploadAvatarFile()}
          >
            {avatarUploading ? 'UPLOADING…' : 'UPLOAD AND USE'}
          </button>
        )}
        <p id="profile-avatar-error" className="field-error" aria-live="polite">
          {avatarError}
        </p>
        <fieldset className="accent-fieldset">
          <legend>Accent color</legend>
          <div className="accent-options">
            {accentNames.map((accent) => (
              <label className="accent-option" key={accent}>
                <input
                  type="radio"
                  name="accent-color"
                  value={accent}
                  checked={accentSelection.kind === 'named' && accentSelection.name === accent}
                  onChange={(event) =>
                    setAccentSelection({
                      kind: 'named',
                      name: accentNameSchema.parse(event.target.value),
                    })
                  }
                />
                <span
                  className="accent-swatch"
                  style={{ '--profile-accent': accentCssColors[accent] } as CSSProperties}
                  aria-hidden="true"
                />
                <span>{accentLabels[accent]}</span>
              </label>
            ))}
          </div>

          <div className="custom-accent-heading">
            <span>CUSTOM ACCENTS</span>
            <span>{presets.length} / 24</span>
          </div>
          {presets.length > 0 && (
            <div className="custom-accent-options">
              {presets.map((preset) => (
                <div className="custom-accent-option" key={preset.preset_id}>
                  <label>
                    <input
                      type="radio"
                      name="accent-color"
                      value={preset.preset_id}
                      checked={
                        accentSelection.kind === 'custom' &&
                        accentSelection.presetId === preset.preset_id
                      }
                      disabled={dialogBusy}
                      onChange={() => void selectPreset(preset)}
                    />
                    <span
                      className="accent-swatch"
                      style={{ '--profile-accent': preset.accent_hex } as CSSProperties}
                      aria-hidden="true"
                    />
                    <span>
                      {preset.name}
                      <small>{preset.accent_hex}</small>
                    </span>
                  </label>
                  <button
                    type="button"
                    className="text-action"
                    onClick={(event) => openPresetDialog(preset, event.currentTarget)}
                  >
                    EDIT
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            className="custom-accent-create"
            disabled={presets.length >= 24}
            onClick={(event) => openPresetDialog(null, event.currentTarget)}
          >
            + CREATE CUSTOM ACCENT
          </button>
          {presetError && (
            <p className="field-error" role="alert">
              {presetError}
            </p>
          )}
        </fieldset>
        <label>
          Flair
          <select
            value={flairKey}
            onChange={(event) => setFlairKey(flairNameSchema.parse(event.target.value))}
          >
            {flairNames
              .filter((flair) => flairIsSelectableBy(flair, userId))
              .map((flair) => (
                <option value={flair} key={flair}>
                  {flairLabels[flair]}
                </option>
              ))}
          </select>
        </label>
        <dl className="profile-visibility-summary" aria-label="Profile visibility summary">
          <div>
            <dt>Public</dt>
            <dd>Player name, bio, flair, profile image, and public COMBAT totals.</dd>
          </div>
          <div>
            <dt>Private</dt>
            <dd>Account details, Solo History, settings, and economy.</dd>
          </div>
        </dl>
        <p className="field-help">
          Flair is a self-selected profile label. It does not change matchmaking, rating, rewards,
          or rank.
        </p>
        {/*
         * The only route to your own public address. Visiting /players/<your id>
         * redirects you straight back here, so without this there is no way to
         * find the link other than asking someone else to look you up.
         *
         * Shown only once the profile is public, because a private profile's
         * link resolves to "Player not found" for everyone you send it to.
         */}
        {profile?.public_profile_id && profile.visibility === 'public' && (
          <div className="profile-share">
            <p className="field-help">Your public profile address.</p>
            <div className="action-row">
              <CopyButton
                label="COPY MY PROFILE LINK"
                value={() =>
                  `${window.location.origin}${publicProfilePath(profile.public_profile_id)}`
                }
              />
            </div>
          </div>
        )}
        {profile?.visibility === 'private' && (
          <p className="status-line status-line--warning" role="note">
            This existing profile is private. Saving these fields will publish the profile details
            listed above; nothing is published until you choose Save profile.
          </p>
        )}
        <button className="primary" disabled={save.isPending}>
          {save.isPending ? 'SAVING…' : 'SAVE PROFILE'}
        </button>
        <p aria-live="polite">
          {save.isSuccess
            ? 'Profile saved.'
            : save.isError
              ? save.error.message || 'Profile could not be saved.'
              : ''}
        </p>
      </form>

      <AccentPresetDialog
        key={
          editingPreset === undefined ? 'closed' : (editingPreset?.preset_id ?? 'new-custom-accent')
        }
        preset={editingPreset}
        busy={dialogBusy}
        error={presetError}
        onClose={() => {
          setEditingPreset(undefined);
          lastDialogOpener.current?.focus();
        }}
        onSave={savePreset}
        onDelete={deletePreset}
      />
    </>
  );
}
