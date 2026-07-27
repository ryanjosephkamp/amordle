import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  GOLDEN,
  buildClassification,
  renderClassification,
} from "./tools/generate-classification.mjs";
import {
  buildBundleManifest,
  renderBundleManifest,
} from "./tools/generate-bundle-manifest.mjs";

const root = process.cwd();
const failures = [];
const pass = (message) => process.stdout.write(`PASS ${message}\n`);
const fail = (message) => failures.push(message);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const read = (path) => readFileSync(resolve(root, path));
const text = (path) => read(path).toString("utf8");
const git = (...args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 1024,
  }).trim();

function check(condition, message) {
  if (condition) pass(message);
  else fail(message);
}

function verifyClassification() {
  const expected = renderClassification(buildClassification());
  const actual = text("bootstrap/TRACKED-PATH-CLASSIFICATION.tsv");
  check(actual === expected, "tracked-path classification is exact and current");

  const lines = actual.trim().split("\n");
  check(lines.length === 304, "classification contains header plus 303 paths");
  const counts = new Map();
  for (const line of lines.slice(1)) {
    const [, classification] = line.split("\t");
    counts.set(classification, (counts.get(classification) ?? 0) + 1);
  }
  check(
    counts.get("retain") === 49 &&
      counts.get("transform") === 43 &&
      counts.get("golden-only") === 189 &&
      counts.get("remove") === 22,
    "classification counts are 49/43/189/22",
  );
}

function verifyGoldenRefs() {
  const localGoldenBranch =
    "refs/heads/codex/pre-terminal-greenfield-golden-2026-07-26";
  const remoteGoldenBranch =
    "refs/remotes/origin/codex/pre-terminal-greenfield-golden-2026-07-26";
  const goldenBranchRef = (() => {
    try {
      git("rev-parse", "--verify", localGoldenBranch);
      return localGoldenBranch;
    } catch {
      return remoteGoldenBranch;
    }
  })();
  check(
    git("rev-parse", "--verify", goldenBranchRef) === GOLDEN,
    "available golden branch resolves to expected commit",
  );
  check(
    git(
      "rev-parse",
      "refs/tags/amordle-pre-terminal-greenfield-golden-2026-07-26^{}",
    ) === GOLDEN,
    "local golden tag resolves to expected commit",
  );
  check(
    (() => {
      const roots = git("rev-list", "--max-parents=0", "HEAD").split("\n");
      return (
        roots.length === 1 &&
        git("rev-list", "--parents", "-n", "1", roots[0]).split(" ").length === 1
      );
    })(),
    "current lineage has exactly one parentless root",
  );
}

function verifyMigrations() {
  const directory = resolve(root, "supabase/migrations");
  const migrationFiles = readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  check(migrationFiles.length === 45, "exactly 45 migration files are present");

  const ledgerRows = text("supabase/migrations.sha256")
    .trim()
    .split("\n")
    .map((line) => line.match(/^([a-f0-9]{64})  migrations\/(.+\.sql)$/))
    .filter(Boolean);
  check(ledgerRows.length === 45, "migration checksum ledger has 45 valid rows");

  for (const [, expected, name] of ledgerRows) {
    const path = `supabase/migrations/${name}`;
    if (!existsSync(resolve(root, path))) {
      fail(`missing migration ${path}`);
      continue;
    }
    if (sha256(read(path)) !== expected) fail(`migration checksum mismatch ${path}`);
  }
  if (!failures.some((item) => item.includes("migration"))) {
    pass("all migration bytes match the immutable checksum ledger");
  }
}

function verifyWordLists() {
  const directory = resolve(root, "bootstrap/source-data/word-lists");
  const files = readdirSync(directory).sort();
  check(files.length === 35, "word-list source contains 34 lengths plus manifest");
  const expectedNames = [
    "manifest.json",
    ...Array.from({ length: 34 }, (_, index) => `words_length_${index + 2}.json`),
  ].sort();
  check(
    JSON.stringify(files) === JSON.stringify(expectedNames),
    "word-list source covers every length 2 through 35",
  );

  const manifest = JSON.parse(text("bootstrap/source-data/word-lists/manifest.json"));
  check(
    manifest.revision === "7cf03cea4eef62e8611e639d5d8afc2f42adfe0e" &&
      Array.isArray(manifest.entries) &&
      manifest.entries.length === 34,
    "word-list manifest has expected revision and 34 entries",
  );

  for (const row of buildClassification().filter((item) =>
    item.sourcePath.startsWith("public/word-lists/bundled/"),
  )) {
    const destination = resolve(root, row.destination);
    if (!existsSync(destination)) {
      fail(`missing transformed word-list ${row.destination}`);
      continue;
    }
    if (sha256(readFileSync(destination)) !== row.sha256) {
      fail(`transformed word-list checksum mismatch ${row.destination}`);
    }
  }
  if (!failures.some((item) => item.includes("word-list"))) {
    pass("transformed word-list bytes match the golden source");
  }
}

function verifyRetainedBytes() {
  for (const row of buildClassification().filter(
    (item) => item.classification === "retain",
  )) {
    const destination = resolve(root, row.destination);
    if (!existsSync(destination)) {
      fail(`missing retained file ${row.destination}`);
      continue;
    }
    if (sha256(readFileSync(destination)) !== row.sha256) {
      fail(`retained file changed ${row.destination}`);
    }
  }
  if (!failures.some((item) => item.includes("retained file"))) {
    pass("all 49 retained paths are byte-identical to the golden source");
  }
}

function verifyCapabilityContract() {
  const contract = text("bootstrap/FUNCTIONAL-CONTRACT.md");
  const actual = [
    ...contract.matchAll(/^### ((?:APP|GAME|ACC|MP|SUP)-\d{2})\b/gm),
  ].map((match) => match[1]);
  const expected = [
    ...Array.from({ length: 12 }, (_, i) => `APP-${String(i + 1).padStart(2, "0")}`),
    ...Array.from({ length: 14 }, (_, i) => `GAME-${String(i + 1).padStart(2, "0")}`),
    ...Array.from({ length: 13 }, (_, i) => `ACC-${String(i + 1).padStart(2, "0")}`),
    ...Array.from({ length: 21 }, (_, i) => `MP-${String(i + 1).padStart(2, "0")}`),
    ...Array.from({ length: 6 }, (_, i) => `SUP-${String(i + 1).padStart(2, "0")}`),
  ];
  check(
    JSON.stringify(actual) === JSON.stringify(expected),
    "functional contract contains all 66 ordered preservation IDs",
  );
  check(
    /POST \/api\/admin-refresh/.test(contract) &&
      /GET \/api\/cron\/refresh-word-lists/.test(contract) &&
      /GET \/api\/word-lists\/manifest/.test(contract),
    "functional contract names exactly the three retained APIs",
  );
}

function verifyConfiguration() {
  const env = text(".env.example");
  check(!env.includes("VITE_"), "environment template contains no Vite variables");
  check(
    env.includes("NEXT_PUBLIC_SUPABASE_URL") &&
      env.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    "environment template names only the intended browser-safe values",
  );
  check(
    !/NEXT_PUBLIC_.*(?:SERVICE_ROLE|TOKEN|SECRET|PASSWORD)/.test(env),
    "server secrets are not browser-prefixed",
  );

  const vercel = JSON.parse(text("vercel.json"));
  check(vercel.git?.deploymentEnabled === false, "Vercel Git deployment is disabled");
  check(!("rewrites" in vercel), "obsolete SPA rewrite is absent");
  check(
    vercel.crons?.length === 1 &&
      vercel.crons[0].path === "/api/cron/refresh-word-lists" &&
      vercel.crons[0].schedule === "0 0 * * *",
    "Vercel cron contract is preserved",
  );
}

function verifyCleanLineageTree() {
  for (const forbidden of [
    "api",
    "public",
    "quality",
    "src",
    "tests",
    "package.json",
    "pnpm-lock.yaml",
    "vite.config.ts",
    "vitest.config.ts",
    "playwright.config.ts",
  ]) {
    check(!existsSync(resolve(root, forbidden)), `rejected path absent: ${forbidden}`);
  }

  const allowedRetirementMentions = new Set([
    "AGENTS.md",
    "bootstrap/CONSTITUTION.md",
    "bootstrap/DECISION-LEDGER.md",
    "bootstrap/FUNCTIONAL-CONTRACT.md",
    "bootstrap/PRODUCT-BRIEF.md",
    "bootstrap/REFERENCE-MANIFEST.md",
    "bootstrap/SOURCE-REFERENCE-MANIFEST.md",
    "bootstrap/TRACKED-PATH-CLASSIFICATION.tsv",
  ]);
  const retiredPattern =
    /concept gallery|fire\/ice|cyberpunk|lunar signal|atmospheric edge|proof match/i;
  for (const file of buildBundleManifest(root).files) {
    if (
      allowedRetirementMentions.has(file.path) ||
      file.path === "bootstrap/validate-bootstrap.mjs" ||
      file.path.startsWith("bootstrap/source-data/") ||
      file.path.startsWith("supabase/migrations/") ||
      file.path.endsWith(".json")
    ) {
      continue;
    }
    const content = read(file.path);
    if (content.includes(0)) continue;
    if (retiredPattern.test(content.toString("utf8"))) {
      fail(`retired visual/proof term outside retirement documents: ${file.path}`);
    }
  }
  if (!failures.some((item) => item.includes("retired visual"))) {
    pass("retired visual/proof terms are confined to retirement documents");
  }
}

function verifyBundleManifest() {
  const expected = renderBundleManifest(buildBundleManifest(root));
  const actual = text("bootstrap/BUNDLE-MANIFEST.json");
  check(actual === expected, "bundle manifest paths, sizes, and hashes are exact");

  const manifest = JSON.parse(actual);
  check(
    manifest.migrations.count === 45 &&
      manifest.classification.sourcePaths === 303,
    "bundle manifest records migration and classification baselines",
  );
}

function verifyRequiredFiles() {
  for (const path of [
    "AGENTS.md",
    "README.md",
    "bootstrap/BOOTSTRAP-INSTRUCTIONS.md",
    "bootstrap/CONSTITUTION.md",
    "bootstrap/FUNCTIONAL-CONTRACT.md",
    "bootstrap/BACKEND-AND-SERVICES-CONTRACT.md",
    "bootstrap/TESTING-AND-ACCEPTANCE-CONTRACT.md",
    "bootstrap/PRODUCT-BRIEF.md",
    "bootstrap/SOURCE-REFERENCE-MANIFEST.md",
    "bootstrap/REFERENCE-MANIFEST.md",
    "bootstrap/BUNDLE-MANIFEST.json",
    "bootstrap/TRACKED-PATH-CLASSIFICATION.tsv",
    "bootstrap/CLEANUP-INSTRUCTIONS.md",
    "bootstrap/DECISION-LEDGER.md",
    "bootstrap/PLAN-MODE-PROMPT.md",
  ]) {
    check(existsSync(resolve(root, path)), `required package file exists: ${path}`);
  }
}

verifyRequiredFiles();
verifyGoldenRefs();
verifyClassification();
verifyRetainedBytes();
verifyMigrations();
verifyWordLists();
verifyCapabilityContract();
verifyConfiguration();
verifyCleanLineageTree();
verifyBundleManifest();

if (failures.length) {
  process.stderr.write(
    `\nBootstrap validation failed (${failures.length}):\n${failures
      .map((item) => `- ${item}`)
      .join("\n")}\n`,
  );
  process.exit(1);
}

process.stdout.write("\nBootstrap validation passed.\n");
