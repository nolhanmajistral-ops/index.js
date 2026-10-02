import { Prisma } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";

/** Journal d'audit : ne jamais y écrire de données sensibles (emails, téléphones, tokens). */
export async function audit(
  userId: string,
  action: string,
  opts: { entity?: string; entityId?: string; metadata?: Record<string, unknown> } = {},
  tx: Tx = prisma,
) {
  await tx.auditLog.create({
    data: {
      userId,
      action,
      entity: opts.entity,
      entityId: opts.entityId,
      metadata: (opts.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

export function listAuditLogs(userId: string, limit = 50) {
  return prisma.auditLog.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit });
}
