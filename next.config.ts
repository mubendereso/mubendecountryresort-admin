import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import { buildAdminContentSecurityPolicy } from "./lib/security/csp";

const contentSecurityPolicy = buildAdminContentSecurityPolicy({
  isDevelopment: process.env.NODE_ENV === "development",
  r2PublicHostname: process.env.R2_PUBLIC_HOSTNAME
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // OpenNext normally injects this when it runs `next build` itself, but we
  // build with `next build --webpack` + `--skipNextBuild` (Next 16.2 defaults
  // builds to Turbopack, which OpenNext can't package), so set it explicitly.
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb"
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
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // MCR-SEC-03. HSTS: 2 years + subdomains. `preload` is intentionally
          // omitted until the resort moves off *.workers.dev to a custom domain.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains"
          },
          {
            key: "Content-Security-Policy",
            value: contentSecurityPolicy
          }
        ]
      }
    ];
  }
};

initOpenNextCloudflareForDev();

export default nextConfig;
