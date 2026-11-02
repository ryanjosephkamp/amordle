import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const feedback = readFileSync(
  'supabase/migrations/20260801221500_amordle_feedback_preferences_v2.sql',
  'utf8',
);
const avatars = readFileSync(
  'supabase/migrations/20260801222500_amordle_public_avatars_v1.sql',
  'utf8',
);

describe('v6.4 additive authority', () => {
  it('adds only bounded feedback preference columns and retains v1 settings JSON', () => {
    expect(feedback).toContain('add column if not exists keyboard_sound_profile');
    expect(feedback).toContain('add column if not exists haptics_enabled');
    expect(feedback).toContain("'terminal'");
    expect(feedback).toContain("'soft-tap'");
    expect(feedback).toContain("'mechanical'");
    expect(feedback).toContain("'glass'");
    expect(feedback).toContain("'low-thock'");
    expect(feedback).not.toContain('drop column');
    expect(feedback).not.toContain('update public.settings');
    expect(feedback).not.toContain('grant ');
  });

  it('creates one public image bucket with a finite byte and MIME boundary', () => {
    expect(avatars).toContain("'amordle-public-avatars-v1'");
    expect(avatars).toContain('6291456');
    for (const mime of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
      expect(avatars).toContain(mime);
    }
    expect(avatars).not.toContain('image/svg+xml');
    expect(avatars).toContain('already exists with incompatible authority');
    expect(avatars).not.toContain('on conflict (id) do update');
  });

  it('keeps avatar mutation owner-only and limits generated object paths', () => {
    expect(avatars).toContain('for insert\nto authenticated');
    expect(avatars).toContain('for update\nto authenticated');
    expect(avatars).toContain('for delete\nto authenticated');
    expect(avatars.match(/owner_id = \(select auth\.uid\(\)::text\)/g)).toHaveLength(5);
    expect(avatars.match(/name ~ '\^avatars\//g)).toHaveLength(2);
    expect(avatars).not.toContain('to anon');
    expect(avatars).not.toContain('to public');
    expect(avatars).not.toContain('service_role');
    expect(avatars).not.toContain('auth.users');
  });
});
