"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guarded, fieldErrors, type ActionState } from "@/lib/actions";
import { appointmentSchema, formDataToObject, manualRevenueSchema } from "@/lib/validation/schemas";
import { recordManualAppointment, recordManualRevenue } from "@/domain/revenue/service";
import { deleteRevenue, setRevenueReviewStatus } from "@/repositories/revenues";
import { audit } from "@/repositories/audit";

export async function manualRevenueAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = manualRevenueSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return { ok: false, message: "Vérifie les champs.", fieldErrors: fieldErrors(parsed.error) };
  const res = await guarded("revenue.manual", async (userId) => {
    const { decision } = await recordManualRevenue(userId, { ...parsed.data, amountCents: Math.round(parsed.data.amount * 100) });
    if (decision.decision === "DUPLICATE") return { ok: false, message: `Doublon détecté : ${decision.reason}. Enregistré comme « doublon ignoré », non compté dans le CA.` };
    if (decision.decision === "REVIEW") return { ok: true, message: `Enregistré « à vérifier » : ${decision.reason}. Non inclus dans le CA confirmé tant que tu ne le valides pas.` };
    return { ok: true, message: "Revenu enregistré." };
  });
  revalidatePath("/revenue");
  return res;
}

export async function manualAppointmentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = appointmentSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return { ok: false, message: "Vérifie les champs.", fieldErrors: fieldErrors(parsed.error) };
  const res = await guarded("appointment.manual", async (userId) => {
    const r = await recordManualAppointment(userId, { ...parsed.data, priceCents: parsed.data.price !== undefined ? Math.round(parsed.data.price * 100) : undefined });
    return r.duplicate ? { ok: false, message: "Ce rendez-vous existe déjà (même client, même heure, même prestation) : non dupliqué." } : { ok: true, message: r.revenue ? "Rendez-vous et revenu enregistrés." : "Rendez-vous enregistré (pas de revenu : non réalisé)." };
  });
  revalidatePath("/revenue");
  return res;
}

export async function revenueReviewAction(id: string, status: "OK" | "DUPLICATE_IGNORED") {
  await guarded("revenue.review", async (userId) => {
    const ok = await setRevenueReviewStatus(userId, z.string().max(40).parse(id), z.enum(["OK", "DUPLICATE_IGNORED"]).parse(status));
    if (ok) await audit(userId, "revenue.reviewed", { entity: "Revenue", entityId: id, metadata: { status } });
    return { ok };
  });
  revalidatePath("/revenue");
}

export async function deleteRevenueAction(id: string) {
  await guarded("revenue.delete", async (userId) => ({ ok: await deleteRevenue(userId, z.string().max(40).parse(id)) }));
  revalidatePath("/revenue");
}
