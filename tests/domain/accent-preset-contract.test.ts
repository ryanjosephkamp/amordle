import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { accentPresetSchema } from '@/adapters/cloud/public';

/*
 * This file exists because a player lost their Profile page by using the app
 * exactly as intended.
 *
 * Save a custom accent, then switch back to one of the named accents. The
 * preset row survives, `active_accent_preset_id` goes null, and
 * list_my_accent_presets_v2 computes
 * `profile.active_accent_preset_id = preset.preset_id` — which for a null left
 * side is NULL in SQL, not false. The client demanded a boolean, the parse
 * threw, and /profile rendered "Profile unavailable" with a Try again button
 * that could never succeed.
 *
 * No test caught it because every account the hosted suite builds leaves a
 * preset active, so `is_active` was never null in any run. The fixture below is
 * the shape the server actually sends to a player who is not currently wearing
 * a custom accent.
 */

const migration = readFileSync(
  path.resolve(process.cwd(), 'supabase/migrations/20260801193000_amordle_accent_presets_v2.sql'),
  'utf8',
);

const preset = {
  accent_hex: '#000000',
  created_at: '2026-08-15T03:08:14.493843+00:00',
  name: '#000000',
  preset_id: '0fc4575b-fde0-48a2-bc14-068866d8b1fb',
  updated_at: '2026-08-15T03:08:14.493843+00:00',
};

describe('a saved accent preset that is not the active one', () => {
  it('parses when the server reports is_active as null', () => {
    const parsed = accentPresetSchema.parse({ ...preset, is_active: null });
    expect(parsed.is_active).toBe(false);
  });

  it('still parses the ordinary true and false cases', () => {
    expect(accentPresetSchema.parse({ ...preset, is_active: true }).is_active).toBe(true);
    expect(accentPresetSchema.parse({ ...preset, is_active: false }).is_active).toBe(false);
  });

  it('rejects a value that is neither a boolean nor null', () => {
    // Tolerating null is a statement about SQL's three-valued logic, not an
    // invitation to accept anything the server feels like sending.
    expect(() => accentPresetSchema.parse({ ...preset, is_active: 'yes' })).toThrow();
    expect(() => accentPresetSchema.parse({ ...preset, is_active: 1 })).toThrow();
  });

  it('is still reading a server column that can be null', () => {
    /*
     * The guard on the guard. If the migration is ever re-emitted with a
     * coalesce — the proper fix — this assertion fails and whoever did it can
     * decide whether the client tolerance is still wanted. Until then it
     * documents that the null is real and comes from here.
     */
    expect(migration).toContain('profile.active_accent_preset_id = preset.preset_id as is_active');
    expect(migration).not.toContain(
      'coalesce(profile.active_accent_preset_id = preset.preset_id, false)',
    );
  });
});
