import path from 'node:path';
import type { NextConfig } from 'next';
const config: NextConfig = {
  experimental: { proxyClientMaxBodySize: '16mb' },
  allowedDevOrigins: ['192.168.110.9', '192.168.1.14'],
  turbopack: { root: path.resolve(process.cwd(), '../..') },
  async rewrites() {
    const apiBase = (process.env.API_BASE_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '');
    return [{
      source: '/api/public/booking/:path*',
      destination: `${apiBase}/public/booking/:path*`,
    }];
  },
  async headers() { return [{ source: '/:path*', headers: [
    { key: 'Referrer-Policy', value: 'no-referrer' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
  ] }]; },
};
export default config;
