import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const GOLDEN =
  "43556d99e6e59ff77135ff347da3bc9be056fedf";
export const GOLDEN_TAG =
  "amordle-pre-terminal-greenfield-golden-2026-07-26";
export const OUTPUT = "bootstrap/TRACKED-PATH-CLASSIFICATION.tsv";

const retained = new Set([
  ".node-version",
  ".npmrc",
  ".prettierrc.json",
  "supabase/migrations.sha256",
]);

const transformed = new Set([
  ".env.example",
  ".gitignore",
  ".prettierignore",
  ".vercelignore",
  "README.md",
  "planning/greenfield/AMORDLE-TERMINAL-GREENFIELD-INTAKE-2026-07-26.md",
  "supabase/config.toml",
  "vercel.json",
]);

const removed = new Set([
  "eslint.config.js",
  "index.html",
  "package.json",
  "playwright.config.ts",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "scripts/check-build.mjs",
  "scripts/generate-authoritative-word-catalog.mjs",
  "scripts/require-preview-environment.mjs",
  "scripts/require-rc-environment.mjs",
  "scripts/scan-boundaries.mjs",
  "scripts/service-check-env.mjs",
  "scripts/sync-bundled-word-lists.mjs",
  "scripts/verify-migrations.mjs",
  "scripts/verify-parity-registry.mjs",
  "scripts/verify-preview-parity.mjs",
  "tsconfig.app.json",
  "tsconfig.json",
  "tsconfig.node.json",
  "vite.config.ts",
  "vitest.browser.config.ts",
  "vitest.config.ts",
]);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const git = (...args) =>
  execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: null,
    maxBuffer: 1024 * 1024 * 1024,
  });

const isGoldenOnly = (path) =>
  path === "PRODUCT.md" ||
  path.startsWith("api/") ||
  path ===
    "planning/product/AMORDLE-LICHESS-OF-WORDLE-IMPROVEMENT-BRIEF-2026-07-26.md" ||
  path.startsWith("public/") ||
  path.startsWith("quality/") ||
  path.startsWith("src/") ||
  path.startsWith("tests/");

const classify = (path) => {
  if (retained.has(path) || path.startsWith("supabase/migrations/")) {
    return {
      classification: "retain",
      destination: path,
      rationale: "immutable baseline retained byte-for-byte",
    };
  }

  if (transformed.has(path)) {
    if (
      path ===
      "planning/greenfield/AMORDLE-TERMINAL-GREENFIELD-INTAKE-2026-07-26.md"
    ) {
      return {
        classification: "transform",
        destination:
          "bootstrap/PRODUCT-BRIEF.md;bootstrap/DECISION-LEDGER.md",
        rationale: "accepted decisions distilled; historical path retired",
      };
    }
    return {
      classification: "transform",
      destination: path,
      rationale: "safe template rewritten for clean Next.js bootstrap",
    };
  }

  if (path.startsWith("public/word-lists/bundled/")) {
    return {
      classification: "transform",
      destination: path.replace(
        "public/word-lists/bundled/",
        "bootstrap/source-data/word-lists/",
      ),
      rationale: "byte-preserved source data moved outside public web root",
    };
  }

  if (removed.has(path)) {
    return {
      classification: "remove",
      destination: `golden:${GOLDEN_TAG}:${path}`,
      rationale: "obsolete application/build machinery; recovery only",
    };
  }

  if (isGoldenOnly(path)) {
    return {
      classification: "golden-only",
      destination: `golden:${GOLDEN_TAG}:${path}`,
      rationale:
        "rejected application, test, fixture, API, visual, or governance evidence",
    };
  }

  throw new Error(`Unclassified golden path: ${path}`);
};

export function buildClassification() {
  const paths = git("ls-tree", "-r", "--name-only", GOLDEN)
    .toString("utf8")
    .trim()
    .split("\n")
    .filter(Boolean);

  const rows = paths.map((path) => {
    const source = git("show", `${GOLDEN}:${path}`);
    return {
      sourcePath: path,
      ...classify(path),
      sha256: sha256(source),
    };
  });

  const counts = Object.fromEntries(
    ["retain", "transform", "golden-only", "remove"].map((classification) => [
      classification,
      rows.filter((row) => row.classification === classification).length,
    ]),
  );

  const expected = {
    retain: 49,
    transform: 43,
    "golden-only": 189,
    remove: 22,
  };

  if (rows.length !== 303 || JSON.stringify(counts) !== JSON.stringify(expected)) {
    throw new Error(
      `Classification count mismatch: total=${rows.length} counts=${JSON.stringify(counts)}`,
    );
  }

  return rows;
}

export function renderClassification(rows) {
  const header =
    "source_path\tclassification\tdestination\tsha256\trationale";
  return `${header}\n${rows
    .map((row) =>
      [
        row.sourcePath,
        row.classification,
        row.destination,
        row.sha256,
        row.rationale,
      ].join("\t"),
    )
    .join("\n")}\n`;
}

function main() {
  const outputPath = resolve(process.cwd(), OUTPUT);
  const expected = renderClassification(buildClassification());
  if (process.argv.includes("--check")) {
    const actual = readFileSync(outputPath, "utf8");
    if (actual !== expected) {
      throw new Error(`${OUTPUT} is stale; regenerate it.`);
    }
    process.stdout.write("Classification verified: 303 paths.\n");
    return;
  }
  writeFileSync(outputPath, expected, "utf8");
  process.stdout.write(`Wrote ${OUTPUT} with 303 classified paths.\n`);
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  main();
}
