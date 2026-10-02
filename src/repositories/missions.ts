import type { MissionStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export function listMissionsForDate(userId: string, date: Date) {
  return prisma.dailyMission.findMany({ where: { userId, date }, orderBy: { rank: "asc" } });
}

export function listRecentMissions(userId: string, since: Date) {
  return prisma.dailyMission.findMany({ where: { userId, date: { gte: since } }, orderBy: [{ date: "desc" }, { rank: "asc" }], take: 200 });
}

export interface MissionDraft {
  code: string;
  title: string;
  why: string;
  action: string;
  priority: number;
  expectedResult: string;
  dataUsed: Record<string, unknown>;
  recommendationId?: string | null;
}

/** Crée les missions du jour (idempotent : une mission par code et par jour). */
export async function createMissions(userId: string, date: Date, drafts: MissionDraft[], source: "MANUAL" | "DEMO" = "MANUAL") {
  await prisma.dailyMission.createMany({
    data: drafts.map((d, i) => ({
      userId,
      date,
      rank: i + 1,
      code: d.code,
      title: d.title,
      why: d.why,
      action: d.action,
      priority: d.priority,
      expectedResult: d.expectedResult,
      dataUsed: d.dataUsed as Prisma.InputJsonValue,
      recommendationId: d.recommendationId ?? null,
      source,
    })),
    skipDuplicates: true,
  });
  return listMissionsForDate(userId, date);
}

export async function updateMissionStatus(userId: string, id: string, status: MissionStatus, resultNote?: string | null) {
  const r = await prisma.dailyMission.updateMany({
    where: { id, userId },
    data: { status, resultNote: resultNote ?? null, completedAt: status === "PENDING" ? null : new Date() },
  });
  return r.count === 1 ? prisma.dailyMission.findFirst({ where: { id, userId } }) : null;
}
