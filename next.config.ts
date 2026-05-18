import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb"
    }
  },
  images: {
    // Replace with the resort's CDN hostname (custom domain) or the bucket's
    // r2.dev hostname once R2 is provisioned. R2_PUBLIC_HOSTNAME overrides at
    // runtime for environments where it differs from production.
    remotePatterns: [
      {
        protocol: "https",
        hostname: process.env.R2_PUBLIC_HOSTNAME ?? "*.r2.dev"
      }
    ]
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
        ]
      }
    ];
  }
};

initOpenNextCloudflareForDev();

export default nextConfig;
