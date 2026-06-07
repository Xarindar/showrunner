import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
      { protocol: "https", hostname: "**.cloudflarestorage.com" }
    ]
  }
};

export default nextConfig;
