// Loads gitignored env files for local tools (QA, integration checks, provisioning). Never used by the server,
// which gets its environment from compose. Values already in the environment win.
import { existsSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./config/index.ts";

export function loadLocalEnv(files: string[] = [".env.local"]): string[] {
  const loaded: string[] = [];
  for (const f of files) {
    const p = path.join(REPO_ROOT, f);
    if (!existsSync(p)) continue;
    process.loadEnvFile(p);
    loaded.push(f);
  }
  return loaded;
}

/** "…3f9a" — enough to tell keys apart without exposing them. */
export function mask(value: string | undefined): string {
  return value ? `…${value.slice(-4)}` : "(unset)";
}
