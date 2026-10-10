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
    // One 25 MiB gallery original plus bounded multipart/action overhead.
    proxyClientMaxBodySize: "26mb",
    serverActions: {
      bodySizeLimit: "26mb"
    }
  },
  images: {
    // The optimizer ignores upstream private/no-store and keeps a public cache.
    // Authenticated media must only use direct, unoptimized delivery routes.
    localPatterns: [
      { pathname: "/hero.svg", search: "" },
      { pathname: "/_next/static/media/**", search: "" }
    ],
    maximumRedirects: 0,
    remotePatterns: [
      { protocol: "https", hostname: "**.r2.cloudflarestorage.com", search: "" },
      { protocol: "https", hostname: "**.cloudflarestorage.com", search: "" },
      { protocol: "https", hostname: "imagedelivery.net", search: "" }
    ]
  }
};

export default nextConfig;
