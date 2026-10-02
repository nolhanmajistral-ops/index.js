import type { AnalyticsDataset } from "@/domain/analytics/dataset";
import type { BusinessSnapshot } from "@/domain/analytics/snapshot";
import { RULES } from "./rules";
import type { ActionCandidate, RuleContext } from "./types";

/**
 * RecommendationEngine déterministe.
 * Priorité (cahier des charges §57) : lié à un objectif > basé sur des données réelles > réalisable > mesurable > apprenant.
 * Le score est ensuite modulé par l'apprentissage (résultats passés de chaque règle) et les refus récents.
 */
export function scoreCandidate(c: ActionCandidate, ctx: RuleContext = {}): number {
  const k = c.criteria;
  let score = (k.goalLinked ? 30 : 0) + (k.realData ? 25 : 0) + (k.feasible ? 15 : 0) + (k.measurable ? 15 : 0) + (k.learning ? 10 : 0) + c.urgency * 25;
  score *= ctx.ruleWeights?.[c.ruleCode] ?? 1;
  if (ctx.recentlySkipped?.includes(c.ruleCode)) score *= 0.5;
  return Math.round(score * 10) / 10;
}

export function generateCandidates(ds: AnalyticsDataset, snap: BusinessSnapshot, ctx: RuleContext = {}): ActionCandidate[] {
  return RULES.map((rule) => rule(ds, snap))
    .filter((c): c is ActionCandidate => c !== null)
    .map((c) => ({ ...c, priorityScore: scoreCandidate(c, ctx) }))
    .sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));
}

/** TON PROCHAIN MOVE : une seule action principale. */
export function nextBestAction(ds: AnalyticsDataset, snap: BusinessSnapshot, ctx: RuleContext = {}) {
  const candidates = generateCandidates(ds, snap, ctx);
  return { primary: candidates[0] ?? null, alternatives: candidates.slice(1, 3), candidates };
}
