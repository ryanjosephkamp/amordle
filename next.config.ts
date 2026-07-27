import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  distDir: 'dist',
  poweredByHeader: false,
  reactStrictMode: true,
  typedRoutes: true,
  experimental: {
    typedEnv: true,
  },
};

export default nextConfig;
