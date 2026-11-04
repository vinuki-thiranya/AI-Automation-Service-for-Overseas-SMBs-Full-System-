// Builds the per-client model set from client.json + that client's own API keys.
import type { Client } from "../config/index.ts";
import type { SecretResolver } from "../secrets.ts";
import { AnthropicClassifier, AnthropicConversation } from "./anthropic.ts";
import { MockClassifier, MockConversation, MockEmbedder } from "./mock.ts";
import { OpenAIConversation, OpenAIEmbedder } from "./openai.ts";
import type { ModelSet } from "./types.ts";

export interface ModelFactory {
  forClient(client: Client): Promise<ModelSet>;
}

export class LiveModelFactory implements ModelFactory {
  private readonly secrets: SecretResolver;
  private readonly cache = new Map<string, { set: ModelSet; keyFingerprint: string }>();

  constructor(secrets: SecretResolver) {
    this.secrets = secrets;
  }

  async forClient(client: Client): Promise<ModelSet> {
    const llm = client.config.assistant.llm;
    const refs = [llm.primary, llm.classifier, llm.fallback, llm.embeddings].filter((m) => m !== undefined);
    const keys = new Map<string, string>();
    for (const m of refs) keys.set(m.credential, await this.secrets.get(m.credential));
    const fingerprint = JSON.stringify([...keys.values()].map((k) => k.slice(-6))) + JSON.stringify(llm);
    const hit = this.cache.get(client.slug);
    if (hit && hit.keyFingerprint === fingerprint) return hit.set;

    const conversation = (m: typeof llm.primary) => m.provider === "anthropic"
      ? new AnthropicConversation(keys.get(m.credential)!, m.model, m.effort ?? "low")
      : new OpenAIConversation(keys.get(m.credential)!, m.model, m.effort ?? "low");
    if (llm.classifier.provider !== "anthropic") throw new Error("classifier must be an anthropic model");

    const set: ModelSet = {
      primary: conversation(llm.primary),
      fallback: llm.fallback ? conversation(llm.fallback) : null,
      classifier: new AnthropicClassifier(keys.get(llm.classifier.credential)!, llm.classifier.model),
      embedder: llm.embeddings.provider === "openai" ? new OpenAIEmbedder(keys.get(llm.embeddings.credential)!, llm.embeddings.model) : null,
    };
    this.cache.set(client.slug, { set, keyFingerprint: fingerprint });
    return set;
  }
}

export class MockModelFactory implements ModelFactory {
  readonly set: ModelSet = {
    primary: new MockConversation(),
    fallback: null,
    classifier: new MockClassifier(),
    embedder: new MockEmbedder(),
  };
  async forClient(): Promise<ModelSet> {
    return this.set;
  }
}
