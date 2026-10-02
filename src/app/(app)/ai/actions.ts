"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guarded, fieldErrors, type ActionState } from "@/lib/actions";
import { recordRecommendationAction, runLearningCycle, persistInsights } from "@/ai/recommendations/service";
import { askCoach, type CoachReply } from "@/ai/coach/coach";
import { generateContentIdea, type ContentIdea } from "@/ai/content/generator";
import { completeExperiment, createExperiment, deleteMemory, setExperimentStatus } from "@/repositories/ai";
import { MemoryEngine } from "@/ai/memory/memory-engine";
import { contentTypes, experimentSchema, formDataToObject } from "@/lib/validation/schemas";

export async function recommendationAction(id: string, status: "DONE" | "PARTIAL" | "SKIPPED") {
  const parsed = z.object({ id: z.string().min(1).max(40), status: z.enum(["DONE", "PARTIAL", "SKIPPED"]) }).safeParse({ id, status });
  if (!parsed.success) return { ok: false, message: "Requête invalide" };
  const res = await guarded("recommendation", async (userId) => ({ ok: await recordRecommendationAction(userId, parsed.data.id, parsed.data.status) }));
  revalidatePath("/dashboard");
  revalidatePath("/ai");
  return res;
}

const askSchema = z.object({ question: z.string().trim().min(2).max(500), history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(12) });

export async function askCoachAction(input: { question: string; history: { role: "user" | "assistant"; content: string }[] }): Promise<{ reply?: CoachReply; error?: string }> {
  const parsed = askSchema.safeParse(input);
  if (!parsed.success) return { error: "Question invalide." };
  const res = await guarded("coach", async (userId) => ({ ok: true, reply: await askCoach(userId, parsed.data.question, parsed.data.history) }), "ai");
  if ("reply" in res && res.reply) return { reply: res.reply as CoachReply };
  return { error: ("message" in res && res.message) || "Erreur" };
}

export async function generateContentAction(input: { format?: string; brief?: string }): Promise<{ idea?: ContentIdea; error?: string }> {
  const parsed = z.object({ format: z.enum(contentTypes).optional(), brief: z.string().max(500).optional() }).safeParse(input);
  if (!parsed.success) return { error: "Paramètres invalides." };
  const res = await guarded("content.generate", async (userId) => ({ ok: true, idea: await generateContentIdea(userId, parsed.data.format, parsed.data.brief) }), "ai");
  if ("idea" in res && res.idea) return { idea: res.idea as ContentIdea };
  return { error: ("message" in res && res.message) || "Erreur" };
}

export async function runLearningAction(_p: ActionState, _fd: FormData): Promise<ActionState> {
  const res = await guarded("learning", async (userId) => {
    const results = await runLearningCycle(userId);
    const anomalies = await persistInsights(userId);
    return { ok: true, message: `${results.length} recommandation(s) évaluée(s), ${anomalies.length} insight(s) enregistré(s).` };
  });
  revalidatePath("/ai");
  return res;
}

export async function createExperimentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const raw = formDataToObject(fd);
  const parsed = experimentSchema.safeParse({ ...raw, metrics: fd.getAll("metrics") });
  if (!parsed.success) return { ok: false, message: "Vérifie les champs.", fieldErrors: fieldErrors(parsed.error) };
  const res = await guarded("experiment.create", async (userId) => {
    await createExperiment(userId, { ...parsed.data, status: parsed.data.startDate <= new Date() ? "RUNNING" : "PLANNED" });
    await MemoryEngine.remember(userId, "EXPERIMENT_RESULT", `Expérience lancée : ${parsed.data.hypothesis}`);
    return { ok: true, message: "Expérience créée." };
  });
  revalidatePath("/ai");
  return res;
}

export async function completeExperimentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = z.object({ id: z.string().min(1).max(40), conclusion: z.string().trim().min(3).max(1000), outcome: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE", "INCONCLUSIVE"]), actual: z.string().trim().max(1000).optional() }).safeParse(formDataToObject(fd));
  if (!parsed.success) return { ok: false, message: "Vérifie les champs." };
  const res = await guarded("experiment.complete", async (userId) => {
    const r = await completeExperiment(userId, parsed.data.id, { actualResult: { note: parsed.data.actual ?? "" }, conclusion: parsed.data.conclusion, outcome: parsed.data.outcome });
    if (r.count !== 1) return { ok: false, message: "Expérience introuvable." };
    await MemoryEngine.remember(userId, "EXPERIMENT_RESULT", `Résultat d'expérience (${parsed.data.outcome}) : ${parsed.data.conclusion}`, { weight: 1.5 });
    return { ok: true, message: "Expérience clôturée." };
  });
  revalidatePath("/ai");
  return res;
}

export async function abandonExperimentAction(id: string) {
  await guarded("experiment.abandon", async (userId) => ({ ok: (await setExperimentStatus(userId, z.string().max(40).parse(id), "ABANDONED")).count === 1 }));
  revalidatePath("/ai");
}

export async function addPreferenceAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = z.object({ kind: z.enum(["PREFERENCE", "PREFERRED_FORMAT", "AVOIDED_FORMAT", "GOAL", "NOTE"]), content: z.string().trim().min(3).max(500) }).safeParse(formDataToObject(fd));
  if (!parsed.success) return { ok: false, message: "Vérifie les champs." };
  const res = await guarded("memory.add", async (userId) => {
    await MemoryEngine.remember(userId, parsed.data.kind, parsed.data.content);
    return { ok: true, message: "Ajouté à la mémoire." };
  });
  revalidatePath("/ai");
  return res;
}

export async function deleteMemoryAction(id: string) {
  await guarded("memory.delete", async (userId) => ({ ok: await deleteMemory(userId, z.string().max(40).parse(id)) }));
  revalidatePath("/ai");
}
