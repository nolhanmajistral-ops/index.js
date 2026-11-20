import Anthropic from "@anthropic-ai/sdk";
import { AIUnavailableError, type AICompletion, type AIProvider, type AIRequest, type AISource, type AIStreamHandlers } from "./types";

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

type BetaMessage = Anthropic.Beta.Messages.BetaMessage;
type BetaMessageParam = Anthropic.Beta.Messages.BetaMessageParam;

/** Recherche web côté Anthropic, localisée à Lausanne (tendances locales, concurrents, prix). */
const WEB_SEARCH_TOOL = {
  type: "web_search_20260209" as const,
  name: "web_search" as const,
  max_uses: 3,
  user_location: { type: "approximate" as const, city: "Lausanne", country: "CH", timezone: "Europe/Zurich" },
};

/** Nombre max de reprises quand le serveur met la réponse en pause (boucle de recherche longue). */
const MAX_PAUSE_RESUMES = 3;

function collectSources(message: BetaMessage, into: Map<string, AISource>) {
  for (const block of message.content) {
    // Pages citées dans la réponse : les plus pertinentes.
    if (block.type === "text" && block.citations) {
      for (const c of block.citations) {
        if (c.type === "web_search_result_location" && c.url) into.set(c.url, { title: c.title ?? c.url, url: c.url });
      }
    }
  }
  if (into.size === 0) {
    // Sinon : premiers résultats de recherche effectivement consultés.
    for (const block of message.content) {
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content.slice(0, 3)) into.set(r.url, { title: r.title || r.url, url: r.url });
      }
    }
  }
}

/**
 * Fournisseur Claude (SDK officiel). La clé reste côté serveur.
 * - Réponse en flux (affichage progressif) ; la recherche web est un outil serveur Anthropic.
 * - Repli serveur (`fallbacks: "default"`) : en cas de refus de sécurité, la requête est relancée sur un autre modèle.
 * - Si la recherche web est refusée par le compte (désactivée dans la Console), on réessaie sans elle.
 */
export function createAnthropicProvider(apiKey: string | undefined, model = DEFAULT_ANTHROPIC_MODEL): AIProvider {
  const client = apiKey ? new Anthropic({ apiKey, timeout: 120_000, maxRetries: 2 }) : null;

  async function run(input: AIRequest, handlers: AIStreamHandlers, allowSearch: boolean): Promise<AICompletion> {
    if (!client) throw new AIUnavailableError("ANTHROPIC_API_KEY manquante.");
    const messages: BetaMessageParam[] = input.messages.map((m) => ({ role: m.role, content: m.content }));
    const sources = new Map<string, AISource>();
    let text = "";
    let servedBy = model;

    for (let attempt = 0; attempt <= MAX_PAUSE_RESUMES; attempt++) {
      const stream = client.beta.messages.stream({
        model,
        max_tokens: input.maxTokens ?? 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        // Prompt système stable → mis en cache (moins cher à chaque question).
        system: [{ type: "text", text: input.system, cache_control: { type: "ephemeral" } }],
        messages,
        ...(allowSearch ? { tools: [WEB_SEARCH_TOOL] } : {}),
      });
      stream.on("text", (delta) => {
        text += delta;
        handlers.onText?.(delta);
      });
      stream.on("streamEvent", (event) => {
        if (event.type === "content_block_start" && event.content_block.type === "server_tool_use") handlers.onStatus?.("Recherche web en cours…");
      });
      const message = await stream.finalMessage();
      servedBy = message.model;
      collectSources(message, sources);
      if (message.stop_reason === "refusal") throw new AIUnavailableError("Le modèle a refusé de répondre à cette demande.");
      if (message.stop_reason !== "pause_turn") break;
      // Le serveur a mis la recherche en pause : on renvoie son travail tel quel pour qu'il continue.
      messages.push({ role: "assistant", content: message.content as BetaMessageParam["content"] });
    }

    if (!text.trim()) throw new AIUnavailableError("Réponse vide du modèle.");
    return { text: text.trim(), model: servedBy, provider: "anthropic", sources: [...sources.values()].slice(0, 5) };
  }

  async function runWithSearchFallback(input: AIRequest, handlers: AIStreamHandlers): Promise<AICompletion> {
    let emitted = false;
    const tracked: AIStreamHandlers = {
      onStatus: handlers.onStatus,
      onText: (d) => {
        emitted = true;
        handlers.onText?.(d);
      },
    };
    try {
      return await run(input, tracked, Boolean(input.webSearch));
    } catch (e) {
      if (input.webSearch && !emitted && e instanceof Anthropic.BadRequestError) return run(input, handlers, false);
      throw e;
    }
  }

  return {
    name: "anthropic",
    isConfigured: () => Boolean(client),
    complete: (input) => runWithSearchFallback(input, {}),
    stream: (input, handlers) => runWithSearchFallback(input, handlers),
  };
}
