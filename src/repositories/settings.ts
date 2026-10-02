import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function getSetting<T>(userId: string, key: string): Promise<T | null> {
  const s = await prisma.setting.findUnique({ where: { userId_key: { userId, key } } });
  return (s?.value as T | undefined) ?? null;
}

export function setSetting(userId: string, key: string, value: unknown) {
  const v = value as Prisma.InputJsonValue;
  return prisma.setting.upsert({ where: { userId_key: { userId, key } }, create: { userId, key, value: v }, update: { value: v } });
}
