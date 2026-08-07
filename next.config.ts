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

const buildId =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ??
  process.env.VERCEL_DEPLOYMENT_ID ??
  readGitHeadSha() ??
  'dev';

const publicSupabaseUrl =
  validPublicUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) ?? validPublicUrl(process.env.SUPABASE_URL);
const publicSupabaseAnonKey =
  validPublicKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ??
  validPublicKey(process.env.SUPABASE_ANON_KEY);

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
