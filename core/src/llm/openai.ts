// OpenAI: outage fallback for the conversation and FAQ embeddings.
// The conversation uses the Responses API: OpenAI's recommended path for function calling, and the only
// one that allows tools with reasoning on newer models (Chat Completions + tools needs reasoning_effort "none"
// on gpt-6-luna). Stateless: store=false, encrypted reasoning items are passed back with the tool results.
import OpenAI from "openai";
import { costUsd } from "./pricing.ts";
import {
  ModelUnavailableError,
  type ConversationModel, type ConversationRequest, type ConversationResult, type Embedder, type ToolCallRecord, type UsageEntry,
} from "./types.ts";

type Effort = "none" | "low" | "medium" | "high";

function usageEntry(model: string, kind: UsageEntry["kind"], input: number, output: number, cached = 0): UsageEntry {
  return {
    provider: "openai", model, kind, inputTokens: input - cached, outputTokens: output, cacheReadTokens: cached, cacheWriteTokens: 0,
    costUsd: costUsd(model, { input: input - cached, output, cacheRead: cached }),
  };
}

function rethrow(err: unknown): never {
  if (err instanceof OpenAI.APIConnectionError || err instanceof OpenAI.RateLimitError || err instanceof OpenAI.InternalServerError) {
    throw new ModelUnavailableError("openai", err.message);
  }
  if (err instanceof OpenAI.APIError && (err.status ?? 0) >= 500) throw new ModelUnavailableError("openai", err.message);
  throw err;
}

export class OpenAIConversation implements ConversationModel {
  readonly provider = "openai" as const;
  readonly model: string;
  private readonly client: OpenAI;
  private readonly effort: Effort;

  constructor(apiKey: string, model: string, effort: Effort = "low", fetchFn?: typeof fetch) {
    this.client = new OpenAI({ apiKey, maxRetries: 1, timeout: 25_000, ...(fetchFn ? { fetch: fetchFn } : {}) });
    this.model = model;
    this.effort = effort;
  }

  async run(req: ConversationRequest): Promise<ConversationResult> {
    const input: OpenAI.Responses.ResponseInputItem[] = [
      ...req.history.map((t): OpenAI.Responses.EasyInputMessage => ({ role: t.role, content: t.text })),
      // Operator facts for this turn, kept apart from customer text (same role as the Claude system message).
      { role: "developer", content: req.context.note },
    ];
    const tools: OpenAI.Responses.FunctionTool[] = req.tools.map((t) => ({
      type: "function", name: t.name, description: t.description, parameters: t.input_schema, strict: false,
    }));
    const usage: UsageEntry[] = [];
    const toolCalls: ToolCallRecord[] = [];

    for (let i = 0; i < req.maxIterations; i++) {
      let res: OpenAI.Responses.Response;
      try {
        res = await this.client.responses.create({
          model: this.model,
          instructions: req.system,
          input,
          tools,
          reasoning: { effort: this.effort },
          store: false,
          include: ["reasoning.encrypted_content"],
          max_output_tokens: 2048,
        });
      } catch (err) {
        rethrow(err);
      }
      usage.push(usageEntry(this.model, "chat", res.usage?.input_tokens ?? 0, res.usage?.output_tokens ?? 0, res.usage?.input_tokens_details?.cached_tokens ?? 0));

      const calls = res.output.filter((o): o is OpenAI.Responses.ResponseFunctionToolCall => o.type === "function_call");
      if (calls.length === 0) {
        const refused = res.output.some((o) => o.type === "message" && o.content.some((c) => c.type === "refusal"));
        return { text: res.output_text.trim(), provider: "openai", model: this.model, stopReason: res.status ?? "completed", refused, toolCalls, usage };
      }
      // Pass back everything the model produced (reasoning + function calls), then one output per call.
      input.push(...(res.output as OpenAI.Responses.ResponseInputItem[]));
      for (const call of calls) {
        let args: unknown;
        try {
          args = JSON.parse(call.arguments || "{}");
        } catch {
          args = null;
        }
        const outcome = args === null
          ? { content: JSON.stringify({ ok: false, error: "arguments were not valid JSON" }), isError: true }
          : await req.executeTool(call.name, args);
        toolCalls.push({ name: call.name, input: args, output: outcome.content, isError: !!outcome.isError });
        input.push({ type: "function_call_output", call_id: call.call_id, output: outcome.content });
      }
    }
    return { text: "", provider: "openai", model: this.model, stopReason: "max_iterations", refused: false, toolCalls, usage };
  }
}

export class OpenAIEmbedder implements Embedder {
  readonly model: string;
  private readonly client: OpenAI;

  constructor(apiKey: string, model: string, fetchFn?: typeof fetch) {
    this.client = new OpenAI({ apiKey, maxRetries: 2, timeout: 20_000, ...(fetchFn ? { fetch: fetchFn } : {}) });
    this.model = model;
  }

  async embed(texts: string[]) {
    try {
      const res = await this.client.embeddings.create({ model: this.model, input: texts });
      return {
        vectors: res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding),
        usage: [usageEntry(this.model, "embedding", res.usage.prompt_tokens, 0)],
      };
    } catch (err) {
      rethrow(err);
    }
  }
}
