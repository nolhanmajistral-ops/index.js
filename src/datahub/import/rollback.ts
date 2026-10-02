import type { Prisma } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { logger } from "@/lib/logger";
import { audit } from "@/repositories/audit";

type Deleter = (tx: Tx, userId: string, id: string) => Promise<unknown>;

const DELETERS: Record<string, Deleter> = {
  Revenue: (tx, userId, id) => tx.revenue.deleteMany({ where: { id, userId } }),
  Appointment: (tx, userId, id) => tx.appointment.deleteMany({ where: { id, userId } }),
  ClientMatchReview: (tx, userId, id) => tx.clientMatchReview.deleteMany({ where: { id, userId } }),
  Attribution: (tx, userId, id) => tx.attribution.deleteMany({ where: { id, userId } }),
  ClientIdentifier: (tx, userId, id) => tx.clientIdentifier.deleteMany({ where: { id, userId } }),
  Client: (tx, userId, id) => tx.client.deleteMany({ where: { id, userId } }),
  Service: async (tx, userId, id) => {
    // Une prestation créée par l'import n'est supprimée que si plus rien ne la référence.
    const used = await tx.appointment.count({ where: { userId, serviceId: id } });
    if (used === 0) await tx.service.deleteMany({ where: { id, userId } });
  },
};

const RESTORERS: Record<string, (tx: Tx, userId: string, id: string, previous: Prisma.JsonValue) => Promise<unknown>> = {
  Revenue: (tx, userId, id, previous) => tx.revenue.updateMany({ where: { id, userId }, data: previous as Prisma.RevenueUpdateManyMutationInput }),
};

/**
 * Annule un import : supprime uniquement ce que l'import a créé et restaure ce qu'il a explicitement modifié,
 * dans l'ordre inverse des écritures. Idempotent : un import déjà annulé ne peut pas l'être deux fois.
 */
export async function rollbackImport(userId: string, batchId: string) {
  const result = await prisma.$transaction(
    async (tx) => {
      const batch = await tx.importBatch.findFirst({ where: { id: batchId, userId } });
      if (!batch) throw new Error("Import introuvable");
      if (batch.status !== "COMPLETED") throw new Error("Cet import a déjà été annulé ou n'est pas terminé");
      const changes = await tx.importChange.findMany({ where: { importBatchId: batchId }, orderBy: { seq: "desc" } });
      let deleted = 0;
      let restored = 0;
      for (const c of changes) {
        if (c.action === "CREATED") {
          const del = DELETERS[c.entity];
          if (del) {
            await del(tx, userId, c.entityId);
            deleted++;
          }
        } else if (c.previous) {
          const restore = RESTORERS[c.entity];
          if (restore) {
            await restore(tx, userId, c.entityId, c.previous);
            restored++;
          }
        }
      }
      await tx.importBatch.update({ where: { id: batchId }, data: { status: "ROLLED_BACK", rolledBackAt: new Date() } });
      return { deleted, restored, changes: changes.length };
    },
    { timeout: 120_000 },
  );
  await audit(userId, "import.rolled_back", { entity: "ImportBatch", entityId: batchId, metadata: result });
  logger.info("import.rolled_back", { batchId, ...result });
  return result;
}
