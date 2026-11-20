import { getAnalytics } from "@/domain/analytics/service";
import type { AnalyticsDataset } from "@/domain/analytics/dataset";
import type { BusinessSnapshot } from "@/domain/analytics/snapshot";
import { overallScore } from "@/domain/content";
import { getAIProvider, type AISource, type AIStreamHandlers } from "@/ai/providers";
import { cleanText, STYLE_RULES } from "@/ai/style/humanize";
import { VIDEO_IDEAS, STORY_IDEAS } from "@/ai/coach/deterministic";
import { getProfile } from "@/repositories/profile";
import { audit } from "@/repositories/audit";
import { CONTENT_TYPE_LABEL } from "@/lib/labels";
import { formatDateFr } from "@/lib/dates";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { HOOK_FORMULAS, STUDIO_BASE, STUDIO_METHODS } from "./methods";
import { getStudioMode, type StudioModeId } from "./modes";

export interface StudioResult {
  text: string;
  mode: "llm" | "deterministic";
  model?: string;
  notice?: string;
  sources?: AISource[];
}

type Inputs = Record<string, string>;
type Profile = Awaited<ReturnType<typeof getProfile>>;

const chf = (c: number) => Math.round(c / 100);

/** Contenus récents mesurés (titres, formats, accroches, métriques) : jamais de donnée client. */
export function recentContents(ds: AnalyticsDataset, s: BusinessSnapshot, limit = 15) {
  return ds.contents
    .filter((c) => c.status === "PUBLISHED" && c.publishedAt && !c.archivedAt)
    .sort((a, b) => b.publishedAt!.getTime() - a.publishedAt!.getTime())
    .slice(0, limit)
    .map((c) => {
      const sc = s.content.scores.get(c.id);
      return {
        titre: c.title,
        format: CONTENT_TYPE_LABEL[c.type] ?? c.type,
        plateforme: c.platform,
        accroche: c.hook,
        publieLe: c.publishedAt!.toISOString().slice(0, 10),
        vues: c.latest?.views ?? null,
        enregistrements: c.latest?.saves ?? null,
        partages: c.latest?.shares ?? null,
        commentaires: c.latest?.comments ?? null,
        visitesProfil: c.latest?.profileVisits ?? null,
        abonnesGagnes: c.latest?.followersGained ?? null,
        score: sc ? overallScore(sc) : null,
        demo: c.source === "DEMO" || undefined,
      };
    });
}

/** Contexte « marque » envoyé au modèle : profil, tarifs, planning à venir, ce qui marche en contenu. */
export function buildStudioContext(s: BusinessSnapshot, profile: Profile) {
  return {
    salon: { prenom: profile?.displayName ?? "Nolhan", ville: profile?.city ?? "Lausanne", instagram: profile?.instagramHandle ?? null, tiktok: profile?.tiktokHandle ?? null, reservation: profile?.usesPlanity ? "Planity (lien en bio)" : "lien en bio" },
    tarifs: s.services.map((x) => ({ prestation: x.name, prixCHF: chf(x.priceCents) })),
    planning7ProchainsJours: s.planning.nextDays.map((d) => ({ jour: d.day, rdvReserves: d.booked })),
    joursLesPlusCreux8sem: s.planning.quietestDays,
    abonnes: { instagram: s.social.instagram.latestFollowers, tiktok: s.social.tiktok.latestFollowers },
    contenu: {
      publiesCetteSemaine: s.content.publishedWeek,
      publiesCeMois: s.content.publishedMonth,
      formatsQuiMarchent: s.content.formats
        .filter((f) => f.count > 0)
        .sort((a, b) => (b.avgOverall ?? -1) - (a.avgOverall ?? -1))
        .slice(0, 5)
        .map((f) => ({ format: CONTENT_TYPE_LABEL[f.type], contenus: f.count, scoreMoyen: f.avgOverall === null ? null : Math.round(f.avgOverall), vuesMoyennes: f.avgViews === null ? null : Math.round(f.avgViews) })),
      meilleurContenu30j: s.content.best30d ? { titre: s.content.best30d.content.title, accroche: s.content.best30d.content.hook, score: s.content.best30d.score } : null,
    },
    donneesDemo: s.dataQuality.demoData ? "Une partie des données est DEMO (fictive)." : undefined,
  };
}

function formatInputs(modeId: StudioModeId, inputs: Inputs): string {
  const mode = getStudioMode(modeId)!;
  return mode.fields
    .map((f) => {
      const v = inputs[f.name]?.trim();
      if (!v) return null;
      const label = f.options?.find((o) => o.value === v)?.label ?? v;
      return `${f.label} : ${f.kind === "select" ? label : v}`;
    })
    .filter(Boolean)
    .join("\n");
}

/* ───────────── Trames sans IA (aucun texte inventé : modèles à compléter) ───────────── */

function seededPick<T>(items: readonly T[], n: number, seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return [...items].map((x, i) => ({ x, k: Math.imul(h ^ (i + 1), 2654435761) >>> 0 })).sort((a, b) => a.k - b.k).slice(0, n).map((o) => o.x);
}

const NO_AI = "Trame sans IA : ajoute ta clé Anthropic dans Render pour obtenir un texte entièrement rédigé à partir de ta demande.";

export function studioFallback(modeId: StudioModeId, inputs: Inputs, s: BusinessSnapshot, ds: AnalyticsDataset): string {
  const seed = `${modeId}|${JSON.stringify(inputs)}|${s.now.toISOString().slice(0, 10)}`;
  const free = s.planning.nextDays.filter((d) => d.booked === 0).map((d) => d.day);
  const prices = s.services.map((x) => `${x.name} ${chf(x.priceCents)} CHF`).join(", ");
  switch (modeId) {
    case "reel": {
      const hooks = seededPick(HOOK_FORMULAS, 3, seed);
      const d = Number(inputs.duree) || 30;
      return `## Accroches à adapter à ton idée\n${hooks.map((h, i) => `${i + 1}. ${h.nom} : « ${h.exemple} »\n   Modèle : ${h.modele}\n   Écran : ${h.ecran}`).join("\n")}\n\n## Trame (${d} s)\n- 0-2 s : accroche dite + carton écran, du mouvement dès la 1re image\n- 2-7 s : pourquoi ça concerne celui qui regarde\n- 7-${d - 3} s : un plan toutes les 3-4 s, une relance vers ${Math.round(d / 2)} s\n- ${d - 3}-${d} s : le résultat promis + « Réserve, lien en bio »\n- Dernière phrase : reprends un mot de l'accroche\n\n## Ton idée\n${inputs.idee ?? ""}\n\n${NO_AI}`;
    }
    case "caption":
      return `## Rôle\n${inputs.role === "B" ? "B : la légende fait l'accroche (1re ligne courte qui coupe sur un suspense)." : "A : la vidéo a déjà son accroche (1re ligne = contexte ou demande)."}\n\n## Légende à compléter\n{{1re ligne : moins de 125 caractères, sans emoji au début}}\n\n${inputs.sujet ?? ""}\n\n{{1 à 3 petits paragraphes avec ${inputs.motsCles ? `« ${inputs.motsCles} »` : "« barber Lausanne »"} dans une phrase normale}}\n\nRéserve ton créneau, lien en bio.\n\n#barberlausanne #lausanne #barber #degrade #coiffurehomme\n\n${NO_AI}`;
    case "stories": {
      const ideas = seededPick(STORY_IDEAS.slice(1), 3, seed); // la 1re (« dernières places ») sert au sticker
      return `## Stories\n1. [Toi ou tes mains au poste, ce matin] « Journée chargée aujourd'hui »\n2. [Une coupe en cours, gros plan] ${ideas[0]}\n3. [Le résultat] ${ideas[1]}\n4. [Sticker] ${inputs.objectif === "remplir" || free.length ? `« Dernières places ${free[0] ?? "demain"} : {{horaire 1}} et {{horaire 2}}. Réponds pour réserver. »` : ideas[2]}\n5. [Fin] Le résultat du sondage ou le teaser de demain\n\nAprès la story : réponds à chaque personne qui a réagi.\n${free.length ? `\nJours sans rendez-vous : ${free.join(", ")}.` : ""}\n\n${NO_AI}`;
    }
    case "plan": {
      const n = Number(inputs.rythme) || 4;
      const days = ["mardi", "jeudi", "samedi", "lundi", "vendredi"].slice(0, n);
      const ideas = seededPick(VIDEO_IDEAS, n, seed);
      return `## Semaine\n${days.map((d, i) => `- ${d} 18h30 : vidéo « ${ideas[i]!.titre} » (accroche : « ${ideas[i]!.accroche} »)`).join("\n")}\n\n## Stories\nTous les jours, 3 à 5 stories, un sticker en 4e position.${free.length ? ` Story « dernières places » pour : ${free.join(", ")}.` : ""}\n\n## Engagement (20 min par jour)\n5 comptes locaux à forte audience, 3 barbiers du même niveau, 2 partenaires potentiels. Commenter sans vendre.\n\n## Ton actu\n${inputs.actu ?? ""}\n\n${NO_AI}`;
    }
    case "carousel":
      return `## Slides\n1. Couverture : {{6 mots max}} + une ligne de promesse\n2. Pourquoi ça compte (une phrase)\n3. {{Idée 1 : titre de 3 à 7 mots}}\n4. {{Idée 2}}\n5. {{Idée 3}}\n6. {{Idée 4}}\n7. Récap : tout en liste\n8. « Enregistre-le pour ta prochaine coupe »\n\nSujet : ${inputs.sujet ?? ""}\n\n${NO_AI}`;
    case "dm": {
      const t = inputs.type;
      const msg =
        t === "prix" ? `Salut ! ${prices ? `C'est ${prices}.` : "{{tes tarifs}}"} J'ai de la place {{jour + heure}} ou {{jour + heure}}, je te bloque lequel ?`
        : t === "relance" ? `Salut {{prénom}} ! Ça fait {{X}} semaines, ton dégradé doit commencer à pousser 😄 J'ai de la place {{jour + heure}} ou {{jour + heure}}, je te bloque lequel ?`
        : t === "collab" ? `Salut {{nom}} ! J'ai vu {{ce que tu as vu chez eux}}. Idée : {{la collab précise}}. Pour vous : {{ce qu'ils gagnent}}. De mon côté j'aurais besoin de {{ta demande}}. Ça te dit qu'on en parle ?`
        : t === "avis" ? `Merci {{prénom}} ! Content que {{la coupe}} te plaise, à la prochaine au salon 💈`
        : `Merci frérot ! {{une phrase perso sur son commentaire}}`;
      return `## Message\n${msg}\n\nCe que la personne a écrit : ${inputs.contexte ?? ""}\n\n${NO_AI}`;
    }
    case "audit":
      return deterministicAudit(ds, s);
    case "profile":
      return `## Pistes rapides\n- Champ nom (30 caractères) : « Nolhan | Barber Lausanne » ou « Nolhan | Dégradés Lausanne »\n- 1re ligne de bio : pour qui + ce qui change (ex. « Dégradés propres à Lausanne, tu ressors frais »)\n- ${prices ? `Tarifs à mettre en story à la une : ${prices}` : "Story à la une « Tarifs »"}\n- Épingle : ta meilleure transformation, tes tarifs, une vidéo où tu te présentes\n- Stories à la une : Tarifs, Avant/Après, Avis, Salon, Réserver\n- Lien : directement ta page de réservation\n\n${NO_AI}`;
    case "repurpose":
      return `## Méthode\n1. Repère dans ton texte : les phrases qui font réagir, les chiffres, les histoires, les explications, les erreurs avouées, les phrases à citer.\n2. Histoire ou avis tranché → vidéo ; explication ou liste → carrousel ; phrase forte → story.\n3. Une publication par élément, chacune compréhensible seule.\n\n${NO_AI}`;
    case "trends":
      return `Les tendances du moment demandent la recherche web, disponible quand l'IA est connectée. Je ne vais pas t'en inventer.\n\n## Formats qui marchent durablement dans la niche (bonnes pratiques)\n${seededPick(VIDEO_IDEAS, 3, seed).map((v, i) => `${i + 1}. ${v.titre} : « ${v.accroche} »`).join("\n")}\n\n${NO_AI}`;
    case "comment":
      return `## Deux pistes\n1. Ton vécu en 2 phrases : « {{ce qui t'est arrivé de pareil au salon, avec un détail précis}} »\n2. La vraie question : « {{la question précise que le post n'a pas traitée}} »\n\nJamais « Trop bien 🔥 », jamais de pub ni de lien.\n\n${NO_AI}`;
  }
}

/** Audit calculé sans IA : multiple de vues vs médiane, top et bas du classement. */
export function deterministicAudit(ds: AnalyticsDataset, s: BusinessSnapshot): string {
  const items = recentContents(ds, s, 30).filter((c) => c.vues !== null);
  if (items.length < 3) return `Données insuffisantes pour conclure. Il faut au moins 3 contenus publiés avec leurs vues (Contenus → ajouter les statistiques), idéalement une dizaine.`;
  const sorted = [...items].map((c) => c.vues!).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]! || 1;
  const ranked = items.map((c) => ({ ...c, multiple: c.vues! / median })).sort((a, b) => b.multiple - a.multiple);
  const line = (c: (typeof ranked)[number]) => `- ${c.multiple.toFixed(1)}x « ${c.titre} » (${c.format}, ${c.vues} vues${c.enregistrements !== null ? `, ${c.enregistrements} enregistrements` : ""}${c.partages !== null ? `, ${c.partages} partages` : ""})`;
  const top = ranked.slice(0, 3);
  const bottom = ranked.slice(-3).reverse();
  const topFormats = [...new Set(top.map((c) => c.format))];
  return `## Ce que disent tes chiffres (${items.length} contenus, médiane ${median} vues)\nMeilleurs (multiple de ta médiane) :\n${top.map(line).join("\n")}\n\nMoins bons :\n${bottom.map(line).join("\n")}\n\n## Lecture\n- Formats en tête : ${topFormats.join(", ")}.${items.length < 6 ? "\n- Moins de 6 contenus mesurés : tendance à confirmer, pas encore une conclusion." : ""}\n- Peu de vues = accroche (2 premières secondes) à revoir. Des vues sans abonnés = profil à revoir.\n\n${NO_AI}`;
}

/** Studio contenu : génère un livrable prêt à poster, fondé sur les données de Nolhan. */
export async function runStudio(userId: string, modeId: StudioModeId, inputs: Inputs, handlers: AIStreamHandlers = {}): Promise<StudioResult> {
  const [{ ds, snapshot }, profile] = await Promise.all([getAnalytics(userId), getProfile(userId)]);
  await audit(userId, "ai.studio.generated", { metadata: { mode: modeId } });
  const provider = getAIProvider();
  if (!provider.isConfigured()) return { text: studioFallback(modeId, inputs, snapshot, ds), mode: "deterministic", notice: "Mode sans IA" };

  const mode = getStudioMode(modeId)!;
  const context = buildStudioContext(snapshot, profile);
  const contents = modeId === "audit" || modeId === "plan" || modeId === "reel" ? `\n\n<contenus_recents>\n${JSON.stringify(recentContents(ds, snapshot))}\n</contenus_recents>` : "";
  const request = {
    system: `${STUDIO_BASE}\n\n${STYLE_RULES}\n\n${STUDIO_METHODS[modeId]}`,
    messages: [{ role: "user" as const, content: `<donnees_nolhan_os date="${formatDateFr(snapshot.now)}">\n${JSON.stringify(context)}\n</donnees_nolhan_os>${contents}\n\nDemande (${mode.label}) :\n${formatInputs(modeId, inputs) || "(aucune précision)"}` }],
    maxTokens: 16000,
    webSearch: Boolean(mode.webSearch) && getEnv().AI_WEB_SEARCH,
  };
  try {
    const completion = provider.stream ? await provider.stream(request, handlers) : await provider.complete(request);
    return { text: cleanText(completion.text), mode: "llm", model: completion.model, sources: completion.sources };
  } catch (e) {
    logger.warn("ai.studio.llm_failed", { error: e as Error });
    return { text: studioFallback(modeId, inputs, snapshot, ds), mode: "deterministic", notice: "L'IA n'a pas répondu : trame sans IA affichée." };
  }
}
