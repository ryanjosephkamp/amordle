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

const coalesceMigration = readFileSync(
  path.resolve(
    process.cwd(),
    'supabase/migrations/20260816013000_amordle_accent_preset_is_active_coalesce_v1.sql',
  ),
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

  it('names where the null came from', () => {
    // The original, which is immutable and stays exactly as it shipped.
    expect(migration).toContain('profile.active_accent_preset_id = preset.preset_id as is_active');
  });

  it('has a forward migration that fixes it at source', () => {
    /*
     * The proper fix, written and awaiting the owner's apply. Note that the
     * client tolerance above is deliberately KEPT rather than removed once this
     * lands: a deployed client is not upgraded in step with the database, and
     * "no active preset" genuinely means false, so reading it that way is the
     * meaning rather than a workaround.
     */
    expect(coalesceMigration).toContain(
      'coalesce(profile.active_accent_preset_id = preset.preset_id, false) as is_active',
    );
    // Re-emitted, not altered: the signature and the guards must come across
    // intact, or the fix quietly changes who can call it.
    expect(coalesceMigration).toContain('security definer');
    expect(coalesceMigration).toContain("set search_path = ''");
    expect(coalesceMigration).toContain("where auth.role() = 'authenticated'");
    expect(coalesceMigration).toContain('limit 24');
    expect(coalesceMigration).toContain(
      'grant execute on function public.list_my_accent_presets_v2() to authenticated;',
    );
  });
});
