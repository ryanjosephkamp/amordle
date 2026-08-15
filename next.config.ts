import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NextConfig } from 'next';

function validPublicUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? value : undefined;
  } catch {
    return undefined;
  }
}

function validPublicKey(value: string | undefined): string | undefined {
  return value && value.length >= 20 ? value : undefined;
}

/*
 * B3. The service worker's cache key was the literal `amordle-shell-v1`, and because
 * sw.js itself never changed bytes the browser never re-installed it — so the activate
 * handler that purges old caches has never run, and a device could stay pinned to a
 * precached HTML document (and the hashed CSS it points at) indefinitely. Stamping the
 * build into the registration URL makes every deploy install a new worker and purge the
 * previous cache. It also gives every screenshot a build to identify itself by.
 */
function readGitHeadSha(): string | undefined {
  try {
    const head = readFileSync(resolve(process.cwd(), '.git/HEAD'), 'utf8').trim();
    if (!head.startsWith('ref: ')) return head.slice(0, 12);
    const ref = readFileSync(resolve(process.cwd(), '.git', head.slice(5)), 'utf8').trim();
    return ref.slice(0, 12);
  } catch {
    return undefined;
  }
}

/*
 * `??` is wrong for these: `vercel build` *sets* VERCEL_GIT_COMMIT_SHA to an empty
 * string rather than leaving it unset, and an empty string is not nullish, so it
 * propagated all the way to the registration URL as `?v=` and every deploy shared one
 * cache key. Locally the variable is absent, so the bug only appeared once deployed —
 * the hosted fixture test is what caught it.
 */
function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

const buildId =
  firstNonEmpty(
    process.env.VERCEL_GIT_COMMIT_SHA?.trim().slice(0, 12),
    process.env.VERCEL_DEPLOYMENT_ID,
    readGitHeadSha(),
  ) ?? 'dev';

const publicSupabaseUrl =
  validPublicUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) ?? validPublicUrl(process.env.SUPABASE_URL);
const publicSupabaseAnonKey =
  validPublicKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ??
  validPublicKey(process.env.SUPABASE_ANON_KEY);

/*
 * A deployment without this configuration is a site nobody can sign in to.
 *
 * These two values are the ONLY way the browser reaches Supabase — `getBrowserSupabase`
 * reads nothing else, and Next inlines only `NEXT_PUBLIC_*` into the client bundle. When
 * they are absent the app still builds, still deploys, still renders every page, and every
 * account is simply unreachable. That is exactly what shipped to production: a local
 * `vercel build --prod` that had not pulled the production environment produced a bundle
 * with no Supabase config in it, and nothing anywhere said so.
 *
 * Local builds legitimately run without them — the fixture suite mocks the service — so the
 * check is scoped to a real deployment build, which is the only place it can do harm.
 */
if (process.env.VERCEL && (!publicSupabaseUrl || !publicSupabaseAnonKey)) {
  throw new Error(
    'Refusing to build a deployment without Supabase browser configuration: ' +
      `url=${publicSupabaseUrl ? 'present' : 'MISSING'}, ` +
      `anonKey=${publicSupabaseAnonKey ? 'present' : 'MISSING'}. ` +
      'Run `vercel pull --environment=<target>` before `vercel build`, or set ' +
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY for the target environment.',
  );
}

const nextConfig: NextConfig = {
  // Vercel's Next.js builder requires the conventional directory when it
  // packages functions. Keep the isolated local build output used by the
  // repository's verification scripts everywhere else.
  distDir: process.env.VERCEL ? '.next' : 'dist',
  poweredByHeader: false,
  reactStrictMode: true,
  typedRoutes: true,
  experimental: {
    typedEnv: true,
  },
  env: {
    ...(publicSupabaseUrl ? { NEXT_PUBLIC_SUPABASE_URL: publicSupabaseUrl } : {}),
    ...(publicSupabaseAnonKey ? { NEXT_PUBLIC_SUPABASE_ANON_KEY: publicSupabaseAnonKey } : {}),
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
  outputFileTracingIncludes: {
    '/api/admin-refresh': ['./data/word-lists/manifest.json'],
    '/api/cron/refresh-word-lists': ['./data/word-lists/manifest.json'],
    '/api/word-lists/manifest': ['./data/word-lists/manifest.json'],
    '/play/solo/daily/**': ['./data/word-lists/**/*'],
    '/play/solo/practice/**': ['./data/word-lists/**/*'],
    '/words': ['./data/word-lists/**/*'],
  },
  async headers() {
    return [
      {
        // Browsers already bypass the HTTP cache for worker scripts; be explicit so a
        // proxy cannot pin the registration to a stale build stamp.
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache' }],
      },
      {
        source: '/word-lists/:revision/:asset',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
