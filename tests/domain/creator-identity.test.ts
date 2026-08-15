import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  accentLabels,
  accentNames,
  contrastRatio,
  creatorPublicProfileId,
  creatorUserId,
  isCreatorProfile,
  flairIsSelectableBy,
  flairLabels,
  flairNames,
  publicProfilePath,
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
  });

  it('leaves every other value open to everyone', () => {
    const open = [
      ...flairNames.filter((flair) => !(restrictedFlairNames as readonly string[]).includes(flair)),
    ];
    expect(open.length).toBeGreaterThan(0);
    for (const flair of open) expect(flairIsSelectableBy(flair, 'anyone-at-all')).toBe(true);
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

/*
 * The voltage accent was removed after the owner judged it too simple — it
 * pulsed one colour rather than moving through any. The creator treatment that
 * replaced it lives in creator-identity CSS and is asserted below.
 *
 * The migration is NOT re-emitted to drop 'voltage' from the accent CHECK. A
 * value the database tolerates but no client can select is inert, and spending
 * a forward migration plus a production credential to delete a string is not
 * worth it. These assertions pin that the constraint still reads the way the
 * applied file reads, so the two cannot silently disagree.
 */
describe('the retired voltage accent', () => {
  it('is gone from every surface a player can reach', () => {
    expect(accentNames).not.toContain('voltage');
    expect(stylesheet).not.toContain("[data-accent='voltage']");
    expect(globals).not.toContain('voltage-arc');
    expect(globals).not.toContain('voltage-rail');
  });

  it('is still permitted by the applied migration, which is inert and deliberate', () => {
    expect(migration).toContain(
      "check (accent_color in ('ice', 'aurora', 'cyan', 'violet', 'rose', 'amber', 'voltage'))",
    );
  });

  it('has a label and a swatch for every accent that remains', () => {
    for (const accent of accentNames) expect(accentLabels[accent]).toBeTruthy();
    for (const flair of flairNames) expect(flairLabels[flair]).toBeTruthy();
  });
});

describe('the creator mark', () => {
  /*
   * The name cycles colour on every surface it appears on, so each beat has to
   * be legible on its own scheme's page background — not just the one that
   * happened to be checked by eye. These ratios are computed from the hexes the
   * stylesheet actually declares, so editing a colour without re-checking it
   * fails here rather than in front of a player.
   */
  const declared = (block: string, name: string) => {
    const match = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(block);
    expect(match, `${name} must be declared`).not.toBeNull();
    return match![1]!;
  };

  // The light :root block, then the dark one inside the scheme media query.
  const lightBlock = stylesheet.slice(stylesheet.indexOf('--creator-a'));
  const darkBlock = lightBlock.slice(lightBlock.indexOf('prefers-color-scheme: dark'));

  const LIGHT_PAGE = '#F5F8F9';
  const DARK_PAGE = '#0A0E12';

  it('keeps every beat readable on its own scheme background', () => {
    for (const name of ['creator-a', 'creator-b', 'creator-c']) {
      const light = declared(lightBlock, name);
      const dark = declared(darkBlock, name);
      expect(
        contrastRatio(light, LIGHT_PAGE) ?? 0,
        `${name} light ${light}`,
      ).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(dark, DARK_PAGE) ?? 0, `${name} dark ${dark}`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it('rests on the beat that both the sweep and reduced motion will freeze', () => {
    /*
     * The contrast sweep disables animation and reduced motion collapses it to
     * 0.01ms, so both observe the 0% frame. If that frame were the white beat,
     * light scheme would be measuring an unreadable colour as though it passed.
     */
    expect(stylesheet).toMatch(/\.is-creator-name \{[^}]*color: var\(--creator-a\)/);
    for (const frame of ['creator-name', 'creator-frame']) {
      const block = new RegExp(`@keyframes ${frame} \\{([\\s\\S]*?)\\n\\}`).exec(globals);
      expect(block, `${frame} keyframes`).not.toBeNull();
      expect(block![1]).toMatch(
        /0%,\s*\n\s*100% \{\s*\n\s*(color|border-color): var\(--creator-a\)/,
      );
    }
  });

  it('stops animating where the surface inverts the ink', () => {
    // A CSS animation outranks normal declarations, so without this the mark
    // would paint over the inversion rules and sit unreadable on a selected row.
    expect(stylesheet).toMatch(/button:hover \.is-creator-name/);
    expect(stylesheet).toMatch(/animation: none;\s*\n\s*color: inherit;/);
  });

  it('confines the page treatment to the creator console', () => {
    // Every rule that draws the tricolour must be a descendant of the console,
    // so it cannot reach the shell, a board, the keyboard, or another profile.
    const rails = [...stylesheet.matchAll(/^\.creator-console[^{]*\{/gm)].map((m) => m[0]);
    expect(rails.length).toBeGreaterThan(0);
    for (const selector of rails) expect(selector.startsWith('.creator-console')).toBe(true);
    expect(stylesheet).not.toMatch(/^\.is-creator-name[^{]*\.key/m);
  });

  it('marks the creator by public profile id and nobody else', () => {
    expect(isCreatorProfile(creatorPublicProfileId)).toBe(true);
    expect(isCreatorProfile('38636674-df3b-4313-a5d8-727db14454f8')).toBe(false);
    expect(isCreatorProfile(null)).toBe(false);
    expect(isCreatorProfile(undefined)).toBe(false);
    expect(isCreatorProfile('')).toBe(false);
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
