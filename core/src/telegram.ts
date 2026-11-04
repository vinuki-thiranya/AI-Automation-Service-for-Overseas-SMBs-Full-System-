// Minimal Telegram Bot API client: ops alerts (agency bot) and staff escalation groups (client bot).
import { requestJson, type FetchLike } from "./util.ts";

export interface InlineButton {
  text: string;
  callback_data: string;
}

export class TelegramBot {
  private readonly token: string;
  private readonly fetchFn: FetchLike;

  constructor(token: string, fetchFn: FetchLike = fetch) {
    this.token = token;
    this.fetchFn = fetchFn;
  }

  private call<T>(method: string, body: Record<string, unknown>): Promise<T> {
    return requestJson<T>(this.fetchFn, `https://api.telegram.org/bot${this.token}/${method}`, { method: "POST", json: body });
  }

  async sendMessage(chatId: string, text: string, buttons?: InlineButton[]): Promise<number | null> {
    const res = await this.call<{ result?: { message_id: number } }>("sendMessage", {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...(buttons?.length ? { reply_markup: { inline_keyboard: [buttons] } } : {}),
    });
    return res.result?.message_id ?? null;
  }

  editMessageText(chatId: string, messageId: number, text: string): Promise<unknown> {
    return this.call("editMessageText", { chat_id: chatId, message_id: messageId, text });
  }

  answerCallbackQuery(callbackQueryId: string, text: string): Promise<unknown> {
    return this.call("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
  }

  setWebhook(url: string, secretToken: string): Promise<unknown> {
    return this.call("setWebhook", { url, secret_token: secretToken, allowed_updates: ["message", "callback_query"] });
  }
}
