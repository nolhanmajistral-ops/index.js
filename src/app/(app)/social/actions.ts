"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guarded, fieldErrors, type ActionState } from "@/lib/actions";
import { formDataToObject, socialSnapshotSchema } from "@/lib/validation/schemas";
import { addSocialSnapshot, deleteSocialSnapshot } from "@/repositories/social";
import { disconnectSocial, syncSocial } from "@/datahub/social/service";
import { audit } from "@/repositories/audit";

export async function addSnapshotAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = socialSnapshotSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Vérifie les champs.", fieldErrors: fieldErrors(parsed.error) };
  const res = await guarded("social.snapshot", async (userId) => {
    try {
      await addSocialSnapshot(userId, { ...parsed.data, source: "MANUAL" });
    } catch {
      return { ok: false, message: "Un snapshot existe déjà à cette date exacte (l'historique n'est jamais écrasé)." };
    }
    await audit(userId, "social.snapshot.added", { metadata: { platform: parsed.data.platform } });
    return { ok: true, message: "Snapshot ajouté." };
  });
  revalidatePath("/social");
  return res;
}

export async function deleteSnapshotAction(id: string) {
  await guarded("social.snapshot.delete", async (userId) => ({ ok: await deleteSocialSnapshot(userId, z.string().max(40).parse(id)) }));
  revalidatePath("/social");
}

export async function syncAction(platform: "INSTAGRAM" | "TIKTOK") {
  await guarded("social.sync", async (userId) => ({ ok: (await syncSocial(userId, z.enum(["INSTAGRAM", "TIKTOK"]).parse(platform))).ok }));
  revalidatePath("/social");
}

export async function disconnectAction(platform: "INSTAGRAM" | "TIKTOK") {
  await guarded("social.disconnect", async (userId) => {
    await disconnectSocial(userId, z.enum(["INSTAGRAM", "TIKTOK"]).parse(platform));
    return { ok: true };
  });
  revalidatePath("/social");
}
