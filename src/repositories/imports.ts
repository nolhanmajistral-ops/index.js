import type { DataSource, ImportChangeAction, ImportStatus, Prisma } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";

export function createImportBatch(
  userId: string,
  d: { provider: DataSource; fileName: string; fileHash: string; fileSize: number; mimeType: string; mapping: Record<string, unknown>; syncJobId?: string },
  tx: Tx = prisma,
) {
  return tx.importBatch.create({ data: { userId, ...d, mapping: d.mapping as Prisma.InputJsonValue } });
}

export function finishImportBatch(
  batchId: string,
  d: { status: ImportStatus; totalRows: number; importedRows: number; skippedRows: number; duplicateRows: number; errorRows: number; report: Record<string, unknown> },
  tx: Tx = prisma,
) {
  return tx.importBatch.update({ where: { id: batchId }, data: { ...d, report: d.report as Prisma.InputJsonValue, completedAt: new Date() } });
}

export function addRowErrors(batchId: string, errors: { rowNumber: number; rawValue: string; error: string; correction?: string | null }[], tx: Tx = prisma) {
  if (errors.length === 0) return Promise.resolve({ count: 0 });
  return tx.importRowError.createMany({ data: errors.map((e) => ({ importBatchId: batchId, ...e, rawValue: e.rawValue.slice(0, 2000) })) });
}

export class ChangeRecorder {
  private seq = 0;
  constructor(private readonly batchId: string, private readonly tx: Tx) {}
  async record(entity: string, entityId: string, action: ImportChangeAction, previous?: Record<string, unknown> | null) {
    this.seq++;
    await this.tx.importChange.create({
      data: { importBatchId: this.batchId, entity, entityId, action, previous: (previous ?? undefined) as Prisma.InputJsonValue | undefined, seq: this.seq },
    });
  }
}

export function listImportBatches(userId: string, take = 30) {
  return prisma.importBatch.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take });
}

export function getImportBatch(userId: string, id: string) {
  return prisma.importBatch.findFirst({ where: { id, userId }, include: { rowErrors: { orderBy: { rowNumber: "asc" }, take: 500 } } });
}

export function findCompletedBatchByHash(userId: string, fileHash: string) {
  return prisma.importBatch.findFirst({ where: { userId, fileHash, status: "COMPLETED" }, orderBy: { createdAt: "desc" } });
}
