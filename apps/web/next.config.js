/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@family-app/domain', '@family-app/types', '@family-app/ui', '@family-app/validation'],
  // Baseline security headers for a public deploy. This app handles children's
  // and health data (see SECURITY.md / PRIVACY.md), so these are a floor, not
  // a substitute for the server-side authorization rules enforced by RLS +
  // the Policy Engine — headers only harden the browser/transport layer.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
