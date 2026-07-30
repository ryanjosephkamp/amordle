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
    '/api/admin-refresh': ['./data/word-lists/**/*'],
    '/api/cron/refresh-word-lists': ['./data/word-lists/**/*'],
  },
};

export default nextConfig;
