'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { getMyPublicProfile, saveMyPublicProfile } from '@/adapters/supabase/public';
import type { z } from 'zod';
import { myPublicProfileSchema } from '@/adapters/supabase/public';
import { AccountGate, SkeletonRows } from '@/components/route-states';
import { accentCssColors, accentLabels, accentNameSchema, accentNames } from '@/domain/profile';
import type { AccentName } from '@/domain/profile';

export function ProfileEditor() {
  return (
    <AccountGate>
      <ProfileEditorInner />
    </AccountGate>
  );
}

function ProfileEditorInner() {
  const queryClient = useQueryClient();
  const profile = useQuery({
    queryKey: ['profile', 'mine'],
    queryFn: getMyPublicProfile,
  });
  const save = useMutation({
    mutationFn: saveMyPublicProfile,
    onSuccess: (data) => {
      queryClient.setQueryData(['profile', 'mine'], data);
      void queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
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
  const [visibility, setVisibility] = useState<'public' | 'private'>(
    profile?.visibility === 'private' ? 'private' : 'public',
  );
  const [accentColor, setAccentColor] = useState<AccentName>(profile?.accent_color ?? 'ice');
  const [flairKey, setFlairKey] = useState(profile?.flair_key || 'none');

  return (
    <form
      className="form-panel field-stack"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({ displayName, bio, visibility, accentColor, flairKey });
      }}
    >
      <h2>PUBLIC PROFILE</h2>
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
        Public visibility
        <select
          value={visibility}
          onChange={(event) => setVisibility(event.target.value as 'public' | 'private')}
        >
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
      </label>
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
        <select value={flairKey} onChange={(event) => setFlairKey(event.target.value)}>
          <option value="none">None</option>
          <option value="daily">Daily player</option>
          <option value="combat">COMBAT player</option>
        </select>
      </label>
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
      {profile?.public_profile_id && <p className="mono">Public ID: {profile.public_profile_id}</p>}
    </form>
  );
}
