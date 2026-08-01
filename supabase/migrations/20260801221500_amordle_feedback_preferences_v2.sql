-- Amordle v6.4: additive cross-device keyboard feedback preferences.
-- The existing settings.settings JSON remains schemaVersion 1 for frozen-client compatibility.

alter table public.settings
  add column if not exists keyboard_sound_profile text not null default 'terminal',
  add column if not exists haptics_enabled boolean not null default false;

alter table public.settings
  drop constraint if exists settings_keyboard_sound_profile_check;

alter table public.settings
  add constraint settings_keyboard_sound_profile_check
  check (
    keyboard_sound_profile in (
      'terminal',
      'soft-tap',
      'mechanical',
      'glass',
      'low-thock'
    )
  );

comment on column public.settings.keyboard_sound_profile is
  'Bounded code-generated keyboard sound profile; independent from the v1 settings JSON.';

comment on column public.settings.haptics_enabled is
  'Opt-in touch-keyboard vibration preference; unsupported clients safely ignore it.';
