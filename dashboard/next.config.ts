import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// One gitignored .env.local at the repo root serves every workspace; values already set win.
const rootEnv = path.join(import.meta.dirname, "..", ".env.local");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default config;
