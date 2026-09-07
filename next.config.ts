import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.SHOWRUNNER_BUILD_DIR || ".next",
  env: {
    MODULE_INCL: process.env.MODULE_INCL ?? ""
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "img-src 'self' data: blob: https://*.r2.cloudflarestorage.com https://*.cloudflarestorage.com https://imagedelivery.net https://cottage616-production.up.railway.app https://www.cottage616.com https://showrunner-beta-production.up.railway.app;"
          }
        ]
      }
    ];
  },
  turbopack: {
    root: process.cwd()
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb"
    }
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.r2.cloudflarestorage.com" },
      { protocol: "https", hostname: "**.cloudflarestorage.com" },
      { protocol: "https", hostname: "imagedelivery.net" }
    ]
  }
};

export default nextConfig;
