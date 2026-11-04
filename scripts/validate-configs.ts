// Validates every config/clients/*.json against config/client.schema.json with the same validator core uses.
//   node scripts/validate-configs.ts
import { readdirSync } from "node:fs";
import path from "node:path";
import { ConfigError, REPO_ROOT, readClientConfigFile } from "../core/src/config/index.ts";

const dir = path.join(REPO_ROOT, "config/clients");
let failed = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith(".json") && !f.endsWith(".secrets.json")).sort()) {
  try {
    const config = readClientConfigFile(path.join(dir, file));
    if (`${config.client_id}.json` !== file) throw new ConfigError(`client_id '${config.client_id}' doesn't match the file name`, null);
    console.log(`config/clients/${file} valid`);
  } catch (err) {
    failed++;
    console.error(`config/clients/${file}: ${(err as Error).message}`);
  }
}
process.exit(failed ? 1 : 0);
