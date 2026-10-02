import type { MissionStatus } from "@prisma/client";
import { getAnalytics } from "@/domain/analytics/service";
import { nextBestAction } from "@/domain/recommendations/engine";
import type { ActionCandidate, RuleContext } from "@/domain/recommendations/types";
import { missionsFromCandidates, recentlySkippedCodes } from "@/domain/missions/generator";
import type { AnalyticsDataset } from "@/domain/analytics/dataset";
import { createRecommendation, latestRecommendation, recommendationsDueForEvaluation, ruleOutcomeStats, saveRecommendationEvaluation, setRecommendationStatus, getRecommendation, upsertInsight } from "@/repositories/ai";
import { createMissions, listMissionsForDate, updateMissionStatus } from "@/repositories/missions";
import { loadDataset } from "@/repositories/analytics";
import { audit } from "@/repositories/audit";
import { DAY_MS, localDateKey } from "@/lib/dates";
import { evaluate, ruleWeightsFromHistory } from "@/ai/learning/learning-engine";
import { evalMetricValue } from "@/ai/learning/metrics";
import { MemoryEngine } from "@/ai/memory/memory-engine";
import type { EvalMetric } from "@/domain/recommendations/types";

export function missionDate(now: Date, tz = "Europe/Zurich"): Date {
  return new Date(`${localDateKey(now, tz)}T00:00:00.000Z`);
}

export async function ruleContext(userId: string, ds: AnalyticsDataset): Promise<RuleContext> {
  const stats = await ruleOutcomeStats(userId);
  return {
    ruleWeights: ruleWeightsFromHistory(stats.map((s) => ({ ruleCode: s.ruleCode, outcome: s.outcome, status: s.status, count: s._count._all }))),
    recentlySkipped: recentlySkippedCodes(ds.missions, ds.now),
  };
}

/** TON PROCHAIN MOVE : calcule l'action principale et la persiste (une recommandation par règle et par jour). */
export async function getNextMove(userId: string, now = new Date()) {
  const analytics = await getAnalytics(userId, now);
  const ctx = await ruleContext(userId, analytics.ds);
  const nba = nextBestAction(analytics.ds, analytics.snapshot, ctx);
  let recommendation = null;
  if (nba.primary) recommendation = await persistRecommendation(userId, nba.primary, analytics.ds);
  return { ...analytics, nba, recommendation, ruleContext: ctx };
}

async function persistRecommendation(userId: string, c: ActionCandidate, ds: AnalyticsDataset) {
  const last = await latestRecommendation(userId);
  if (last && last.ruleCode === c.ruleCode && localDateKey(last.createdAt, ds.tz) === localDateKey(ds.now, ds.tz)) return last;
  const span = c.evaluation.horizonDays * DAY_MS;
  const baselineValue = evalMetricValue(c.evaluation.metric, ds, { start: new Date(ds.now.getTime() - span), end: ds.now });
  return createRecommendation(userId, {
    ruleCode: c.ruleCode,
    action: c.action,
    why: c.why,
    dataUsed: c.dataUsed,
    expectedResult: c.expectedResult,
    confidence: c.confidence,
    baseline: { metric: c.evaluation.metric, horizonDays: c.evaluation.horizonDays, value: baselineValue },
    evaluateAfter: new Date(ds.now.getTime() + span),
  });
}

/** Missions du jour (≤ 5), générées une seule fois par jour à partir des données. */
export async function ensureTodayMissions(userId: string, now = new Date()) {
  const date = missionDate(now);
  const existing = await listMissionsForDate(userId, date);
  if (existing.length) return existing;
  const { nba, recommendation } = await getNextMove(userId, now);
  const drafts = missionsFromCandidates(nba.candidates).map((d) => ({ ...d, recommendationId: recommendation && d.code === recommendation.ruleCode ? recommendation.id : null }));
  return createMissions(userId, date, drafts);
}

/** Résultat d'une mission → statut de la recommandation liée → mémoire (boucle d'apprentissage). */
export async function recordMissionResult(userId: string, missionId: string, status: MissionStatus, resultNote?: string | null) {
  const mission = await updateMissionStatus(userId, missionId, status, resultNote);
  if (!mission) return null;
  if (mission.recommendationId && status !== "PENDING") await setRecommendationStatus(userId, mission.recommendationId, status === "DONE" ? "DONE" : status === "PARTIAL" ? "PARTIAL" : "SKIPPED");
  if (status !== "PENDING")
    await MemoryEngine.remember(userId, "DECISION", `Mission « ${mission.title} » : ${status === "DONE" ? "faite" : status === "PARTIAL" ? "partiellement faite" : "ignorée"}${resultNote ? ` — ${resultNote}` : ""}.`, { sourceRef: `mission:${mission.id}` });
  await audit(userId, "mission.updated", { entity: "DailyMission", entityId: missionId, metadata: { status } });
  return mission;
}

export async function recordRecommendationAction(userId: string, id: string, status: "DONE" | "SKIPPED" | "PARTIAL") {
  const ok = await setRecommendationStatus(userId, id, status);
  if (ok) {
    const rec = await getRecommendation(userId, id);
    if (rec) await MemoryEngine.remember(userId, "DECISION", `Recommandation « ${rec.action.slice(0, 120)} » : ${status}.`, { sourceRef: `rec:${id}` });
  }
  return ok;
}

/** Cycle d'apprentissage : évalue les recommandations échues et enregistre les insights d'anomalies. */
export async function runLearningCycle(userId: string, now = new Date()) {
  const ds = await loadDataset(userId, now);
  const due = await recommendationsDueForEvaluation(userId, now);
  const results = [];
  for (const rec of due) {
    const baseline = rec.baseline as { metric?: EvalMetric; horizonDays?: number } | null;
    if (!baseline?.metric || !baseline.horizonDays) continue;
    const ev = evaluate({ metric: baseline.metric, horizonDays: baseline.horizonDays, createdAt: rec.createdAt, actedAt: rec.actedAt }, ds);
    await saveRecommendationEvaluation(userId, rec.id, { outcome: ev.outcome, outcomeMetrics: { metric: baseline.metric, before: ev.before, after: ev.after, delta: ev.delta }, evaluationNote: ev.note });
    await MemoryEngine.remember(userId, "RECOMMENDATION_OUTCOME", `« ${rec.action.slice(0, 100)} » (${rec.ruleCode}) → ${ev.outcome}. ${ev.note}`, { sourceRef: `rec:${rec.id}`, weight: ev.outcome === "POSITIVE" ? 1.5 : 1 });
    results.push({ id: rec.id, ruleCode: rec.ruleCode, ...ev });
  }
  return results;
}

export async function persistInsights(userId: string, now = new Date()) {
  const { anomalies } = await getAnalytics(userId, now);
  for (const a of anomalies) await upsertInsight(userId, { kind: a.kind, code: a.code, title: a.title, observation: a.observation, possibleCauses: a.possibleCauses, actionToTest: a.actionToTest, dataUsed: a.dataUsed, periodStart: a.periodStart, periodEnd: a.periodEnd });
  return anomalies;
}
