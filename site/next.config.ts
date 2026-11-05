import { existsSync } from "node:fs";
import path from "node:path";
import createMDX from "@next/mdx";
import type { NextConfig } from "next";

// One gitignored .env.local at the repo root serves every workspace; values already set win.
const rootEnv = path.join(import.meta.dirname, "..", ".env.local");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The whole stylesheet is ~6 KB gzipped: inlining it removes the one render-blocking request
  // (Lighthouse mobile, PLAN Phase 3), at the cost of not caching it across pages.
  experimental: { inlineCss: true },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
};

// Blog posts are MDX files in src/content/blog, imported by the blog routes.
export default createMDX({})(config);
