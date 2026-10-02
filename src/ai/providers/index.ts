import { getEnv } from "@/lib/env";
import { createAnthropicProvider, DEFAULT_ANTHROPIC_MODEL } from "./anthropic";
import { noneProvider } from "./none";
import type { AIProvider } from "./types";

export * from "./types";

let override: AIProvider | null = null;
/** Tests uniquement : injecter un fournisseur factice. */
export function setAIProviderForTests(p: AIProvider | null) {
  override = p;
}

export function getAIProvider(): AIProvider {
  if (override) return override;
  const env = getEnv();
  if (env.AI_PROVIDER === "anthropic") return createAnthropicProvider(env.ANTHROPIC_API_KEY, env.AI_MODEL ?? DEFAULT_ANTHROPIC_MODEL);
  return noneProvider;
}

export function aiStatus() {
  const p = getAIProvider();
  return { provider: p.name, configured: p.isConfigured() };
}
