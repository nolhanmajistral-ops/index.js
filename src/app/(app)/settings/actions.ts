"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guarded, type ActionState } from "@/lib/actions";
import { formDataToObject, scoreWeightsSchema, serviceSchema } from "@/lib/validation/schemas";
import { getProfile, upsertProfile } from "@/repositories/profile";
import { setServiceActive, upsertService } from "@/repositories/services";
import { setSetting } from "@/repositories/settings";
import { audit } from "@/repositories/audit";
import { deleteUserCascade } from "@/repositories/users";
import { resetDemoData, deleteDemoData } from "@/datahub/demo";
import { applyRetention } from "@/datahub/privacy/retention";
import { SCORE_WEIGHTS_KEY } from "@/domain/analytics/service";
import { signOut } from "@/lib/auth";
import { requireOnboardedUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  activity: z.string().trim().min(1).max(80),
  city: z.string().trim().min(1).max(80),
  instagramHandle: z.string().trim().max(60).optional(),
  tiktokHandle: z.string().trim().max(60).optional(),
  weeklyHoursAvailable: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(0).max(100).optional()),
  dataRetentionMonths: z.coerce.number().int().min(6).max(120),
});

export async function profileAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = profileSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return { ok: false, message: "Vérifie les champs." };
  const res = await guarded("settings.profile", async (userId) => {
    const current = await getProfile(userId);
    await upsertProfile(userId, {
      ...(current ? { usesPlanity: current.usesPlanity } : {}),
      displayName: parsed.data.displayName,
      activity: parsed.data.activity,
      city: parsed.data.city,
      instagramHandle: parsed.data.instagramHandle?.replace(/^@/, "") || null,
      tiktokHandle: parsed.data.tiktokHandle?.replace(/^@/, "") || null,
      weeklyHoursAvailable: parsed.data.weeklyHoursAvailable ?? null,
      dataRetentionMonths: parsed.data.dataRetentionMonths,
    });
    await audit(userId, "settings.updated", { metadata: { section: "profile" } });
    return { ok: true, message: "Profil enregistré." };
  });
  revalidatePath("/settings");
  return res;
}

export async function serviceAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = serviceSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return { ok: false, message: "Vérifie les champs." };
  const res = await guarded("settings.service", async (userId) => {
    await upsertService(userId, { name: parsed.data.name, priceCents: Math.round(parsed.data.price * 100), durationMinutes: parsed.data.durationMinutes });
    await audit(userId, "settings.updated", { metadata: { section: "services" } });
    return { ok: true, message: "Tarif enregistré (s'applique aux futurs rendez-vous ; l'historique n'est pas modifié)." };
  });
  revalidatePath("/settings");
  return res;
}

export async function toggleServiceAction(id: string, active: boolean) {
  await guarded("settings.service.toggle", async (userId) => ({ ok: await setServiceActive(userId, z.string().max(40).parse(id), active) }));
  revalidatePath("/settings");
}

export async function weightsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const n = (k: string) => Number(fd.get(k));
  const parsed = scoreWeightsSchema.safeParse({
    visibility: { views: n("visibility.views"), viewsPerFollower: n("visibility.viewsPerFollower"), reach: n("visibility.reach") },
    engagement: { likeRate: n("engagement.likeRate"), commentRate: n("engagement.commentRate"), shareRate: n("engagement.shareRate"), saveRate: n("engagement.saveRate") },
    acquisition: { profileVisits: n("acquisition.profileVisits"), followersGained: n("acquisition.followersGained"), leads: n("acquisition.leads") },
    business: { clients: n("business.clients"), revenue: n("business.revenue") },
  });
  if (!parsed.success) return { ok: false, message: "Pondérations invalides (0 à 10)." };
  const res = await guarded("settings.weights", async (userId) => {
    await setSetting(userId, SCORE_WEIGHTS_KEY, parsed.data);
    await audit(userId, "settings.updated", { metadata: { section: "weights" } });
    return { ok: true, message: "Pondérations enregistrées." };
  });
  revalidatePath("/settings");
  return res;
}

export async function resetDemoAction(_p: ActionState, _fd: FormData): Promise<ActionState> {
  const res = await guarded("demo.reset", async (userId) => {
    const r = await resetDemoData(userId);
    return { ok: true, message: `Données DEMO réinitialisées (${r.created.clients} clients, ${r.created.appointments} rendez-vous, ${r.created.contents} contenus). Tes données réelles sont intactes.` };
  });
  revalidatePath("/", "layout");
  return res;
}

export async function deleteDemoAction(_p: ActionState, _fd: FormData): Promise<ActionState> {
  const res = await guarded("demo.delete", async (userId) => {
    await deleteDemoData(userId);
    await audit(userId, "demo.deleted");
    return { ok: true, message: "Toutes les données DEMO ont été supprimées." };
  });
  revalidatePath("/", "layout");
  return res;
}

export async function retentionAction(_p: ActionState, _fd: FormData): Promise<ActionState> {
  const res = await guarded("privacy.retention", async (userId) => {
    const profile = await getProfile(userId);
    const r = await applyRetention(userId, profile?.dataRetentionMonths ?? 36);
    return { ok: true, message: `Rétention appliquée : ${r.appointments} rendez-vous, ${r.revenues} revenus, ${r.clients} clients supprimés.` };
  });
  revalidatePath("/", "layout");
  return res;
}

export async function deleteAccountAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireOnboardedUser();
  if (fd.get("confirm") !== "SUPPRIMER") return { ok: false, message: "Tape SUPPRIMER pour confirmer." };
  await deleteUserCascade(user.id);
  logger.info("account.deleted", { userId: user.id });
  await signOut({ redirectTo: "/login" });
  return { ok: true };
}
