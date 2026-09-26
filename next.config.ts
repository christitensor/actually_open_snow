import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PERS-06: the push service worker must never be served stale, or a
  // fixed notification handler wouldn't reach already-installed apps.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
