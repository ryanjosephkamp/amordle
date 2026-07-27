import { createHash } from "node:crypto";
import {
  lstatSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const OUTPUT = "bootstrap/BUNDLE-MANIFEST.json";
const excludedDirectories = new Set([
  ".git",
  ".codex-internal",
  ".next",
  ".pnpm-store",
  ".tooling",
  ".turbo",
  ".vercel",
  "blob-report",
  "coverage",
  "dist",
  "dist-ssr",
  "node_modules",
  "out",
  "playwright-report",
  "test-results",
]);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function listBundleFiles(root = process.cwd()) {
  const files = [];
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      if (excludedDirectories.has(name)) continue;
      const absolute = join(directory, name);
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        throw new Error(`Symlinks are forbidden in bootstrap bundle: ${absolute}`);
      }
      if (stat.isDirectory()) {
        visit(absolute);
        continue;
      }
      if (!stat.isFile()) continue;
      const path = relative(root, absolute).replaceAll("\\", "/");
      if (path === OUTPUT) continue;
      if (
        (name.startsWith(".env") && name !== ".env.example") ||
        name === ".DS_Store" ||
        name.endsWith(".local") ||
        name.endsWith(".log")
      ) {
        continue;
      }
      files.push(path);
    }
  };
  visit(root);
  return files.sort();
}

export function buildBundleManifest(root = process.cwd()) {
  const files = listBundleFiles(root).map((path) => {
    const content = readFileSync(resolve(root, path));
    return {
      path,
      bytes: content.byteLength,
      sha256: sha256(content),
    };
  });

  return {
    schemaVersion: 1,
    package: "amordle-terminal-greenfield-bootstrap",
    preparedDate: "2026-07-26",
    lineage: {
      branch: "codex/terminal-greenfield-bootstrap-2026-07-26",
      history: "orphan",
    },
    recovery: {
      branch: "codex/pre-terminal-greenfield-golden-2026-07-26",
      tag: "amordle-pre-terminal-greenfield-golden-2026-07-26",
      commit: "43556d99e6e59ff77135ff347da3bc9be056fedf",
      trackedPaths: 303,
    },
    shell: {
      repository: "https://github.com/ryanjosephkamp/brrrdle-dev",
      tag: "phase-58-final-functional-shell-golden-2026-07-13",
      commit: "062624b2fb7c8d039a2eba3aec5b059c26628a11",
      role: "read-only behavioral authority",
    },
    services: {
      githubRepository: "ryanjosephkamp/amordle",
      supabaseProjectRef: "squqdstdvbsvhagfuzgj",
      vercelProjectId: "prj_8DsbwXWKUtUz7dQl9xoPCgFUuxzH",
      productionDeployment: "dpl_739mtwiXc9pZPef3pxsKumwC9DfG",
    },
    migrations: {
      count: 45,
      checksumLedger: "supabase/migrations.sha256",
    },
    classification: {
      sourcePaths: 303,
      retain: 49,
      transform: 43,
      goldenOnly: 189,
      remove: 22,
    },
    files,
  };
}

export function renderBundleManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function main() {
  const outputPath = resolve(process.cwd(), OUTPUT);
  const expected = renderBundleManifest(buildBundleManifest());
  if (process.argv.includes("--check")) {
    const actual = readFileSync(outputPath, "utf8");
    if (actual !== expected) {
      throw new Error(`${OUTPUT} is stale; regenerate it.`);
    }
    process.stdout.write("Bundle manifest verified.\n");
    return;
  }
  writeFileSync(outputPath, expected, "utf8");
  process.stdout.write(`Wrote ${OUTPUT}.\n`);
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  main();
}
