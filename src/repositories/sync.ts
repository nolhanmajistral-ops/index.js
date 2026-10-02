import type { DataSource, Prisma, SyncStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/** Journalisation des synchronisations/imports : started, completed, records, errors, duration, status. */
export async function startSyncJob(userId: string, provider: DataSource, kind: string) {
  const job = await prisma.syncJob.create({ data: { userId, provider, kind, status: "RUNNING", startedAt: new Date() } });
  logger.info("sync.started", { jobId: job.id, provider, kind });
  await prisma.syncLog.create({ data: { syncJobId: job.id, level: "info", message: "started" } });
  return job;
}

export async function finishSyncJob(jobId: string, status: SyncStatus, records: number, errors: number, data?: Record<string, unknown>) {
  const job = await prisma.syncJob.findUniqueOrThrow({ where: { id: jobId } });
  const durationMs = job.startedAt ? Date.now() - job.startedAt.getTime() : null;
  await prisma.syncJob.update({ where: { id: jobId }, data: { status, records, errors, completedAt: new Date(), durationMs } });
  await prisma.syncLog.create({ data: { syncJobId: jobId, level: status === "FAILED" ? "error" : "info", message: status.toLowerCase(), data: (data ?? undefined) as Prisma.InputJsonValue | undefined } });
  logger.info("sync.completed", { jobId, provider: job.provider, status, records, errors, durationMs });
}

export function listSyncJobs(userId: string, provider?: DataSource, take = 20) {
  return prisma.syncJob.findMany({ where: { userId, ...(provider ? { provider } : {}) }, orderBy: { createdAt: "desc" }, take });
}
