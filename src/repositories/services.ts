import type { DataSource } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { normalizeText } from "@/datahub/normalization";

export function listServices(userId: string, opts: { activeOnly?: boolean } = {}) {
  return prisma.service.findMany({ where: { userId, ...(opts.activeOnly ? { active: true } : {}) }, orderBy: { priceCents: "asc" } });
}

export function findServiceById(userId: string, id: string, tx: Tx = prisma) {
  return tx.service.findFirst({ where: { id, userId } });
}

export function findServiceByName(userId: string, name: string, tx: Tx = prisma) {
  return tx.service.findUnique({ where: { userId_normalizedName: { userId, normalizedName: normalizeText(name) } } });
}

export function upsertService(
  userId: string,
  data: { name: string; priceCents: number; durationMinutes?: number | null; source?: DataSource },
  tx: Tx = prisma,
) {
  const normalizedName = normalizeText(data.name);
  return tx.service.upsert({
    where: { userId_normalizedName: { userId, normalizedName } },
    create: { userId, name: data.name.trim(), normalizedName, priceCents: data.priceCents, durationMinutes: data.durationMinutes ?? null, source: data.source ?? "MANUAL" },
    update: { name: data.name.trim(), priceCents: data.priceCents, durationMinutes: data.durationMinutes ?? null, active: true },
  });
}

export async function setServiceActive(userId: string, id: string, active: boolean) {
  const res = await prisma.service.updateMany({ where: { id, userId }, data: { active } });
  return res.count === 1;
}
