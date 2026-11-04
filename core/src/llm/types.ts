import type { FaqMatch, OfferedSlot } from "../store/types.ts";

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

export interface ToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown> & { type: "object" };
}

export interface ToolOutcome {
  content: string;           // JSON string returned to the model
  isError?: boolean;
}

/** Structured facts for the turn. Real models read `note`; the mock model reads the fields. */
export interface TurnContext {
  note: string;
  localTime: string;
  afterHours: boolean;
  emergency: boolean;
  contactName: string | null;
  isNewContact: boolean;
  services: { id: string; name: string; price: string | null }[];
  hoursSummary: string;
  address: string;
  parking: string | null;
  faq: FaqMatch[];
  offeredSlots: OfferedSlot[];
  upcomingBookings: { booking_id: string; label: string; service_id: string | null }[];
  documents: { id: string; name: string }[];
  bookingMode: "direct" | "link";
}

export interface ToolCallRecord {
  name: string;
  input: unknown;
  output: string;
  isError: boolean;
}

export interface UsageEntry {
  provider: "anthropic" | "openai" | "mock";
  model: string;
  kind: "chat" | "classifier" | "embedding";
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
}

export interface ConversationRequest {
  system: string;
  history: ChatTurn[];        // ends with the current customer message
  context: TurnContext;
  tools: ToolSpec[];
  executeTool: (name: string, input: unknown) => Promise<ToolOutcome>;
  maxIterations: number;
}

export interface ConversationResult {
  text: string;
  provider: UsageEntry["provider"];
  model: string;
  stopReason: string;
  refused: boolean;
  toolCalls: ToolCallRecord[];
  usage: UsageEntry[];
}

export interface ConversationModel {
  readonly provider: UsageEntry["provider"];
  readonly model: string;
  run(req: ConversationRequest): Promise<ConversationResult>;
}

export type GuardrailCategory = "ok" | "prompt_injection" | "abuse" | "out_of_scope" | "emergency" | "wants_human";

export interface GuardrailVerdict {
  category: GuardrailCategory;
  confidence: number;          // 0..1
  language: string;            // ISO 639-1
  reason: string;
}

export interface Classifier {
  guardrail(input: { text: string; recent: ChatTurn[]; business: string }): Promise<{ verdict: GuardrailVerdict; usage: UsageEntry[] }>;
  mapChoice(input: { question: string; options: string[]; reply: string }): Promise<{ option: string | null; usage: UsageEntry[] }>;
  judgeLead(input: { business: string; answers: Record<string, string>; transcript: string }): Promise<{ score: number; usage: UsageEntry[] }>;
  summarize(input: { previousSummary: string | null; turns: ChatTurn[] }): Promise<{ summary: string; usage: UsageEntry[] }>;
}

export interface Embedder {
  readonly model: string;
  embed(texts: string[]): Promise<{ vectors: number[][]; usage: UsageEntry[] }>;
}

export interface ModelSet {
  primary: ConversationModel;
  fallback: ConversationModel | null;
  classifier: Classifier;
  embedder: Embedder | null;
}

/** Thrown when a provider is unreachable or overloaded, so the engine tries the next model. */
export class ModelUnavailableError extends Error {
  readonly provider: string;
  constructor(provider: string, message: string) {
    super(message);
    this.provider = provider;
  }
}
