import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const manifestPath = resolve(root, 'bootstrap/BUNDLE-MANIFEST.json');
const ledgerPath = resolve(root, 'supabase/migrations.sha256');
const expectedLedgerHash = 'f73fc5e4260585a93035c4dc2b5bb9216d5576124c55f652d4a66b1369fd14bf';
const authorizedAdditiveMigrations = new Map([
  [
    '20260730193000_amordle_combat_authority_v3.sql',
    '1ade2a1b7e49e50cb46bc938d393c9d1e6ca8e62508678baa8efef203c937179',
  ],
  [
    '20260801032334_amordle_public_community_v1.sql',
    'ee1885032983b79577b08afbe7f989221dbe264f09401849f78f5e9b34d11d52',
  ],
  [
    '20260801051509_amordle_public_community_stats_repair.sql',
    '7897de557bd118ce2ca7e5f23e260e6cf06e5d58f7d49915ee5668df956d5a22',
  ],
  [
    '20260801193000_amordle_accent_presets_v2.sql',
    '26d488ee2d64e69a6a08a28ef7891e01289874ab6c1de7a1f1eb1ffc6fa75f84',
  ],
  [
    '20260801221500_amordle_feedback_preferences_v2.sql',
    'cde752fb637554292435292880b5375d6d8ce02c69793757d3655d7b1ba6c368',
  ],
  [
    '20260801222500_amordle_public_avatars_v1.sql',
    '1259a67886b9e7c64911b66cacfec39868a75d78e6e7a3a79966b274a8610f17',
  ],
  [
    '20260802193000_amordle_account_lifecycle_v1.sql',
    'caad339a608a0a23f5589a25bed6a1f2d415d033e04db707fce214687192c9f3',
  ],
  // W-11: repairs get_public_ranked_leaderboard to the current Amordle v2 rating
  // buckets. Separately authorized by the owner on 2026-08-05. See D-005.
  [
    '20260805200000_amordle_ranked_leaderboard_bucket_repair.sql',
    '5093ce9326258c4d2eb647b7a422a59e900e8d46171e7fe8bc2d21ee517aaa3b',
  ],
  [
    '20260810020000_amordle_ranked_buckets_v4.sql',
    '84ec8bb0474570878db66091b0565faebd5ee89c4e806ff0b35c72ee9c06c721',
  ],
  [
    '20260810090000_amordle_combat_portal_v1.sql',
    '01fd1edc7c06e05d6045f194c033939cb632629326875a9e8bb6460929f3898a',
  ],
  [
    '20260811010000_amordle_matchmaking_repair_v1.sql',
    'dd30b1c448ae9a6b8529b0e74f46ad613eca630f2ff0ab93d0f67afe4c456a89',
  ],
  [
    '20260814010000_amordle_public_ranked_lanes_v4.sql',
    '7ee3650210b5e6a2b94006417bde647856497f14e5df89d559f11408f0981f3a',
  ],
  [
    '20260814120000_amordle_system_settlement_and_reaper_v1.sql',
    'ee15df3c7d552951edeba97c2526840e19ad75ea4a7598d17684d2b3951212f1',
  ],
  // v10: the Creator flair and the Voltage accent, bound to one account by a
  // CHECK constraint on the row rather than a test of the caller. Authorized by
  // the owner and applied to the linked project on 2026-08-15. See
  // reports/v10-creator-identity-migration-decision-2026-08-15.md.
  [
    '20260815055205_amordle_creator_identity_v1.sql',
    '7b0600cc0ab501dbe6bcfe4477a66a184ee359e93cb45a338676e51a2317001f',
  ],
]);
const reviewedPendingMigrations = new Map([]);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const failures = [];

if (!existsSync(manifestPath)) {
  failures.push('bootstrap manifest is missing');
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const entry of manifest.files) {
    const path = resolve(root, entry.path);
    if (!existsSync(path)) {
      failures.push(`missing baseline file: ${entry.path}`);
      continue;
    }
    const actual = sha256(readFileSync(path));
    if (actual !== entry.sha256) {
      failures.push(`baseline hash mismatch: ${entry.path}`);
    }
  }
  if (!failures.length) {
    process.stdout.write(
      `PASS immutable bootstrap baseline ${manifest.files.length}/${manifest.files.length}\n`,
    );
  }
}

if (!existsSync(ledgerPath)) {
  failures.push('migration ledger is missing');
} else if (sha256(readFileSync(ledgerPath)) !== expectedLedgerHash) {
  failures.push('migration ledger hash mismatch');
}

const migrationsDirectory = resolve(root, 'supabase/migrations');
const migrations = readdirSync(migrationsDirectory)
  .filter((name) => name.endsWith('.sql'))
  .sort();
const rows = readFileSync(ledgerPath, 'utf8')
  .trim()
  .split('\n')
  .map((line) => line.match(/^([a-f0-9]{64})  migrations\/(.+\.sql)$/))
  .filter(Boolean);

if (rows.length !== 45) {
  failures.push('immutable migration ledger row count is not 45');
}

for (const [, expected, name] of rows) {
  const path = resolve(migrationsDirectory, name);
  if (!existsSync(path) || sha256(readFileSync(path)) !== expected) {
    failures.push(`migration hash mismatch: ${name}`);
  }
}

const immutableNames = new Set(rows.map(([, , name]) => name));
const additiveNames = migrations.filter((name) => !immutableNames.has(name));
const recognizedAdditiveMigrations = new Map([
  ...authorizedAdditiveMigrations,
  ...reviewedPendingMigrations,
]);
if (
  migrations.length !== rows.length + recognizedAdditiveMigrations.size ||
  additiveNames.length !== recognizedAdditiveMigrations.size
) {
  failures.push('additive migration count is not recognized');
}
for (const name of additiveNames) {
  const expected = recognizedAdditiveMigrations.get(name);
  const path = resolve(migrationsDirectory, name);
  if (!expected || !existsSync(path) || sha256(readFileSync(path)) !== expected) {
    failures.push(`unauthorized or changed additive migration: ${name}`);
  }
}

if (!failures.some((failure) => failure.includes('migration'))) {
  process.stdout.write(
    `PASS immutable migrations 45/45 + authorized additive ${
      additiveNames.filter((name) => authorizedAdditiveMigrations.has(name)).length
    }/${authorizedAdditiveMigrations.size}\n`,
  );
  process.stdout.write(
    `PASS reviewed pending additive ${reviewedPendingMigrations.size}/${reviewedPendingMigrations.size}\n`,
  );
}

if (failures.length) {
  process.stderr.write(
    `Bootstrap baseline verification failed:\n${failures
      .map((failure) => `- ${failure}`)
      .join('\n')}\n`,
  );
  process.exit(1);
}
