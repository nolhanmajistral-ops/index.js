import Anthropic from "@anthropic-ai/sdk";
import { AIUnavailableError, type AIProvider } from "./types";

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

/**
 * Fournisseur Claude (SDK officiel). La clé reste côté serveur.
 * Le repli serveur (`fallbacks: "default"`) relance la requête sur un autre modèle en cas de refus de sécurité.
 */
export function createAnthropicProvider(apiKey: string | undefined, model = DEFAULT_ANTHROPIC_MODEL): AIProvider {
  const client = apiKey ? new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 }) : null;
  return {
    name: "anthropic",
    isConfigured: () => Boolean(client),
    async complete({ system, messages, maxTokens = 4000 }) {
      if (!client) throw new AIUnavailableError("ANTHROPIC_API_KEY manquante.");
      const response = await client.beta.messages.create({
        model,
        max_tokens: maxTokens,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system,
        messages,
      });
      if (response.stop_reason === "refusal") throw new AIUnavailableError("Le modèle a refusé de répondre à cette demande.");
      const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
      if (!text) throw new AIUnavailableError("Réponse vide du modèle.");
      return { text, model: response.model, provider: "anthropic" };
    },
  };
}
