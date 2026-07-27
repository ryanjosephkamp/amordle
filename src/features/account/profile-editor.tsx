'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import { useState } from 'react';
import { getMyPublicProfile, saveMyPublicProfile } from '@/adapters/supabase/public';
import type { z } from 'zod';
import { myPublicProfileSchema } from '@/adapters/supabase/public';
import { AccountGate } from '@/components/route-states';

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

  if (profile.isPending) return <p aria-live="polite">Loading profile…</p>;
  if (profile.isError) {
    return (
      <section className="status-panel">
        <h2>Profile unavailable</h2>
        <button onClick={() => void profile.refetch()}>Try again</button>
      </section>
    );
  }

  return <ProfileForm profile={profile.data} save={save} />;
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
  const [accentColor, setAccentColor] = useState(profile?.accent_color || '#2996a8');
  const [flairKey, setFlairKey] = useState(profile?.flair_key || 'none');

  return (
    <form
      className="form-panel field-stack"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({ displayName, bio, visibility, accentColor, flairKey });
      }}
    >
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
      <label>
        Accent color
        <input
          type="color"
          value={accentColor}
          onChange={(event) => setAccentColor(event.target.value)}
        />
      </label>
      <label>
        Flair
        <select value={flairKey} onChange={(event) => setFlairKey(event.target.value)}>
          <option value="none">None</option>
          <option value="daily">Daily player</option>
          <option value="combat">COMBAT player</option>
        </select>
      </label>
      <button className="primary" disabled={save.isPending}>
        {save.isPending ? 'Saving…' : 'Save profile'}
      </button>
      <p aria-live="polite">
        {save.isSuccess ? 'Profile saved.' : save.isError ? 'Profile could not be saved.' : ''}
      </p>
      {profile?.public_profile_id && <p className="mono">Public ID: {profile.public_profile_id}</p>}
    </form>
  );
}
