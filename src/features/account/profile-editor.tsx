'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { getMyPublicProfile, saveMyPublicProfile } from '@/adapters/supabase/public';
import type { z } from 'zod';
import { myPublicProfileSchema } from '@/adapters/supabase/public';
import { AccountGate, SkeletonRows } from '@/components/route-states';
import { useAuth } from '@/components/providers';
import { myProfileQueryKey } from '@/application/query-keys';
import {
  accentCssColors,
  accentLabels,
  accentNameSchema,
  accentNames,
  defaultAccentName,
  flairLabels,
  flairNameSchema,
  flairNames,
  publicAvatarUrlSchema,
} from '@/domain/profile';
import type { AccentName, FlairName } from '@/domain/profile';
import { ProfileAvatar } from '@/features/community/profile-avatar';

export function ProfileEditor() {
  return (
    <AccountGate>
      <ProfileEditorInner />
    </AccountGate>
  );
}

function ProfileEditorInner() {
  const queryClient = useQueryClient();
  const auth = useAuth();
  const userId = auth.user?.id ?? '';
  const profile = useQuery({
    queryKey: myProfileQueryKey(userId),
    queryFn: getMyPublicProfile,
    enabled: Boolean(userId),
  });
  const save = useMutation({
    mutationFn: saveMyPublicProfile,
    onSuccess: (data) => {
      queryClient.setQueryData(myProfileQueryKey(userId), data);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['leaderboard'] }),
        queryClient.invalidateQueries({ queryKey: ['player-directory'] }),
        queryClient.invalidateQueries({ queryKey: ['public-profile', data.public_profile_id] }),
        queryClient.invalidateQueries({
          queryKey: ['public-profile-stats', data.public_profile_id],
        }),
      ]);
    },
  });

  if (profile.isPending) return <SkeletonRows label="Loading profile…" />;
  if (profile.isError) {
    return (
      <section className="status-panel">
        <h2>Profile unavailable</h2>
        <button onClick={() => void profile.refetch()}>Try again</button>
      </section>
    );
  }

  return (
    <ProfileForm
      key={profile.data?.updated_at ?? 'new-profile'}
      profile={profile.data}
      save={save}
    />
  );
}

function ProfileForm({
  profile,
  save,
}: {
  profile: z.infer<typeof myPublicProfileSchema> | null;
  save: UseMutationResult<
    Awaited<ReturnType<typeof saveMyPublicProfile>>,
    Error,
    Parameters<typeof saveMyPublicProfile>[0]
  >;
}) {
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? '');
  const [avatarError, setAvatarError] = useState('');
  const [accentColor, setAccentColor] = useState<AccentName>(
    profile?.accent_color ?? defaultAccentName,
  );
  const [flairKey, setFlairKey] = useState<FlairName>(profile?.flair_key ?? 'none');

  return (
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
          accentColor,
          avatarUrl: parsedAvatar.data,
          flairKey,
        });
      }}
    >
      <h2>PUBLIC PROFILE</h2>
      <div className="profile-editor-intro">
        <ProfileAvatar
          avatarUrl={avatarUrl || null}
          displayName={displayName}
          accentColor={accentColor}
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
          aria-describedby="profile-avatar-help profile-avatar-error"
          aria-invalid={Boolean(avatarError)}
          onChange={(event) => {
            setAvatarUrl(event.target.value);
            setAvatarError('');
          }}
        />
      </label>
      <p id="profile-avatar-help" className="field-help">
        Use a public HTTPS image URL. The image appears only on profile pages; clear this field to
        remove it.
      </p>
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
                checked={accentColor === accent}
                onChange={(event) => setAccentColor(accentNameSchema.parse(event.target.value))}
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
      </fieldset>
      <label>
        Flair
        <select
          value={flairKey}
          onChange={(event) => setFlairKey(flairNameSchema.parse(event.target.value))}
        >
          {flairNames.map((flair) => (
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
        Flair is a self-selected profile label. It does not change matchmaking, rating, rewards, or
        rank.
      </p>
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
  );
}
