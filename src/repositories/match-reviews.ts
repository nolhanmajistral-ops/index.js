import type { MatchLevel, Prisma } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { toClientView } from "./clients";

export function createMatchReview(
  userId: string,
  data: { clientId: string; candidateClientId: string; level: MatchLevel; score: number; reasons: string[]; importBatchId?: string | null },
  tx: Tx = prisma,
) {
  return tx.clientMatchReview.upsert({
    where: { clientId_candidateClientId: { clientId: data.clientId, candidateClientId: data.candidateClientId } },
    create: { userId, ...data, reasons: data.reasons as Prisma.InputJsonValue },
    update: {},
  });
}

export async function listPendingReviews(userId: string) {
  const rows = await prisma.clientMatchReview.findMany({
    where: { userId, status: "PENDING" },
    include: { client: true, candidateClient: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((r) => ({ ...r, client: toClientView(r.client), candidateClient: toClientView(r.candidateClient) }));
}

export function countPendingReviews(userId: string) {
  return prisma.clientMatchReview.count({ where: { userId, status: "PENDING" } });
}

export function findReview(userId: string, id: string, tx: Tx = prisma) {
  return tx.clientMatchReview.findFirst({ where: { id, userId } });
}

export function setReviewStatus(userId: string, id: string, status: "MERGED" | "IGNORED", tx: Tx = prisma) {
  return tx.clientMatchReview.updateMany({ where: { id, userId }, data: { status, decidedAt: new Date() } });
}
