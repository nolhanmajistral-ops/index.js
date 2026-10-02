import type { Outcome } from "@prisma/client";
import type { AnalyticsDataset } from "@/domain/analytics/dataset";
import type { EvalMetric } from "@/domain/recommendations/types";
import { DAY_MS } from "@/lib/dates";
import { evalMetricValue } from "./metrics";

/**
 * LearningEngine — boucle : Observation → Recommandation → Action → Résultat → Évaluation → Mémoire → Recommandation future.
 * L'évaluation compare la métrique cible sur la fenêtre APRÈS l'action à la même durée AVANT la recommandation.
 * C'est une corrélation observée, pas une preuve de causalité : la note d'évaluation le précise.
 */
export interface EvaluationInput {
  metric: EvalMetric;
  horizonDays: number;
  createdAt: Date;
  actedAt: Date | null;
}

export interface Evaluation {
  outcome: Outcome;
  before: number | null;
  after: number | null;
  delta: number | null;
  note: string;
}

export const EFFECT_THRESHOLD = 0.05;

export function evaluate(input: EvaluationInput, ds: AnalyticsDataset): Evaluation {
  const start = input.actedAt ?? input.createdAt;
  const span = input.horizonDays * DAY_MS;
  const before = evalMetricValue(input.metric, ds, { start: new Date(input.createdAt.getTime() - span), end: input.createdAt });
  const after = evalMetricValue(input.metric, ds, { start, end: new Date(Math.min(ds.now.getTime(), start.getTime() + span)) });
  if (before === null || after === null) return { outcome: "INCONCLUSIVE", before, after, delta: null, note: "Données insuffisantes pour évaluer le résultat." };
  if (before === 0 && after === 0) return { outcome: "NEUTRAL", before, after, delta: 0, note: "Aucune variation mesurée." };
  const delta = before === 0 ? 1 : (after - before) / Math.abs(before);
  const outcome: Outcome = delta > EFFECT_THRESHOLD ? "POSITIVE" : delta < -EFFECT_THRESHOLD ? "NEGATIVE" : "NEUTRAL";
  return { outcome, before, after, delta, note: `Variation observée de ${Math.round(delta * 100)} % sur ${input.horizonDays} jours (corrélation, pas une preuve de causalité).` };
}

/** Poids appris par règle à partir des évaluations passées (borné 0.6–1.4, neutre sans historique). */
export function ruleWeightsFromHistory(history: { ruleCode: string; outcome: Outcome | null; status: string; count: number }[]): Record<string, number> {
  const agg = new Map<string, { pos: number; neg: number; skipped: number; evaluated: number }>();
  for (const h of history) {
    const a = agg.get(h.ruleCode) ?? { pos: 0, neg: 0, skipped: 0, evaluated: 0 };
    if (h.outcome === "POSITIVE") a.pos += h.count;
    if (h.outcome === "NEGATIVE") a.neg += h.count;
    if (h.outcome && h.outcome !== "INCONCLUSIVE") a.evaluated += h.count;
    if (h.status === "SKIPPED") a.skipped += h.count;
    agg.set(h.ruleCode, a);
  }
  const out: Record<string, number> = {};
  for (const [code, a] of agg) {
    const w = 1 + (0.4 * (a.pos - a.neg)) / (a.evaluated + 2) - 0.05 * Math.min(4, a.skipped);
    out[code] = Math.max(0.6, Math.min(1.4, Math.round(w * 100) / 100));
  }
  return out;
}
