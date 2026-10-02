import { getNextMove } from "@/ai/recommendations/service";
import { buildAiContext } from "@/ai/context/context-builder";
import { COACH_SYSTEM_PROMPT } from "@/ai/prompts/system";
import { MemoryEngine } from "@/ai/memory/memory-engine";
import { getAIProvider, type AIMessage } from "@/ai/providers";
import { listExperiments, listRecommendations } from "@/repositories/ai";
import { getProfile } from "@/repositories/profile";
import { audit } from "@/repositories/audit";
import { logger } from "@/lib/logger";
import { deterministicAnswer, type CoachAnswer } from "./deterministic";

export interface CoachReply extends CoachAnswer {
  mode: "deterministic" | "llm";
  model?: string;
  notice?: string;
}

/**
 * Coach IA. Toujours une réponse déterministe fondée sur les données ; si un LLM est configuré,
 * il reformule/approfondit à partir du contexte résumé + de cette réponse factuelle.
 */
export async function askCoach(userId: string, question: string, history: AIMessage[] = [], now = new Date()): Promise<CoachReply> {
  const { snapshot, anomalies, nba } = await getNextMove(userId, now);
  const base = deterministicAnswer(question, snapshot, anomalies, nba.primary);
  await audit(userId, "ai.coach.asked", { metadata: { intent: base.intent } });
  const provider = getAIProvider();
  if (!provider.isConfigured()) return { ...base, mode: "deterministic", notice: "Mode déterministe (aucun fournisseur IA configuré)." };

  const [memories, recs, experiments, profile] = await Promise.all([MemoryEngine.summaryForContext(userId), listRecommendations(userId, 10), listExperiments(userId), getProfile(userId)]);
  const context = buildAiContext(snapshot, anomalies, {
    memories,
    recentRecommendations: recs.map((r) => ({ action: r.action, status: r.status, outcome: r.outcome, createdAt: r.createdAt })),
    experiments: experiments.map((e) => ({ hypothesis: e.hypothesis, status: e.status, conclusion: e.conclusion, outcome: e.outcome })),
    nextMove: nba.primary,
    profile: profile ? { activity: profile.activity, city: profile.city } : null,
  });
  try {
    const completion = await provider.complete({
      system: COACH_SYSTEM_PROMPT,
      messages: [
        ...history.slice(-6),
        { role: "user", content: `CONTEXTE NOLHAN OS (JSON) :\n${JSON.stringify(context)}\n\nANALYSE DÉTERMINISTE DU SYSTÈME (faits vérifiés) :\n${base.answer}\n\nQUESTION : ${question}` },
      ],
      maxTokens: 2000,
    });
    return { ...base, answer: completion.text, mode: "llm", model: completion.model };
  } catch (e) {
    logger.warn("ai.coach.llm_failed", { error: e as Error });
    return { ...base, mode: "deterministic", notice: "Le fournisseur IA n'a pas répondu : réponse déterministe affichée." };
  }
}
