"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { guarded, fieldErrors, type ActionState } from "@/lib/actions";
import { contentMetricSchema, contentSchema, formDataToObject } from "@/lib/validation/schemas";
import { addContentMetric, archiveContent, createContent, deleteContent, duplicateContent, updateContent } from "@/repositories/contents";
import { audit } from "@/repositories/audit";

const id = z.string().min(1).max(40);

export async function createContentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = contentSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return { ok: false, message: "Vérifie les champs.", fieldErrors: fieldErrors(parsed.error) };
  let newId = "";
  const res = await guarded("content.create", async (userId) => {
    const c = await createContent(userId, parsed.data);
    newId = c.id;
    await audit(userId, "content.created", { entity: "Content", entityId: c.id });
    return { ok: true };
  });
  if (!newId) return res;
  revalidatePath("/contents");
  redirect(`/contents/${newId}`);
}

export async function updateContentAction(contentId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = contentSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return { ok: false, message: "Vérifie les champs.", fieldErrors: fieldErrors(parsed.error) };
  const res = await guarded("content.update", async (userId) => {
    const ok = await updateContent(userId, id.parse(contentId), { ...parsed.data, publishedAt: parsed.data.publishedAt ?? (parsed.data.status === "PUBLISHED" ? new Date() : null), plannedAt: parsed.data.plannedAt ?? null });
    return ok ? { ok: true, message: "Contenu enregistré." } : { ok: false, message: "Contenu introuvable." };
  });
  revalidatePath(`/contents/${contentId}`);
  revalidatePath("/contents");
  return res;
}

export async function addMetricAction(contentId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = contentMetricSchema.safeParse(formDataToObject(fd));
  if (!parsed.success) return { ok: false, message: "Valeurs invalides.", fieldErrors: fieldErrors(parsed.error) };
  if (Object.values(parsed.data).every((v) => v === undefined)) return { ok: false, message: "Renseigne au moins une métrique." };
  const res = await guarded("content.metric", async (userId) => {
    const m = await addContentMetric(userId, id.parse(contentId), parsed.data);
    if (!m) return { ok: false, message: "Contenu introuvable." };
    await audit(userId, "content.metrics.added", { entity: "Content", entityId: contentId });
    return { ok: true, message: "Snapshot de métriques ajouté (l'historique est conservé)." };
  });
  revalidatePath(`/contents/${contentId}`);
  return res;
}

export async function duplicateContentAction(contentId: string) {
  let newId: string | null = null;
  await guarded("content.duplicate", async (userId) => {
    newId = (await duplicateContent(userId, id.parse(contentId)))?.id ?? null;
    return { ok: Boolean(newId) };
  });
  if (newId) redirect(`/contents/${newId}`);
}

export async function archiveContentAction(contentId: string, archived: boolean) {
  await guarded("content.archive", async (userId) => ({ ok: await archiveContent(userId, id.parse(contentId), archived) }));
  revalidatePath("/contents");
  revalidatePath(`/contents/${contentId}`);
}

export async function deleteContentAction(contentId: string) {
  await guarded("content.delete", async (userId) => ({ ok: await deleteContent(userId, id.parse(contentId)) }));
  revalidatePath("/contents");
  redirect("/contents");
}
