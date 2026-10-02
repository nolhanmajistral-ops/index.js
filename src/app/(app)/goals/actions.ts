"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guarded, type ActionState } from "@/lib/actions";
import { formDataToObject, goalSchema } from "@/lib/validation/schemas";
import { deactivateGoal, upsertGoal } from "@/repositories/goals";
import { GOAL_LABEL } from "@/lib/labels";
import { MemoryEngine } from "@/ai/memory/memory-engine";
import { audit } from "@/repositories/audit";

export async function goalAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = goalSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return { ok: false, message: "Valeur invalide." };
  const { metric, target } = parsed.data;
  const res = await guarded("goal.upsert", async (userId) => {
    const isChf = GOAL_LABEL[metric]?.unit === "chf";
    await upsertGoal(userId, metric, Math.round(isChf ? target * 100 : target));
    await MemoryEngine.remember(userId, "GOAL", `Objectif ${GOAL_LABEL[metric]?.label} : ${target}${isChf ? " CHF" : ""}.`, { key: `goal.${metric}`, weight: 2 });
    await audit(userId, "goal.updated", { metadata: { metric } });
    return { ok: true, message: "Objectif enregistré." };
  });
  revalidatePath("/goals");
  revalidatePath("/dashboard");
  return res;
}

export async function deactivateGoalAction(id: string) {
  await guarded("goal.deactivate", async (userId) => ({ ok: await deactivateGoal(userId, z.string().max(40).parse(id)) }));
  revalidatePath("/goals");
}
