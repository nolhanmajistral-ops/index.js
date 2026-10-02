import type { Prisma } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";

export function getProfile(userId: string) {
  return prisma.profile.findUnique({ where: { userId } });
}

export function upsertProfile(userId: string, data: Omit<Prisma.ProfileUncheckedCreateInput, "userId" | "id">, tx: Tx = prisma) {
  return tx.profile.upsert({ where: { userId }, create: { ...data, userId }, update: data });
}
