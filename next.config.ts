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
