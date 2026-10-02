"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { guarded, fieldErrors, type ActionState } from "@/lib/actions";
import { clientSchema, formDataToObject, leadSchema } from "@/lib/validation/schemas";
import { createClientWithAttribution, updateClientWithAttribution } from "@/domain/clients/service";
import { decideMatchReview } from "@/domain/clients/review";
import { deleteClient } from "@/repositories/clients";
import { createLead, updateLeadStatus } from "@/repositories/leads";
import { audit } from "@/repositories/audit";

const id = z.string().min(1).max(40);

export async function createClientAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = clientSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return { ok: false, message: "Vérifie les champs.", fieldErrors: fieldErrors(parsed.error) };
  let createdId = "";
  const res = await guarded("client.create", async (userId) => {
    const r = await createClientWithAttribution(userId, parsed.data);
    if (r.duplicateOf) return { ok: false, message: `Ce client existe déjà (même email ou téléphone) : ${r.duplicateOf.displayName}.` };
    createdId = r.client!.id;
    return { ok: true };
  });
  if (!createdId) return res;
  return { ok: true, message: "Client ajouté.", redirectTo: `/clients/${createdId}` };
}

export async function updateClientAction(clientId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = clientSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return { ok: false, message: "Vérifie les champs.", fieldErrors: fieldErrors(parsed.error) };
  const res = await guarded("client.update", async (userId) => ((await updateClientWithAttribution(userId, id.parse(clientId), parsed.data)) ? { ok: true, message: "Client enregistré." } : { ok: false, message: "Client introuvable." }));
  revalidatePath(`/clients/${clientId}`);
  return res;
}

export async function deleteClientAction(clientId: string) {
  await guarded("client.delete", async (userId) => {
    const ok = await deleteClient(userId, id.parse(clientId));
    if (ok) await audit(userId, "client.deleted", { entity: "Client", entityId: clientId });
    return { ok };
  });
  revalidatePath("/clients");
  redirect("/clients");
}

export async function decideReviewAction(reviewId: string, decision: "MERGE" | "IGNORE") {
  const res = await guarded("review.decide", async (userId) => ({ ok: true, ...(await decideMatchReview(userId, id.parse(reviewId), z.enum(["MERGE", "IGNORE"]).parse(decision))) }));
  revalidatePath("/clients/review");
  revalidatePath("/clients");
  return res;
}

export async function createLeadAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = leadSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return { ok: false, message: "Vérifie les champs.", fieldErrors: fieldErrors(parsed.error) };
  const res = await guarded("lead.create", async (userId) => {
    await createLead(userId, parsed.data);
    return { ok: true, message: "Prospect ajouté." };
  });
  revalidatePath("/clients");
  return res;
}

export async function leadStatusAction(leadId: string, status: "CONTACTED" | "BOOKED" | "CONVERTED" | "LOST") {
  await guarded("lead.status", async (userId) => ({ ok: await updateLeadStatus(userId, id.parse(leadId), z.enum(["CONTACTED", "BOOKED", "CONVERTED", "LOST"]).parse(status)) }));
  revalidatePath("/clients");
}
