import type { Confidence, ExperimentStatus, InsightKind, MemoryKind, Outcome, Prisma, RecommendationStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

const json = (v: unknown) => v as Prisma.InputJsonValue;

// ── Insights ──
export function upsertInsight(
  userId: string,
  d: { kind: InsightKind; code: string; title: string; observation: string; possibleCauses: string[]; actionToTest: string; dataUsed: Record<string, unknown>; periodStart: Date; periodEnd: Date },
) {
  return prisma.aiInsight.upsert({
    where: { userId_code_periodEnd: { userId, code: d.code, periodEnd: d.periodEnd } },
    create: { userId, ...d, possibleCauses: json(d.possibleCauses), dataUsed: json(d.dataUsed) },
    update: { title: d.title, observation: d.observation, possibleCauses: json(d.possibleCauses), actionToTest: d.actionToTest, dataUsed: json(d.dataUsed) },
  });
}

export function listInsights(userId: string, take = 20) {
  return prisma.aiInsight.findMany({ where: { userId, dismissedAt: null }, orderBy: { createdAt: "desc" }, take });
}

// ── Recommendations ──
export function createRecommendation(
  userId: string,
  d: { ruleCode: string; action: string; why: string; dataUsed: Record<string, unknown>; expectedResult: string; confidence: Confidence; baseline: Record<string, unknown>; evaluateAfter: Date },
) {
  return prisma.aiRecommendation.create({ data: { userId, ...d, dataUsed: json(d.dataUsed), baseline: json(d.baseline) } });
}

export function latestRecommendation(userId: string) {
  return prisma.aiRecommendation.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
}

export function listRecommendations(userId: string, take = 30) {
  return prisma.aiRecommendation.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take });
}

export function getRecommendation(userId: string, id: string) {
  return prisma.aiRecommendation.findFirst({ where: { id, userId } });
}

export async function setRecommendationStatus(userId: string, id: string, status: RecommendationStatus) {
  const r = await prisma.aiRecommendation.updateMany({ where: { id, userId }, data: { status, actedAt: status === "PROPOSED" ? null : new Date() } });
  return r.count === 1;
}

export function recommendationsDueForEvaluation(userId: string, now = new Date()) {
  return prisma.aiRecommendation.findMany({
    where: { userId, status: { in: ["DONE", "PARTIAL"] }, evaluatedAt: null, evaluateAfter: { lte: now } },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
}

export function saveRecommendationEvaluation(userId: string, id: string, d: { outcome: Outcome; outcomeMetrics: Record<string, unknown>; evaluationNote: string }) {
  return prisma.aiRecommendation.updateMany({ where: { id, userId }, data: { outcome: d.outcome, outcomeMetrics: json(d.outcomeMetrics), evaluationNote: d.evaluationNote, evaluatedAt: new Date() } });
}

export function ruleOutcomeStats(userId: string) {
  return prisma.aiRecommendation.groupBy({ by: ["ruleCode", "outcome", "status"], where: { userId }, _count: { _all: true } });
}

// ── Memory ──
export function addMemory(userId: string, d: { kind: MemoryKind; content: string; key?: string | null; weight?: number; sourceRef?: string | null; expiresAt?: Date | null }) {
  return prisma.aiMemory.create({ data: { userId, ...d } });
}

export async function upsertMemoryByKey(userId: string, key: string, d: { kind: MemoryKind; content: string; weight?: number; sourceRef?: string | null }) {
  const existing = await prisma.aiMemory.findFirst({ where: { userId, key } });
  if (existing) return prisma.aiMemory.update({ where: { id: existing.id }, data: { content: d.content, weight: d.weight ?? existing.weight, sourceRef: d.sourceRef ?? existing.sourceRef } });
  return prisma.aiMemory.create({ data: { userId, key, ...d } });
}

export function listMemories(userId: string, kinds?: MemoryKind[], take = 50) {
  return prisma.aiMemory.findMany({
    where: { userId, ...(kinds ? { kind: { in: kinds } } : {}), OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    orderBy: [{ weight: "desc" }, { updatedAt: "desc" }],
    take,
  });
}

export async function deleteMemory(userId: string, id: string) {
  const r = await prisma.aiMemory.deleteMany({ where: { id, userId } });
  return r.count === 1;
}

// ── Experiments ──
export function createExperiment(userId: string, d: { hypothesis: string; action: string; startDate: Date; durationDays: number; expectedResult: string; metrics: string[]; baseline?: Record<string, unknown> | null; status?: ExperimentStatus; source?: "MANUAL" | "DEMO" }) {
  return prisma.aiExperiment.create({
    data: { userId, ...d, metrics: json(d.metrics), baseline: d.baseline ? json(d.baseline) : undefined },
  });
}

export function listExperiments(userId: string) {
  return prisma.aiExperiment.findMany({ where: { userId }, orderBy: { startDate: "desc" }, take: 50 });
}

export function getExperiment(userId: string, id: string) {
  return prisma.aiExperiment.findFirst({ where: { id, userId } });
}

export function completeExperiment(userId: string, id: string, d: { actualResult: Record<string, unknown>; conclusion: string; outcome: Outcome }) {
  return prisma.aiExperiment.updateMany({ where: { id, userId }, data: { actualResult: json(d.actualResult), conclusion: d.conclusion, outcome: d.outcome, status: "COMPLETED" } });
}

export function setExperimentStatus(userId: string, id: string, status: ExperimentStatus, baseline?: Record<string, unknown>) {
  return prisma.aiExperiment.updateMany({ where: { id, userId }, data: { status, ...(baseline ? { baseline: json(baseline) } : {}) } });
}
