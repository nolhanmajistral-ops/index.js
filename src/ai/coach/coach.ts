import { getNextMove } from "@/ai/recommendations/service";
import { buildAiContext } from "@/ai/context/context-builder";
import { COACH_SYSTEM_PROMPT } from "@/ai/prompts/system";
import { MemoryEngine } from "@/ai/memory/memory-engine";
import { getAIProvider, type AIMessage, type AISource, type AIStreamHandlers } from "@/ai/providers";
import { cleanText } from "@/ai/style/humanize";
import { listExperiments, listRecommendations } from "@/repositories/ai";
import { getProfile } from "@/repositories/profile";
import { audit } from "@/repositories/audit";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { formatDateFr } from "@/lib/dates";
import { deterministicAnswer, type CoachAnswer } from "./deterministic";

export interface CoachReply extends CoachAnswer {
  mode: "deterministic" | "llm";
  model?: string;
  notice?: string;
  sources?: AISource[];
}

/**
 * Coach IA. Toujours une analyse déterministe fondée sur les données ; si un LLM est configuré,
 * il répond en expert barber à partir du contexte résumé (+ recherche web pour les tendances).
 * Les noms, emails et téléphones des clients ne sont jamais envoyés au modèle.
 */
export async function askCoach(userId: string, question: string, history: AIMessage[] = [], now = new Date(), handlers: AIStreamHandlers = {}): Promise<CoachReply> {
  const { snapshot, anomalies, nba } = await getNextMove(userId, now);
  const base = deterministicAnswer(question, snapshot, anomalies, nba.primary);
  await audit(userId, "ai.coach.asked", { metadata: { intent: base.intent } });
  const provider = getAIProvider();
  if (!provider.isConfigured()) return { ...base, mode: "deterministic", notice: "Mode sans IA : ajoute ta clé Anthropic pour des réponses d'expert." };

  const [memories, recs, experiments, profile] = await Promise.all([MemoryEngine.summaryForContext(userId), listRecommendations(userId, 10), listExperiments(userId), getProfile(userId)]);
  const context = buildAiContext(snapshot, anomalies, {
    memories,
    recentRecommendations: recs.map((r) => ({ action: r.action, status: r.status, outcome: r.outcome, createdAt: r.createdAt })),
    experiments: experiments.map((e) => ({ hypothesis: e.hypothesis, status: e.status, conclusion: e.conclusion, outcome: e.outcome })),
    nextMove: nba.primary,
    profile: profile ? { activity: profile.activity, city: profile.city } : null,
  });
  const request = {
    system: COACH_SYSTEM_PROMPT,
    messages: [
      ...history.slice(-8),
      {
        role: "user" as const,
        content: `<donnees_nolhan_os date="${formatDateFr(now)}">\n${JSON.stringify(context)}\n</donnees_nolhan_os>\n\n<pistes_du_systeme>\n${base.answer}\n</pistes_du_systeme>\n\nQuestion de Nolhan : ${question}`,
      },
    ],
    maxTokens: 16000,
    webSearch: getEnv().AI_WEB_SEARCH,
  };
  try {
    const completion = provider.stream ? await provider.stream(request, handlers) : await provider.complete(request);
    return { ...base, answer: cleanText(completion.text), mode: "llm", model: completion.model, sources: completion.sources };
  } catch (e) {
    logger.warn("ai.coach.llm_failed", { error: e as Error });
    return { ...base, mode: "deterministic", notice: "Le fournisseur IA n'a pas répondu : réponse sans IA affichée." };
  }
}
