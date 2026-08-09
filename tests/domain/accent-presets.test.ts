import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20260801193000_amordle_accent_presets_v2.sql',
  'utf8',
);
const shellCss = readFileSync('src/app/tui-shell.css', 'utf8');

const functionBoundary = (name: string, nextName: string) =>
  migration.slice(
    migration.indexOf(`create or replace function public.${name}`),
    migration.indexOf(`create or replace function public.${nextName}`),
  );

describe('v6.3 custom accent authority', () => {
  it('keeps preset rows private and account-owned behind bounded RPCs', () => {
    for (const fragment of [
      'create table if not exists public.public_profile_accent_presets',
      'user_id uuid not null references auth.users(id) on delete cascade',
      'force row level security',
      'user_id = (select auth.uid())',
      'revoke all on table public.public_profile_accent_presets',
      'list_my_accent_presets_v2',
      'upsert_my_accent_preset_v2',
      'delete_my_accent_preset_v2',
    ]) {
      expect(migration).toContain(fragment);
    }
    expect(migration).not.toContain('grant select on public.public_profile_accent_presets');
    expect(migration).not.toContain('grant insert on public.public_profile_accent_presets');
    expect(migration).not.toContain('grant update on public.public_profile_accent_presets');
    expect(migration).not.toContain('grant delete on public.public_profile_accent_presets');
  });

  it('enforces canonical values, unique names, and the transactional 24-item cap', () => {
    for (const fragment of [
      "accent_hex ~ '^#[0-9A-F]{6}$'",
      'char_length(name) between 1 and 32',
      'on public.public_profile_accent_presets (user_id, lower(name))',
      "pg_catalog.hashtextextended(v_user_id::text || ':accent-presets', 0)",
      ') >= 24 then',
      'v_name := p_accent_hex',
    ]) {
      expect(migration).toContain(fragment);
    }
  });

  it('falls back to Aurora when an active custom preset is deleted', () => {
    const deletionBoundary = functionBoundary(
      'phase63_clear_deleted_active_accent',
      'list_my_accent_presets_v2',
    );
    expect(deletionBoundary).toContain('active_accent_preset_id = null');
    expect(deletionBoundary).toContain('accent_hex = null');
    expect(deletionBoundary).toContain("accent_color = 'aurora'");
    expect(migration).toContain("alter column accent_color set default 'aurora'");
  });

  it('keeps v1 profile authority compatible while v2 adds only bounded accent metadata', () => {
    const v1Boundary = functionBoundary(
      'upsert_my_public_player_profile',
      'get_my_public_player_profile_v2',
    );
    for (const legacyColumn of [
      'public_profile_id uuid',
      'visibility text',
      'display_name text',
      'accent_color text',
      'flair_key text',
      'avatar_url text',
      'bio text',
      'moderation_status text',
    ]) {
      expect(v1Boundary).toContain(legacyColumn);
    }
    expect(v1Boundary).not.toContain('accent_hex text');
    expect(v1Boundary).toContain(
      'when public.public_player_profiles.active_accent_preset_id is null',
    );
    expect(v1Boundary).not.toContain('active_accent_preset_id = null');
    expect(v1Boundary).not.toContain('accent_hex = null');

    const publicV2Boundary = functionBoundary(
      'get_public_player_profile_v2',
      'get_public_player_profiles_v2',
    );
    expect(publicV2Boundary).toContain('accent_hex text');
    expect(publicV2Boundary).not.toContain('user_id');
    expect(publicV2Boundary).not.toContain('active_accent_preset_id');
    expect(publicV2Boundary).not.toContain('email');
    expect(publicV2Boundary).not.toContain('preset_id');
  });

  it('does not rewrite existing profiles or expose preset names in public projections', () => {
    const beforeFunctions = migration.slice(
      0,
      migration.indexOf(
        'create or replace function public.phase29_validate_public_profile_accent_color',
      ),
    );
    expect(beforeFunctions).not.toMatch(/update\s+public\.public_player_profiles/i);

    const publicProjectionStart = migration.indexOf(
      'create or replace function public.get_public_player_profile_v2',
    );
    const publicProjections = migration.slice(
      publicProjectionStart,
      migration.indexOf('comment on table public.public_profile_accent_presets'),
    );
    expect(publicProjections).not.toContain('preset.name');
    expect(publicProjections).not.toContain('preset.user_id');
    expect(publicProjections).not.toContain('auth.users');
  });

  it('defines every named palette in both modes and keeps semantic evidence outside custom accents', () => {
    /*
     * The six NAMED accents are scoped to a bare attribute so that a subtree can carry its
     * own accent — the Help COMBAT figure needs two keyboards in two different accents,
     * one of them the viewer's. Asserted as "not :root-scoped" rather than just "present",
     * because re-adding the `:root` prefix would silently break that figure again.
     */
    for (const accent of ['ice', 'aurora', 'cyan', 'violet', 'rose', 'amber']) {
      expect(
        shellCss.match(new RegExp(`(?<!:root)\\[data-accent='${accent}'\\]\\s*\\{`, 'g')),
        accent,
      ).toHaveLength(2);
      expect(shellCss, `${accent} must not be re-scoped to :root`).not.toMatch(
        new RegExp(`:root\\[data-accent='${accent}'\\]`),
      );
    }
    /*
     * `custom` is the deliberate exception and stays at `:root`. It resolves fourteen
     * `--custom-*` variables that only a signed-in account's active preset supplies, and
     * `accent-preset-dialog` puts `data-accent="custom"` on a non-root node — relaxing it
     * would repaint that dialog from variables that may not exist.
     */
    expect(shellCss.match(/:root\[data-accent='custom'\]/g)).toHaveLength(2);
    for (const block of shellCss.matchAll(/:root\[data-accent='custom'\]\s*\{([^}]+)\}/g)) {
      expect(block[1]).not.toMatch(/--(?:correct|present|absent|removed):/);
    }
  });
});
