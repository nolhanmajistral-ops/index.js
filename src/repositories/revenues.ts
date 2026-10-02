import type { DataSource, RevenueKind, RevenueReviewStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma, type Tx } from "@/lib/db";
import { manualRevenueDedupKey } from "@/datahub/deduplication";
import { DAY_MS } from "@/lib/dates";
import type { RevenueRow } from "@/domain/revenue/types";

export const revenueRowSelect = {
  id: true,
  amountCents: true,
  occurredAt: true,
  source: true,
  kind: true,
  clientId: true,
  serviceId: true,
  appointmentId: true,
  isEstimated: true,
  reviewStatus: true,
} as const;

/** Revenus autour d'une date (±36h) pour la détection de doublons. */
export function revenuesAround(userId: string, at: Date, tx: Tx = prisma): Promise<RevenueRow[]> {
  return tx.revenue.findMany({
    where: { userId, occurredAt: { gte: new Date(at.getTime() - 1.5 * DAY_MS), lt: new Date(at.getTime() + 1.5 * DAY_MS) } },
    select: revenueRowSelect,
  });
}

export function createManualRevenue(
  userId: string,
  data: {
    amountCents: number;
    occurredAt: Date;
    clientId: string | null;
    serviceId: string | null;
    kind: RevenueKind;
    label?: string | null;
    reviewStatus: RevenueReviewStatus;
    reviewNote?: string | null;
    duplicateOfId?: string | null;
    source?: DataSource;
    isEstimated?: boolean;
  },
  tx: Tx = prisma,
) {
  return tx.revenue.create({
    data: {
      userId,
      amountCents: data.amountCents,
      occurredAt: data.occurredAt,
      clientId: data.clientId,
      serviceId: data.serviceId,
      kind: data.kind,
      label: data.label ?? null,
      reviewStatus: data.reviewStatus,
      reviewNote: data.reviewNote ?? null,
      duplicateOfId: data.duplicateOfId ?? null,
      dedupKey: manualRevenueDedupKey(randomUUID()),
      source: data.source ?? "MANUAL",
      isEstimated: data.isEstimated ?? false,
    },
  });
}

export function listRevenues(userId: string, opts: { from?: Date; to?: Date; status?: RevenueReviewStatus; take?: number; skip?: number } = {}) {
  return prisma.revenue.findMany({
    where: {
      userId,
      ...(opts.status ? { reviewStatus: opts.status } : {}),
      ...(opts.from || opts.to ? { occurredAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lt: opts.to } : {}) } } : {}),
    },
    orderBy: { occurredAt: "desc" },
    take: Math.min(opts.take ?? 50, 500),
    skip: opts.skip ?? 0,
    include: { client: { select: { id: true, displayName: true } }, service: { select: { name: true } } },
  });
}

export async function setRevenueReviewStatus(userId: string, id: string, status: RevenueReviewStatus) {
  const res = await prisma.revenue.updateMany({ where: { id, userId }, data: { reviewStatus: status } });
  return res.count === 1;
}

export async function deleteRevenue(userId: string, id: string) {
  const res = await prisma.revenue.deleteMany({ where: { id, userId, appointmentId: null } });
  return res.count === 1;
}
