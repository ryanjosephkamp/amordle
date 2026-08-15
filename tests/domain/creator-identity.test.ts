import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  accentIsSelectableBy,
  accentLabels,
  accentNames,
  creatorUserId,
  flairIsSelectableBy,
  flairLabels,
  flairNames,
  publicProfilePath,
  restrictedAccentNames,
  restrictedFlairNames,
} from '@/domain/profile';

const migration = readFileSync(
  path.resolve(process.cwd(), 'supabase/migrations/20260815055205_amordle_creator_identity_v1.sql'),
  'utf8',
);

const stylesheet = readFileSync(path.resolve(process.cwd(), 'src/app/tui-shell.css'), 'utf8');
const globals = readFileSync(path.resolve(process.cwd(), 'src/app/globals.css'), 'utf8');

describe('the restricted values', () => {
  it('are offered to the creator and to nobody else', () => {
    for (const flair of restrictedFlairNames) {
      expect(flairIsSelectableBy(flair, creatorUserId)).toBe(true);
      expect(flairIsSelectableBy(flair, 'de305d54-75b4-431b-adb2-eb6b9e546014')).toBe(false);
      expect(flairIsSelectableBy(flair, null)).toBe(false);
      expect(flairIsSelectableBy(flair, '')).toBe(false);
    }
    for (const accent of restrictedAccentNames) {
      expect(accentIsSelectableBy(accent, creatorUserId)).toBe(true);
      expect(accentIsSelectableBy(accent, 'de305d54-75b4-431b-adb2-eb6b9e546014')).toBe(false);
      expect(accentIsSelectableBy(accent, null)).toBe(false);
    }
  });

  it('leaves every other value open to everyone', () => {
    const open = [
      ...flairNames.filter((flair) => !(restrictedFlairNames as readonly string[]).includes(flair)),
    ];
    expect(open.length).toBeGreaterThan(0);
    for (const flair of open) expect(flairIsSelectableBy(flair, 'anyone-at-all')).toBe(true);

    for (const accent of accentNames.filter(
      (accent) => !(restrictedAccentNames as readonly string[]).includes(accent),
    )) {
      expect(accentIsSelectableBy(accent, 'anyone-at-all')).toBe(true);
    }
  });
});

describe('the migration that actually enforces it', () => {
  /*
   * The client gate above decides what the picker offers. It is not the
   * authority and must never be mistaken for one — anyone can call the RPC by
   * hand. These assertions pin the constraint that cannot be talked around.
   */
  it('binds both restricted values to the creator in a CHECK constraint', () => {
    expect(migration).toContain('public_player_profiles_creator_identity_check');
    expect(migration).toMatch(
      /check\s*\(\s*\(flair_key <> 'creator' and accent_color <> 'voltage'\)\s*or user_id = '[0-9a-f-]+'::uuid\s*\)/,
    );
    expect(migration).toContain(creatorUserId);
  });

  it('allows the values through the column constraints at all', () => {
    expect(migration).toContain("check (flair_key in ('none', 'daily', 'combat', 'creator'))");
    expect(migration).toContain(
      "check (accent_color in ('ice', 'aurora', 'cyan', 'violet', 'rose', 'amber', 'voltage'))",
    );
  });

  it('names the same account the client does', () => {
    // Two copies of a uuid is one typo away from a gate that opens for nobody
    // or, worse, offers an option the server then refuses.
    const inMigration = [...migration.matchAll(/'([0-9a-f]{8}-[0-9a-f-]+)'::uuid/g)].map(
      (match) => match[1],
    );
    expect(inMigration.length).toBeGreaterThan(0);
    expect(new Set(inMigration)).toEqual(new Set([creatorUserId]));
  });

  it('widens the validators so an ordinary caller gets a sentence', () => {
    expect(migration).toContain("raise exception 'That flair is reserved.'");
    expect(migration).toContain("raise exception 'That accent is reserved.'");
  });
});

describe('the voltage accent', () => {
  it('declares every variable its neighbours declare, in both schemes', () => {
    const cyanLight = [...stylesheet.matchAll(/\[data-accent='cyan'\] \{([^}]*)\}/g)];
    const voltageLight = [...stylesheet.matchAll(/\[data-accent='voltage'\] \{([^}]*)\}/g)];
    expect(voltageLight).toHaveLength(cyanLight.length);
    const names = (block: string) =>
      [...block.matchAll(/(--[a-z-]+):/g)].map(([, name]) => name).sort();
    for (const [index, block] of voltageLight.entries()) {
      expect(names(block[1] ?? '')).toEqual(names(cyanLight[index]?.[1] ?? ''));
    }
  });

  it('animates only shadows, so no frame of it can move a contrast ratio', () => {
    const keyframes = [...globals.matchAll(/@keyframes voltage-[a-z]+ \{([\s\S]*?)\n\}/g)];
    expect(keyframes.length).toBeGreaterThan(0);
    for (const frame of keyframes) {
      const properties = [...(frame[1] ?? '').matchAll(/^\s{4}([a-z-]+):/gm)].map(
        ([, property]) => property,
      );
      expect(properties.length).toBeGreaterThan(0);
      expect([...new Set(properties)].sort()).toEqual(
        ['box-shadow', 'text-shadow'].filter((p) => properties.includes(p)),
      );
    }
  });

  it('has a label and a swatch like every other accent', () => {
    for (const accent of accentNames) {
      expect(accentLabels[accent]).toBeTruthy();
    }
    for (const flair of flairNames) {
      expect(flairLabels[flair]).toBeTruthy();
    }
  });
});

describe('the profile path', () => {
  it('encodes the identifier', () => {
    expect(publicProfilePath('f08161d7-6d57-4142-b42d-7bcf86b983fc')).toBe(
      '/players/f08161d7-6d57-4142-b42d-7bcf86b983fc',
    );
    expect(publicProfilePath('a b/c')).toBe('/players/a%20b%2Fc');
  });
});
