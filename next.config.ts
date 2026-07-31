import type { NextConfig } from 'next';

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
