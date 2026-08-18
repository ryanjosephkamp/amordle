import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * The notification feed was the most expensive thing the app did, and none of
 * the cost was visible from any one place: a 30-second poll issuing four
 * parallel requests, plus one more per terminal Practice game — up to
 * twenty-four per cycle — from a component mounted on every page for every
 * signed-in player.
 *
 * These assertions pin the parts that made it expensive, because every one of
 * them is the sort of thing a later change reintroduces without noticing.
 */

const root = process.cwd();

const migration = readFileSync(
  path.resolve(root, 'supabase/migrations/20260818122000_amordle_notification_feed_v1.sql'),
  'utf8',
);
const notificationCenter = readFileSync(
  path.resolve(root, 'src/components/notification-center.tsx'),
  'utf8',
);
const combatAdapter = readFileSync(path.resolve(root, 'src/adapters/cloud/combat.ts'), 'utf8');

describe('the notification feed', () => {
  it('is one request', () => {
    expect(notificationCenter).toContain('await loadCombatNotificationFeed()');
    // The five calls it replaced must not come back into this file.
    for (const gone of [
      'loadSettings(',
      'listRecentCombat(',
      'listLegacyRecent(',
      'listPrivateRequests(',
      'listPracticeRematches(',
    ]) {
      expect(notificationCenter).not.toContain(gone);
    }
    expect(notificationCenter).not.toContain('Promise.allSettled');
  });

  it('polls at two minutes rather than thirty seconds', () => {
    expect(notificationCenter).toContain('refetchInterval: 120_000');
    expect(notificationCenter).not.toContain('refetchInterval: 30_000');
  });

  it('holds no realtime subscription that cannot fire', () => {
    /*
     * Checked, not assumed. `multiplayer_private_match_requests` and
     * `multiplayer_practice_rematch_requests` are not in the
     * `supabase_realtime` publication, and `async_multiplayer_games` admits
     * only `authority_version = 0` rows to a reader — so all three
     * subscriptions were no-ops for any game created since the v2 authority.
     */
    // Quoted, so this matches the subscription argument rather than the
    // comment in that file explaining why the subscriptions are gone.
    expect(notificationCenter).not.toContain("'postgres_changes'");
    expect(notificationCenter).not.toContain('.channel(');
    // What replaced them: an immediate refresh when the player comes back.
    expect(notificationCenter).toContain("window.addEventListener('online', onOnline)");
    expect(notificationCenter).toContain(
      "document.addEventListener('visibilitychange', onVisibility)",
    );
  });

  it('costs nothing to read a feed the player has switched off', () => {
    // The old code fetched everything and then discarded it.
    const guard = migration.slice(
      migration.indexOf('if not v_enabled then'),
      migration.indexOf('select coalesce(jsonb_agg(projection.value)'),
    );
    expect(guard).toContain("'notificationsEnabled', false");
    expect(guard).toContain("'combat', '[]'::jsonb");
  });

  it('defaults notifications on when the settings row is absent', () => {
    // A player who has never opened Settings has no row, and a missing row must
    // not read as a silent blackout.
    expect(migration).toContain("coalesce((setting.settings->>'notifications')::boolean, true)");
    expect(migration).toContain('v_enabled := coalesce(v_enabled, true);');
  });

  it('bounds the legacy scan that used to run open-ended forever', () => {
    expect(migration).toContain("game.updated_at > (now() - interval '90 days')");
    expect(migration).toContain('game.authority_version = 0');
  });

  it('parses the RPC against the schemas already in use', () => {
    // Not new shapes: if the server and the client ever disagree about a field
    // this fails loudly instead of dropping notifications quietly.
    for (const schema of [
      'combat: z.array(combatProjectionSchema)',
      'legacy: z.array(legacyRowSchema)',
      'requests: z.array(privateRequestSchema)',
      'rematches: z.array(rematchRequestSchema)',
    ]) {
      expect(combatAdapter).toContain(schema);
    }
  });
});
