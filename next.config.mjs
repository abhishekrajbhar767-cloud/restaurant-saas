/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Capacitor tutorials often set `output: 'export'` so the WebView can load
  // a static `out/` folder. That mode cannot run this app: Server Actions,
  // middleware session refresh, and requireRole() all need the Node server.
  // The Android shell loads NEXT_PUBLIC_SITE_URL via capacitor.config.ts
  // (`server.url`) instead. Do not uncomment the next line.
  // output: 'export',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
    ],
  },
  async redirects() {
    return [
      { source: '/admin/super', destination: '/super-admin', permanent: false },
      { source: '/admin/super/:path*', destination: '/super-admin/:path*', permanent: false },
    ];
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverComponentsExternalPackages: ['firebase-admin'],
  },
};

export default nextConfig;
