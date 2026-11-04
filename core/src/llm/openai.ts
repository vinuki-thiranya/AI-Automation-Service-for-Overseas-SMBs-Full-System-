// OpenAI: outage fallback for the conversation (Chat Completions + function tools) and FAQ embeddings.
import OpenAI from "openai";
import { costUsd } from "./pricing.ts";
import {
  ModelUnavailableError,
  type ConversationModel, type ConversationRequest, type ConversationResult, type Embedder, type ToolCallRecord, type UsageEntry,
} from "./types.ts";

function usageEntry(model: string, kind: UsageEntry["kind"], input: number, output: number): UsageEntry {
  return {
    provider: "openai", model, kind, inputTokens: input, outputTokens: output, cacheReadTokens: 0, cacheWriteTokens: 0,
    costUsd: costUsd(model, { input, output }),
  };
}

function rethrow(err: unknown): never {
  if (err instanceof OpenAI.APIConnectionError || err instanceof OpenAI.RateLimitError || err instanceof OpenAI.InternalServerError) {
    throw new ModelUnavailableError("openai", err.message);
  }
  throw err;
}

export class OpenAIConversation implements ConversationModel {
  readonly provider = "openai" as const;
  readonly model: string;
  private readonly client: OpenAI;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey, maxRetries: 1, timeout: 25_000 });
    this.model = model;
  }

  async run(req: ConversationRequest): Promise<ConversationResult> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: req.system },
      ...req.history.map((t) => ({ role: t.role, content: t.text }) as OpenAI.Chat.ChatCompletionMessageParam),
      { role: "system", content: req.context.note },
    ];
    const tools: OpenAI.Chat.ChatCompletionTool[] = req.tools.map((t) => ({
      type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema },
    }));
    const usage: UsageEntry[] = [];
    const toolCalls: ToolCallRecord[] = [];

    for (let i = 0; i < req.maxIterations; i++) {
      let res: OpenAI.Chat.ChatCompletion;
      try {
        res = await this.client.chat.completions.create({ model: this.model, messages, tools });
      } catch (err) {
        rethrow(err);
      }
      usage.push(usageEntry(this.model, "chat", res.usage?.prompt_tokens ?? 0, res.usage?.completion_tokens ?? 0));
      const choice = res.choices[0];
      if (!choice) break;
      const calls = (choice.message.tool_calls ?? []).filter(
        (c): c is OpenAI.Chat.ChatCompletionMessageFunctionToolCall => c.type === "function");
      if (calls.length === 0) {
        return {
          text: (choice.message.content ?? "").trim(), provider: "openai", model: this.model,
          stopReason: choice.finish_reason, refused: !!choice.message.refusal, toolCalls, usage,
        };
      }
      messages.push(choice.message);
      for (const call of calls) {
        let input: unknown;
        try {
          input = JSON.parse(call.function.arguments || "{}");
        } catch {
          input = null;
        }
        const outcome = input === null
          ? { content: JSON.stringify({ error: "arguments were not valid JSON" }), isError: true }
          : await req.executeTool(call.function.name, input);
        toolCalls.push({ name: call.function.name, input, output: outcome.content, isError: !!outcome.isError });
        messages.push({ role: "tool", tool_call_id: call.id, content: outcome.content });
      }
    }
    return { text: "", provider: "openai", model: this.model, stopReason: "max_iterations", refused: false, toolCalls, usage };
  }
}

export class OpenAIEmbedder implements Embedder {
  readonly model: string;
  private readonly client: OpenAI;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey, maxRetries: 2, timeout: 20_000 });
    this.model = model;
  }

  async embed(texts: string[]) {
    try {
      const res = await this.client.embeddings.create({ model: this.model, input: texts });
      return {
        vectors: res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding),
        usage: [usageEntry(this.model, "embedding", res.usage.total_tokens, 0)],
      };
    } catch (err) {
      rethrow(err);
    }
  }
}
