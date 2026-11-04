// OpenAI fallback over the Responses API, through the SDK with a fake fetch (no network).
import { describe, expect, it } from "vitest";
import { OpenAIConversation } from "../src/llm/openai.ts";
import { ModelUnavailableError, type ConversationRequest, type TurnContext } from "../src/llm/types.ts";
import { fakeFetch } from "./fixtures.ts";

const usage = { input_tokens: 1000, output_tokens: 50, total_tokens: 1050, input_tokens_details: { cached_tokens: 400 }, output_tokens_details: { reasoning_tokens: 10 } };
const response = (output: unknown[]) => ({ id: "resp_1", object: "response", created_at: 0, status: "completed", model: "gpt-6-luna", output, usage });
const functionCall = (name: string, args: unknown, n = 1) => ({ type: "function_call", id: `fc_${n}`, call_id: `call_${n}`, name, arguments: JSON.stringify(args), status: "completed" });
const reasoning = { type: "reasoning", id: "rs_1", summary: [], encrypted_content: "opaque" };
const message = (text: string) => ({ type: "message", id: "msg_1", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] });

function request(executed: { name: string; input: unknown }[]): ConversationRequest {
  return {
    system: "You are the front desk.",
    history: [{ role: "user", text: "Can I book a check-up?" }],
    context: { note: "Local time: Tue 11am. OPEN." } as TurnContext,
    tools: [{ name: "check_availability", description: "Find times", input_schema: { type: "object", properties: { service_id: { type: "string" } }, required: ["service_id"] } }],
    executeTool: async (name, input) => {
      executed.push({ name, input });
      return { content: JSON.stringify({ ok: true, slots: [{ slot_id: "s1", label: "Tue 1pm" }] }) };
    },
    maxIterations: 6,
  };
}

describe("OpenAIConversation (Responses API)", () => {
  it("runs the tool loop statelessly and returns the final text", async () => {
    let n = 0;
    const { fn, calls } = fakeFetch([{
      method: "POST", match: /\/v1\/responses$/,
      body: () => (++n === 1 ? response([reasoning, functionCall("check_availability", { service_id: "check-up-clean" })]) : response([message("Tue 1pm is free. Shall I book it?")])),
    }]);
    const executed: { name: string; input: unknown }[] = [];
    const res = await new OpenAIConversation("sk-test", "gpt-6-luna", "low", fn).run(request(executed));

    expect(res.text).toBe("Tue 1pm is free. Shall I book it?");
    expect(executed).toEqual([{ name: "check_availability", input: { service_id: "check-up-clean" } }]);
    const first = calls[0]!.body as Record<string, unknown>;
    expect(first).toMatchObject({
      model: "gpt-6-luna", instructions: "You are the front desk.", store: false, include: ["reasoning.encrypted_content"], reasoning: { effort: "low" },
      tools: [{ type: "function", name: "check_availability", strict: false }],
    });
    expect((first.input as unknown[]).at(-1)).toEqual({ role: "developer", content: "Local time: Tue 11am. OPEN." });
    // Second call carries the reasoning item, the function call and its output.
    const second = (calls[1]!.body as { input: { type?: string; call_id?: string }[] }).input;
    expect(second.map((i) => i.type).slice(-3)).toEqual(["reasoning", "function_call", "function_call_output"]);
    expect(second.at(-1)).toMatchObject({ type: "function_call_output", call_id: "call_1" });
    // Usage splits cached input out so it's billed at the cached rate.
    expect(res.usage[0]).toMatchObject({ inputTokens: 600, cacheReadTokens: 400, outputTokens: 50 });
    expect(res.usage[0]!.costUsd).toBeCloseTo((600 * 0.1 + 400 * 0.01 + 50 * 0.5) / 1e6, 10);
  });

  it("stops at the iteration cap", async () => {
    let n = 0;
    const { fn } = fakeFetch([{ method: "POST", match: /\/v1\/responses$/, body: () => response([functionCall("check_availability", { service_id: "x" }, ++n)]) }]);
    const executed: { name: string; input: unknown }[] = [];
    const res = await new OpenAIConversation("sk-test", "gpt-6-luna", "low", fn).run({ ...request(executed), maxIterations: 3 });
    expect(res.stopReason).toBe("max_iterations");
    expect(executed).toHaveLength(3);
  });

  it("returns invalid JSON arguments to the model as a tool error", async () => {
    let n = 0;
    const bad = { ...functionCall("check_availability", {}), arguments: "{not json" };
    const { fn, calls } = fakeFetch([{ method: "POST", match: /\/v1\/responses$/, body: () => (++n === 1 ? response([bad]) : response([message("Sorry")])) }]);
    const executed: { name: string; input: unknown }[] = [];
    const res = await new OpenAIConversation("sk-test", "gpt-6-luna", "low", fn).run(request(executed));
    expect(executed).toEqual([]);
    expect(res.toolCalls[0]).toMatchObject({ isError: true });
    expect(JSON.stringify((calls[1]!.body as { input: unknown[] }).input.at(-1))).toContain("not valid JSON");
  });

  it("maps provider outages to ModelUnavailableError so the engine moves on", async () => {
    const { fn } = fakeFetch([{ method: "POST", match: /\/v1\/responses$/, status: 503, body: { error: { message: "overloaded" } } }]);
    await expect(new OpenAIConversation("sk-test", "gpt-6-luna", "low", fn).run(request([]))).rejects.toBeInstanceOf(ModelUnavailableError);
  });
});
