import { prisma } from "@/lib/db";
import { randomUUID } from "node:crypto";

export async function resetDb() {
  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'",
  );
  if (tables.length) await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

export async function createTestUser(name = "Test") {
  return prisma.user.create({ data: { email: `${randomUUID()}@test.local`, name, passwordHash: "x", onboardedAt: new Date() } });
}

export { prisma };
