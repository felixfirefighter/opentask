import type { NextConfig } from "next";

const development = process.env.NODE_ENV !== "production";
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
  reactStrictMode: true,
  async headers() {
    return [{ source: "/(.*)", headers: [...securityHeaders] }];
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
