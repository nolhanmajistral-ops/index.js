import { z } from "zod";
import type { ContentType } from "@prisma/client";
import type { BusinessSnapshot } from "@/domain/analytics/snapshot";
import { CONTENT_TYPE_LABEL } from "@/lib/labels";
import { getAnalytics } from "@/domain/analytics/service";
import { getAIProvider } from "@/ai/providers";
import { CONTENT_SYSTEM_PROMPT } from "@/ai/prompts/system";
import { logger } from "@/lib/logger";

export const contentIdeaSchema = z.object({
  concept: z.string(),
  hook: z.string(),
  script: z.array(z.string()),
  plans: z.array(z.string()),
  texteEcran: z.array(z.string()),
  cta: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()),
  stories: z.array(z.string()),
  justification: z.string(),
});
export type ContentIdea = z.infer<typeof contentIdeaSchema> & { format: ContentType; mode: "deterministic" | "llm"; disclaimer: string };

const TEMPLATES: Partial<Record<ContentType, { concept: string; hook: string; plans: string[]; script: string[] }>> = {
  TRANSFORMATION: {
    concept: "Transformation complète d'un client, du « avant » au résultat final, en moins de 30 secondes.",
    hook: "Il est arrivé comme ça… regarde jusqu'à la fin.",
    plans: ["Plan serré du « avant » (face + profil)", "Tondeuse en action, gros plan dégradé", "Ciseaux / finitions contours", "Révélation face caméra du client", "Plan final 3/4 avec lumière chaude"],
    script: ["0-2s : avant, texte d'accroche", "2-15s : étapes clés en accéléré", "15-22s : finitions au ralenti", "22-28s : révélation + réaction", "28-30s : CTA réservation"],
  },
  BEFORE_AFTER: {
    concept: "Avant/après en split-screen sur une coupe signature.",
    hook: "Avant / après : tu choisis lequel ?",
    plans: ["Avant (même cadrage)", "Transition sur le claquement de doigts", "Après (même cadrage)", "Détail du dégradé"],
    script: ["0-1s : avant", "1-2s : transition", "2-8s : après + détails", "8-10s : CTA"],
  },
  ADVICE: {
    concept: "Un conseil concret d'entretien entre deux rendez-vous.",
    hook: "L'erreur que 90 % des mecs font avec leur barbe.",
    plans: ["Face caméra au fauteuil", "Démonstration produit", "Résultat"],
    script: ["0-3s : l'erreur", "3-15s : la bonne méthode en 3 étapes", "15-20s : résultat + CTA"],
  },
  FACE_CAMERA: {
    concept: "Prise de parole face caméra : coulisses d'une journée au salon.",
    hook: "Ce qu'on ne te dit jamais sur le métier de barber.",
    plans: ["Face caméra", "B-roll du salon", "Client au fauteuil"],
    script: ["0-3s : affirmation forte", "3-20s : 2-3 points concrets", "20-25s : CTA"],
  },
};

const HASHTAGS = ["#barberlausanne", "#lausanne", "#barber", "#barbershop", "#fade", "#coiffurehomme", "#suisse", "#transformation"];

export function deterministicIdea(s: BusinessSnapshot, requested?: ContentType): ContentIdea {
  const best = s.content.bestFormat;
  const format: ContentType = requested ?? best?.type ?? "TRANSFORMATION";
  const tpl = TEMPLATES[format] ?? TEMPLATES.TRANSFORMATION!;
  const topHook = s.content.best30d?.content.type === format ? s.content.best30d.content.hook : null;
  const justification = best
    ? `Format « ${CONTENT_TYPE_LABEL[best.type]} » : meilleur score moyen de tes contenus (${Math.round(best.avgOverall ?? 0)}/100 sur ${best.count} contenus, ${best.clients} client(s) attribué(s)).${requested && requested !== best.type ? ` Tu as demandé « ${CONTENT_TYPE_LABEL[requested]} » : comparaison utile pour apprendre.` : ""}`
    : "Pas encore assez de contenus mesurés pour identifier ton meilleur format : modèle par défaut (hypothèse à tester).";
  return {
    format,
    mode: "deterministic",
    concept: tpl.concept,
    hook: topHook ? `${topHook} (variante de ton hook le plus performant)` : tpl.hook,
    script: tpl.script,
    plans: tpl.plans,
    texteEcran: [tpl.hook, "Lausanne 📍", "Réserve sur Planity — lien en bio"],
    cta: "Réserve ton créneau sur Planity — lien en bio.",
    caption: `${tpl.concept} 💈 Réservations sur Planity (lien en bio). Lausanne.`,
    hashtags: HASHTAGS,
    stories: ["Story 1 : coulisses du tournage", "Story 2 : sondage « Avant ou après ? »", "Story 3 : créneaux dispos cette semaine + lien Planity"],
    justification,
    disclaimer: "Idée générée à partir de tes données. Aucune garantie de résultat : publie, puis mesure vues, visites profil et clients.",
  };
}

export async function generateContentIdea(userId: string, requested?: ContentType, brief?: string): Promise<ContentIdea> {
  const { snapshot } = await getAnalytics(userId);
  const base = deterministicIdea(snapshot, requested);
  const provider = getAIProvider();
  if (!provider.isConfigured()) return base;
  try {
    const perf = {
      formats: snapshot.content.formats.map((f) => ({ format: CONTENT_TYPE_LABEL[f.type], contenus: f.count, scoreMoyen: f.avgOverall === null ? null : Math.round(f.avgOverall), leadsMoyens: f.avgLeads, clients: f.clients })),
      meilleurContenu: snapshot.content.best30d ? { titre: snapshot.content.best30d.content.title, hook: snapshot.content.best30d.content.hook, score: snapshot.content.best30d.score } : null,
    };
    const res = await provider.complete({
      system: CONTENT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Performances historiques : ${JSON.stringify(perf)}\nFormat demandé : ${CONTENT_TYPE_LABEL[base.format]}\nBrief : ${brief ?? "aucun"}\nProposition de base (à améliorer) : ${JSON.stringify(base)}` }],
      maxTokens: 3000,
    });
    const json = res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1);
    const parsed = contentIdeaSchema.safeParse(JSON.parse(json));
    if (!parsed.success) return base;
    return { ...parsed.data, format: base.format, mode: "llm", disclaimer: base.disclaimer };
  } catch (e) {
    logger.warn("ai.content.llm_failed", { error: e as Error });
    return base;
  }
}
