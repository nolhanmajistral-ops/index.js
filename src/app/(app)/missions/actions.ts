"use server";

import { revalidatePath } from "next/cache";
import { guarded, type ActionState } from "@/lib/actions";
import { formDataToObject, missionUpdateSchema } from "@/lib/validation/schemas";
import { recordMissionResult } from "@/ai/recommendations/service";

export async function missionResultAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = missionUpdateSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return { ok: false, message: "Requête invalide." };
  const res = await guarded("mission.result", async (userId) => {
    const m = await recordMissionResult(userId, parsed.data.missionId, parsed.data.status, parsed.data.resultNote);
    return m ? { ok: true, message: "Mission mise à jour." } : { ok: false, message: "Mission introuvable." };
  });
  revalidatePath("/missions");
  revalidatePath("/dashboard");
  return res;
}
