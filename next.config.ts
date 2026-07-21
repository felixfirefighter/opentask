import { createHash } from "node:crypto";

import type { NextConfig } from "next";

const development = process.env.NODE_ENV !== "production";
const generatedBuildVersion = `${String(Date.now()).padStart(13, "0")}-${createHash("sha256")
  .update(process.cwd())
  .update(process.version)
  .digest("hex")
  .slice(0, 8)}`;
const openTaskBuildVersion = generatedBuildVersion;
const developmentOutputWatchIgnores = [
  "**/test-results",
  "**/test-results/**",
  "**/playwright-report",
  "**/playwright-report/**",
  "**/artifacts",
  "**/artifacts/**",
] as const;
const developmentOutputPath = /[/\\](?:test-results|playwright-report|artifacts)(?:[/\\]|$)/u;

function extendWatchIgnores(ignored: string | readonly string[] | RegExp | undefined) {
  if (ignored instanceof RegExp) {
    return new RegExp(`(?:${ignored.source})|(?:${developmentOutputPath.source})`, ignored.flags);
  }

  const existing = Array.isArray(ignored) ? ignored : ignored ? [ignored] : [];
  return [...existing, ...developmentOutputWatchIgnores];
}

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  `connect-src 'self'${development ? " ws: http: https:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  ...(development ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
] as const;

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  devIndicators: false,
  env: {
    NEXT_PUBLIC_OPENTASK_BUILD_VERSION: openTaskBuildVersion,
  },
  generateBuildId: async () => openTaskBuildVersion,
  reactStrictMode: true,
  turbopack: {},
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }],
      },
      {
        source: "/offline.html",
        headers: [
          { key: "Cache-Control", value: "no-cache, must-revalidate" },
          { key: "X-OpenTask-Offline-Fallback", value: "content-free" },
          { key: "X-Robots-Tag", value: "noindex" },
        ],
      },
      { source: "/(.*)", headers: [...securityHeaders] },
    ];
  },
  webpack(config, { dev }) {
    if (!dev) return config;

    // Prevent browser-test evidence from invalidating the development compiler mid-run.
    config.watchOptions = {
      ...config.watchOptions,
      ignored: extendWatchIgnores(config.watchOptions?.ignored),
    };
    return config;
  },
};

export default nextConfig;
