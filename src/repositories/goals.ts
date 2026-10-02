import type { GoalMetric } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";

export function listGoals(userId: string) {
  return prisma.goal.findMany({ where: { userId, active: true }, orderBy: { createdAt: "asc" } });
}

export function upsertGoal(userId: string, metric: GoalMetric, target: number, tx: Tx = prisma, source: "MANUAL" | "DEMO" = "MANUAL") {
  return tx.goal.upsert({
    where: { userId_metric: { userId, metric } },
    create: { userId, metric, target, source },
    update: { target, active: true },
  });
}

export async function deactivateGoal(userId: string, id: string) {
  const r = await prisma.goal.updateMany({ where: { id, userId }, data: { active: false } });
  return r.count === 1;
}
