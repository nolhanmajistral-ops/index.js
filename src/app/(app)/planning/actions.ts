"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guarded, fieldErrors, type ActionState } from "@/lib/actions";
import { acquisitionChannels, formDataToObject } from "@/lib/validation/schemas";
import { fromLocalInput } from "@/lib/dates";
import { addPlanningAppointment, setAppointmentStatus } from "@/domain/planning/service";
import { deleteAppointment } from "@/repositories/appointments";
import { audit } from "@/repositories/audit";

const opt = (max: number) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(max).optional());

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Heure invalide"),
  clientId: opt(40),
  clientName: opt(120),
  clientPhone: opt(40),
  acquisitionChannel: z.preprocess((v) => (v === "" ? undefined : v), z.enum(acquisitionChannels).optional()),
  serviceId: z.string().trim().min(1, "Choisis une prestation").max(40),
  price: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().min(0).max(100_000).optional()),
  status: z.preprocess((v) => (v === "" || v === "AUTO" ? undefined : v), z.enum(["BOOKED", "COMPLETED", "CANCELLED", "NO_SHOW"]).optional()),
  notes: opt(500),
});

export async function addAppointmentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = schema.safeParse(formDataToObject(fd));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Vérifie les champs.", fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;
  const startsAt = fromLocalInput(`${d.date}T${d.time}`);
  if (!startsAt) return { ok: false, message: "Date ou heure invalide." };
  const res = await guarded("planning.add", async (userId) => {
    const r = await addPlanningAppointment(userId, { ...d, startsAt, priceCents: d.price !== undefined ? Math.round(d.price * 100) : undefined });
    if (r.duplicate) return { ok: false, message: "Ce rendez-vous existe déjà (même client, même heure, même prestation)." };
    return { ok: true, message: "Rendez-vous ajouté." };
  });
  revalidatePath("/planning");
  return res;
}

export async function statusAction(id: string, status: "BOOKED" | "COMPLETED" | "CANCELLED" | "NO_SHOW") {
  await guarded("planning.status", async (userId) => ({ ok: Boolean(await setAppointmentStatus(userId, z.string().max(40).parse(id), z.enum(["BOOKED", "COMPLETED", "CANCELLED", "NO_SHOW"]).parse(status))) }));
  revalidatePath("/planning");
}

export async function deleteAppointmentAction(id: string) {
  await guarded("planning.delete", async (userId) => {
    const ok = await deleteAppointment(userId, z.string().max(40).parse(id));
    if (ok) await audit(userId, "appointment.deleted", { entity: "Appointment", entityId: id });
    return { ok };
  });
  revalidatePath("/planning");
}
