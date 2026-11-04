// Finds the alerts group's chat ID from the bot's recent updates and writes TELEGRAM_CHAT_ID into .env.local.
//   node scripts/telegram-chat-id.ts
// Needs TELEGRAM_BOT_TOKEN in .env.local, the bot added to the group, and a message sent there since.
// The token is never printed.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../core/src/config/index.ts";
import { loadLocalEnv } from "../core/src/localenv.ts";

type Chat = { id: number; type: string; title?: string };
type Update = { message?: { chat: Chat }; my_chat_member?: { chat: Chat }; channel_post?: { chat: Chat } };

loadLocalEnv();
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("Set TELEGRAM_BOT_TOKEN in .env.local first (from @BotFather).");
  process.exit(1);
}

const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
const body = await res.json() as { ok: boolean; description?: string; result?: Update[] };
if (!body.ok) {
  console.error(`getUpdates failed: ${body.description ?? res.status}`);
  process.exit(1);
}

const groups = new Map<number, Chat>();
for (const u of body.result ?? []) {
  const chat = u.message?.chat ?? u.my_chat_member?.chat ?? u.channel_post?.chat;
  if (chat && (chat.type === "group" || chat.type === "supergroup")) groups.set(chat.id, chat);
}

if (groups.size !== 1) {
  if (groups.size === 0) console.error("No group found in the bot's recent updates. Add the bot to the group, send /start in the group, then re-run.");
  else console.error(`The bot is in ${groups.size} groups; set TELEGRAM_CHAT_ID by hand:\n${[...groups.values()].map((g) => `  ${g.id}  ${g.title ?? ""}`).join("\n")}`);
  process.exit(1);
}

const [group] = groups.values();
const file = path.join(REPO_ROOT, ".env.local");
const current = existsSync(file) ? readFileSync(file, "utf8") : "";
const line = `TELEGRAM_CHAT_ID=${group!.id}`;
writeFileSync(file, /^TELEGRAM_CHAT_ID=.*$/m.test(current) ? current.replace(/^TELEGRAM_CHAT_ID=.*$/m, line) : `${current.trimEnd()}\n${line}\n`);
console.log(`Saved TELEGRAM_CHAT_ID=${group!.id} ("${group!.title ?? ""}") to .env.local.`);
