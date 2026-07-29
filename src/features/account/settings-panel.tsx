'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loadSettings, saveSettings } from '@/adapters/supabase/account';
import { AccountGate, SkeletonRows } from '@/components/route-states';
import { useAuth } from '@/components/providers';

export function SettingsPanel() {
  return (
    <AccountGate>
      <SettingsPanelInner />
    </AccountGate>
  );
}

function SettingsPanelInner() {
  const auth = useAuth();
  const userId = auth.user?.id ?? '';
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ['settings', userId],
    queryFn: () => loadSettings(userId),
    enabled: Boolean(userId),
  });
  const update = useMutation({
    mutationFn: (input: NonNullable<typeof settings.data>) => saveSettings(userId, input),
    onSuccess: (data) => queryClient.setQueryData(['settings', userId], data),
  });

  if (settings.isPending) return <SkeletonRows label="Loading settings…" rows={4} />;
  if (settings.isError || !settings.data) {
    return (
      <section className="status-panel">
        <h2>Settings unavailable</h2>
        <p>Your current preferences were not changed.</p>
        <button onClick={() => void settings.refetch()}>Try again</button>
      </section>
    );
  }
  const value = settings.data;
  const toggle = (key: 'sound' | 'reducedEffects' | 'notifications' | 'defaultHardMode') => {
    update.mutate({ ...value, [key]: !value[key] });
  };

  return (
    <div className="data-list" aria-label="Player settings">
      <SettingRow
        label="Sound"
        description="Play feedback only for accepted actions."
        checked={value.sound}
        onChange={() => toggle('sound')}
      />
      <SettingRow
        label="Reduced effects"
        description="Use simpler transitions in addition to system motion preferences."
        checked={value.reducedEffects}
        onChange={() => toggle('reducedEffects')}
      />
      <SettingRow
        label="Notifications"
        description="Show actionable match and request updates."
        checked={value.notifications}
        onChange={() => toggle('notifications')}
      />
      <SettingRow
        label="Default Hard Mode"
        description="Preselect Hard Mode for new Practice games."
        checked={value.defaultHardMode}
        onChange={() => toggle('defaultHardMode')}
      />
      <p aria-live="polite">
        {update.isPending
          ? 'Saving…'
          : update.isError
            ? 'Settings could not be saved.'
            : update.isSuccess
              ? 'Settings saved.'
              : ''}
      </p>
    </div>
  );
}

function SettingRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange(): void;
}) {
  return (
    <div className="data-row setting-row">
      <div>
        <strong>{label}</strong>
        <p>{description}</p>
      </div>
      <label className="switch-control">
        <span className="sr-only">{label}</span>
        <input type="checkbox" checked={checked} onChange={onChange} />
        <span>{checked ? 'On' : 'Off'}</span>
      </label>
    </div>
  );
}
