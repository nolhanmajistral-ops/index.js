import type { BusinessSnapshot } from "@/domain/analytics/snapshot";
import type { Anomaly } from "@/domain/analytics/anomalies";
import type { ActionCandidate } from "@/domain/recommendations/types";
import { CHANNEL_LABEL, CONTENT_TYPE_LABEL, GOAL_LABEL } from "@/lib/labels";

export type CoachIntent =
  | "brief" | "today" | "why" | "content" | "works" | "declining" | "revenue" | "basket" | "clients"
  | "trends" | "noshow" | "reviews" | "pricing" | "filling" | "retention" | "dm" | "stories" | "general";

export const SUGGESTED_QUESTIONS = [
  "Fais-moi mon brief du jour",
  "Comment remplir mes créneaux vides ?",
  "Donne-moi 3 idées de vidéos",
  "Qu'est-ce qui marche en ce moment dans la niche barber ?",
  "Comment faire revenir mes clients plus souvent ?",
  "Comment avoir plus d'avis Google ?",
  "Est-ce que je devrais augmenter mes prix ?",
  "Comment augmenter mon panier moyen ?",
];

/** Ordre = priorité : le premier motif reconnu l'emporte (« marche en ce moment » = tendances, pas « ce qui fonctionne »). */
const INTENT_PATTERNS: [CoachIntent, RegExp][] = [
  ["brief", /brief|bilan du jour|point du jour/],
  ["trends", /tendance|a la mode|en ce moment|actuellement|du moment|\bniche\b/],
  ["noshow", /lapin|absen|no.?show|annul/],
  ["reviews", /\bavis\b|google|etoile/],
  ["pricing", /\bprix\b|tarif/],
  ["filling", /creneau|\bvides?\b|remplir|creux|\btrous?\b|agenda/],
  ["retention", /revenir|fidel|relanc|regulier|reviennent|revienne/],
  ["dm", /\bdms?\b|message|whatsapp|repondre/],
  ["stories", /stor(y|ies|ie)/],
  ["basket", /panier/],
  ["declining", /baiss|chute|recul|diminu/],
  ["works", /fonctionn|marche|performe|meilleur/],
  ["content", /contenu|publier|video|post|reel|tiktok|instagram|idee/],
  ["revenue", /\bca\b|chiffre|revenu|argent|gagner/],
  ["clients", /client/],
  ["why", /^pourquoi/],
  ["today", /aujourd|maintenant|faire|priorit|move/],
];

export function normalizeQuestion(q: string): string {
  return q.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/['’]/g, " ").trim();
}

export function detectIntent(q: string): CoachIntent {
  const s = normalizeQuestion(q);
  return INTENT_PATTERNS.find(([, re]) => re.test(s))?.[0] ?? "general";
}

/** Tirage déterministe (même question + même jour = même choix ; un autre jour = autre sélection). */
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
function pickN<T>(items: readonly T[], n: number, seed: string): T[] {
  const rnd = seeded(seed);
  return [...items].map((x) => ({ x, k: rnd() })).sort((a, b) => a.k - b.k).slice(0, n).map((o) => o.x);
}

/** Idées de vidéos éprouvées dans la niche barber (bonnes pratiques, pas des résultats mesurés chez Nolhan). */
export const VIDEO_IDEAS = [
  { titre: "Avant/après en 3 secondes", accroche: "Il est arrivé comme ça. Regarde comment il repart.", plan: "Plan fixe du client avant, cut sec sur le résultat final, puis le dégradé en accéléré." },
  { titre: "Le dégradé en accéléré", accroche: "Un low taper en 40 minutes, condensé en 15 secondes.", plan: "Caméra fixe derrière le client, accéléré, finir sur le miroir." },
  { titre: "La réaction au miroir", accroche: "Sa tête quand il a vu le résultat.", plan: "Filmer le visage du client au moment où il se découvre (avec son accord)." },
  { titre: "ASMR tondeuse et rasoir", accroche: "Mets le son.", plan: "Gros plans sur la tondeuse, le rasoir et la serviette chaude, aucun texte parlé." },
  { titre: "Quelle coupe pour ta forme de visage", accroche: "Visage rond ? Évite cette coupe.", plan: "3 visages, 3 coupes conseillées, une phrase chacune." },
  { titre: "L'erreur que font 9 clients sur 10", accroche: "Arrête de dire « comme d'habitude » à ton barber.", plan: "Expliquer quoi demander (numéro de sabot, longueur du dessus)." },
  { titre: "POV : ton premier rendez-vous chez moi", accroche: "POV : tu viens pour la première fois.", plan: "Vue subjective de l'entrée au résultat, ambiance du salon." },
  { titre: "Coupe du jour + nom de la coupe", accroche: "Burst fade sur cheveux bouclés.", plan: "Résultat final d'abord, puis 3 étapes clés." },
  { titre: "Coulisses du samedi", accroche: "Samedi, 9 clients, 0 pause.", plan: "Time-lapse de la journée, finir sur le salon rangé." },
  { titre: "Transformation barbe", accroche: "La barbe change tout. Preuve.", plan: "Avant/après de profil, contours au rasoir en gros plan." },
  { titre: "Ce que je ferais avec tes cheveux", accroche: "Envoie-moi ta photo, je te dis quelle coupe.", plan: "Répondre à un commentaire ou un DM d'abonné (avec accord)." },
  { titre: "Le prix d'une coupe expliqué", accroche: "Pourquoi une coupe coûte ce prix chez moi.", plan: "Montrer le temps passé, les étapes, les produits." },
] as const;

export const STORY_IDEAS = [
  "« Dernières places demain : 10h et 15h. Réponds à cette story pour réserver. »",
  "Sondage : « Dégradé bas ou dégradé haut ? » (puis montrer la coupe gagnante)",
  "Avant/après de la journée avec un sticker lien vers la réservation",
  "Boîte à questions : « Pose-moi ta question cheveux / barbe »",
  "Coulisses : préparation du poste le matin, café, playlist",
  "Quiz : « Combien de temps pour un dégradé ? 20, 40 ou 60 min ? »",
] as const;

export const INSUFFICIENT = "Données insuffisantes pour conclure.";
const chf = (c: number | null | undefined) => (c === null || c === undefined ? "Non disponible" : `${Math.round(c / 100)} CHF`);
const pct = (r: number | null | undefined) => (r === null || r === undefined ? "—" : `${r > 0 ? "+" : ""}${Math.round(r * 100)} %`);

export interface CoachAnswer {
  intent: CoachIntent;
  answer: string;
  dataUsed: Record<string, string | number | null>;
  insufficient: boolean;
}

/** Réponses déterministes construites uniquement à partir du BusinessSnapshot. */
export function deterministicAnswer(q: string, s: BusinessSnapshot, anomalies: Anomaly[], move: ActionCandidate | null): CoachAnswer {
  const intent = detectIntent(q);
  const demo = s.dataQuality.demoData ? "\n\n⚠️ Une partie des données est DEMO (fictive)." : "";
  const done = (answer: string, dataUsed: CoachAnswer["dataUsed"], insufficient = false): CoachAnswer => ({ intent, answer: answer + demo, dataUsed, insufficient });

  const seed = `${normalizeQuestion(q)}|${s.now.toISOString().slice(0, 10)}`;
  const ideasBlock = (n: number) => pickN(VIDEO_IDEAS, n, seed).map((v, i) => `${i + 1}. **${v.titre}** : « ${v.accroche} » ${v.plan}`).join("\n");
  const free = s.planning.nextDays.filter((d) => d.booked === 0).map((d) => d.day);

  switch (intent) {
    case "general":
      return done(
        `Je peux t'aider sur : ton brief du jour, remplir tes créneaux vides, des idées de vidéos et de stories, faire revenir tes clients, les avis Google, tes prix, ton panier moyen et les lapins.\n\nEn bref aujourd'hui : CA du mois à date ${chf(s.revenue.month.totalCents)}, ${s.planity.upcoming} rendez-vous à venir, ${s.clients.overdue.length} client(s) régulier(s) à relancer.\n\nPose ta question plus précisément (ex. « Comment remplir mardi ? ») et je te réponds avec tes chiffres.`,
        { caMois: chf(s.revenue.month.totalCents), rdvAVenir: s.planity.upcoming, clientsARelancer: s.clients.overdue.length },
      );
    case "brief": {
      const items: string[] = [];
      if (free.length) items.push(`**Créneaux à remplir** : aucun rendez-vous réservé ${free.slice(0, 3).join(", ")}. Poste une story « dernières places » avec 2 horaires précis.`);
      if (s.clients.overdue.length) items.push(`**Relances** : ${s.clients.overdue.length} client(s) régulier(s) ont dépassé leur rythme habituel. Envoie-leur un message (Clients → À relancer, bouton WhatsApp).`);
      if (s.content.publishedWeek === 0) items.push(`**Contenu** : rien publié cette semaine. Idée du jour : ${ideasBlock(1).replace(/^1\. /, "")}`);
      else if (s.content.bestFormat) items.push(`**Contenu** : ton format qui marche le mieux est ${CONTENT_TYPE_LABEL[s.content.bestFormat.type]} (score moyen ${Math.round(s.content.bestFormat.avgOverall ?? 0)}/100). Refais-en un aujourd'hui.`);
      if (move && items.length < 3) items.push(`**Priorité du système** : ${move.action}`);
      if (!items.length) return done(`${INSUFFICIENT} Ajoute tes rendez-vous dans le Planning et tes contenus publiés pour que je puisse faire ton brief.`, {}, true);
      return done(`Ton brief du jour :\n\n${items.slice(0, 3).map((x, i) => `${i + 1}. ${x}`).join("\n")}`, { joursSansRdv: free.length, clientsARelancer: s.clients.overdue.length, publiesSemaine: s.content.publishedWeek });
    }
    case "today":
      if (!move) return done(`${INSUFFICIENT} Ajoute des rendez-vous (import Planity) et un snapshot Instagram.`, {}, true);
      return done(`**${move.title}**\n\n${move.action}\n\n**Pourquoi :** ${move.why}\n\n**Résultat attendu :** ${move.expectedResult}\n\nConfiance : ${move.confidence}.`, move.dataUsed);
    case "why":
      if (!move) return done(INSUFFICIENT, {}, true);
      return done(`${move.why}\n\nCette action est prioritaire car elle est ${[move.criteria.goalLinked && "liée à un objectif", move.criteria.realData && "basée sur tes données réelles", move.criteria.measurable && "mesurable"].filter(Boolean).join(", ")}.`, move.dataUsed);
    case "content": {
      const best = s.content.bestFormat;
      const top = s.content.best30d;
      if (!best && !top) return done(`${INSUFFICIENT} Il faut au moins 2 contenus publiés par format avec leurs métriques pour savoir ce qui marche chez toi. En attendant, 3 formats qui marchent dans la niche barber (bonnes pratiques) :\n\n${ideasBlock(3)}\n\nPour le script complet, utilise le Studio contenu.`, { contenusPublies: s.content.publishedMonth }, true);
      return done(
        `Publie une **${CONTENT_TYPE_LABEL[best?.type ?? top!.content.type]}**.\n\n${best ? `Ce format a le meilleur score moyen (${Math.round(best.avgOverall ?? 0)}/100 sur ${best.count} contenus, ${best.clients} client(s) attribué(s)).` : ""}${top ? `\nTon meilleur contenu des 30 derniers jours : « ${top.content.title} » (score ${top.score}/100)${top.content.hook ? `, hook : « ${top.content.hook} »` : ""}.` : ""}\n\nIdées à tourner dans ce format :\n${ideasBlock(3)}\n\nMesure : vues et visites profil à J+3 vs ta moyenne. Script complet : Studio contenu.`,
        { meilleurFormat: best ? CONTENT_TYPE_LABEL[best.type] ?? null : null, scoreMoyen: best?.avgOverall ? Math.round(best.avgOverall) : null, publiesSemaine: s.content.publishedWeek },
      );
    }
    case "works": {
      const lines: string[] = [];
      if (s.content.bestFormat) lines.push(`Format le plus performant : ${CONTENT_TYPE_LABEL[s.content.bestFormat.type]} (score moyen ${Math.round(s.content.bestFormat.avgOverall ?? 0)}/100).`);
      const channels = Object.entries(s.revenue.byChannelMonth).filter(([k]) => k !== "UNKNOWN").sort((a, b) => b[1] - a[1]);
      if (channels[0]) lines.push(`Canal qui rapporte le plus de CA ce mois (clients attribués) : ${CHANNEL_LABEL[channels[0][0]]} (${chf(channels[0][1])}).`);
      if (s.revenue.mix8w[0]) lines.push(`Prestation la plus demandée sur 8 semaines : ${s.revenue.mix8w[0].serviceName} (${Math.round(s.revenue.mix8w[0].share * 100)} %).`);
      const ups = anomalies.filter((a) => /UP|SPIKE|ACCELERATION/.test(a.code));
      for (const a of ups) lines.push(`${a.title} : ${a.observation}`);
      if (!lines.length) return done(INSUFFICIENT, {}, true);
      return done(lines.join("\n"), { contenusMesures: s.content.formats.reduce((t, f) => t + f.count, 0) });
    }
    case "declining": {
      const downs = anomalies.filter((a) => /DROP|DOWN|SLOWDOWN|CLIENTS_DOWN/.test(a.code));
      if (!downs.length) {
        if (s.dataQuality.weeksOfRevenue < 4) return done(`${INSUFFICIENT} Il faut au moins 4 semaines de données pour détecter une baisse fiable.`, { semainesDeDonnees: s.dataQuality.weeksOfRevenue }, true);
        return done(`Aucune baisse inhabituelle détectée sur les dernières semaines.\nCA du mois à date : ${chf(s.revenue.month.totalCents)} (${pct(s.revenue.growthMonth)} vs même période du mois précédent).`, { croissanceMois: s.revenue.growthMonth === null ? null : Math.round(s.revenue.growthMonth * 100) });
      }
      return done(downs.map((a) => `**${a.title}**\n${a.observation}\nCauses possibles (hypothèses) : ${a.possibleCauses.join(" ; ")}.\nÀ tester : ${a.actionToTest}`).join("\n\n"), { anomalies: downs.length });
    }
    case "revenue": {
      if (!s.dataQuality.hasRevenue) return done(`${INSUFFICIENT} Aucun revenu enregistré : importe ton export Planity ou saisis tes prestations.`, {}, true);
      const g = s.goals.find((x) => x.metric === "REVENUE_MONTH");
      const lines = [
        `CA du mois à date : ${chf(s.revenue.month.totalCents)} (${pct(s.revenue.growthMonth)} vs même période du mois précédent).`,
        g && g.actual !== null ? `Objectif ${GOAL_LABEL.REVENUE_MONTH!.label} : ${chf(g.target)} — ${Math.round((g.progress ?? 0) * 100)} % atteint, ${g.onTrack ? "dans le rythme" : "en retard sur le rythme"}.` : "Aucun objectif de CA mensuel défini.",
        `Leviers mesurables : ${s.clients.overdue.length} client(s) régulier(s) en retard à relancer ; panier moyen ${chf(s.revenue.avgTicket8w)}.`,
      ];
      if (move) lines.push(`\nAction prioritaire : ${move.action}`);
      return done(lines.join("\n"), { caMois: chf(s.revenue.month.totalCents), clientsARelancer: s.clients.overdue.length });
    }
    case "basket": {
      if (s.revenue.avgTicket8w === null) return done(`${INSUFFICIENT} Aucune prestation réalisée enregistrée.`, {}, true);
      const mix = s.revenue.mix8w.map((m) => `${m.serviceName} ${Math.round(m.share * 100)} %`).join(", ");
      return done(`Panier moyen sur 8 semaines : ${chf(s.revenue.avgTicket8w)} (mois en cours : ${chf(s.revenue.avgTicketMonth)}).\nMix : ${mix}.\n\nAction à tester (hypothèse) : proposer systématiquement « + barbe » aux coupes simples pendant 1 semaine, noter le taux d'acceptation et comparer le panier moyen.`, { panierMoyen8sem: chf(s.revenue.avgTicket8w), mix });
    }
    case "clients": {
      if (!s.dataQuality.hasAppointments) return done(`${INSUFFICIENT} Aucun rendez-vous enregistré.`, {}, true);
      const channels = Object.entries(s.revenue.byChannelMonth).filter(([k]) => k !== "UNKNOWN").sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${CHANNEL_LABEL[k]} (${chf(v)})`);
      return done(
        `Nouveaux clients : ${s.clients.week.newClients} cette semaine, ${s.clients.month.newClients} ce mois. Récurrence du mois : ${s.clients.month.recurrenceRate === null ? "—" : `${Math.round(s.clients.month.recurrenceRate * 100)} %`}.\n${channels.length ? `Canaux qui rapportent le plus : ${channels.join(", ")}.` : "Canaux d'acquisition encore inconnus pour la plupart des clients."}\n\nActions : ${s.clients.overdue.length ? `relancer ${s.clients.overdue.length} client(s) en retard, ` : ""}publier un contenu avec CTA Planity, et demander « Comment nous as-tu trouvé ? » à chaque nouveau client.`,
        { nouveauxSemaine: s.clients.week.newClients, nouveauxMois: s.clients.month.newClients, clientsEnRetard: s.clients.overdue.length },
      );
    }
    case "trends":
      return done(
        `Pour les tendances du moment (coupes, sons, formats qui explosent cette semaine), il faut la recherche web : elle est active quand l'IA est connectée (clé Anthropic). Je ne vais pas t'inventer une tendance.\n\nCe qui marche de façon durable dans la niche barber (bonnes pratiques) :\n${ideasBlock(3)}\n\nCoupes souvent demandées ces derniers temps, à vérifier avant d'en parler : low taper, burst fade, crop texturé, mullet moderne.`,
        {},
      );
    case "noshow": {
      const r = s.planity.noShowRate8w;
      if (r === null) return done(`${INSUFFICIENT} Il faut au moins 10 rendez-vous passés sur 8 semaines (marqués Réalisé/Absent dans le Planning). Bonne pratique en attendant : message de confirmation la veille à chaque client.`, {}, true);
      return done(`Taux d'absence sur 8 semaines : ${Math.round(r * 100)} % (${s.planning.noShow} lapin(s) sur ${s.planning.total + s.planning.noShow} rendez-vous passés).\n\n${r >= 0.1 ? "C'est élevé. " : ""}Actions : confirmation WhatsApp la veille (« Salut, je te confirme demain 14h, à demain ! »), politique claire (« 2e absence = acompte »), et un acompte pour les créneaux du samedi si ça continue.\n\n**Action du jour :** envoie la confirmation à tous tes rendez-vous de demain.`, { tauxAbsencePct: Math.round(r * 100) });
    }
    case "reviews":
      return done(
        `Les avis Google font venir les nouveaux clients du quartier. Méthode (bonne pratique) :\n1. Demande l'avis juste après une coupe réussie, quand le client se regarde dans le miroir.\n2. Rends-le facile : QR code au comptoir ou lien envoyé par WhatsApp dans la minute (« Merci frérot ! Si t'as 20 secondes, un avis m'aide énormément : [lien] »).\n3. Réponds à chaque avis en citant la coupe (« Merci Karim, content que le burst fade te plaise ! »).\n\n${s.clients.week.clientsServed ? `Cette semaine tu as servi ${s.clients.week.clientsServed} client(s) : si 1 sur 3 laisse un avis, ça fait environ ${Math.max(1, Math.round(s.clients.week.clientsServed / 3))} avis de plus par semaine (estimation).` : "Ajoute tes rendez-vous dans le Planning pour suivre combien de clients tu peux solliciter."}\n\n**Action du jour :** demande un avis à tes 3 prochains clients satisfaits.`,
        { clientsServisSemaine: s.clients.week.clientsServed },
      );
    case "pricing": {
      const prices = s.services.map((x) => `${x.name} ${Math.round(x.priceCents / 100)} CHF`).join(", ");
      const upcoming = s.planity.upcoming;
      const full = s.planning.nextDays.filter((d) => d.booked >= 6).length;
      return done(
        `${prices ? `Tes tarifs actuels : ${prices}.` : "Aucun tarif enregistré (Réglages → prestations)."}\n\nRègle du métier : on augmente quand l'agenda est plein à plus de 80-85 % plusieurs semaines de suite, sinon on risque de vider les créneaux. Sur les 7 prochains jours : ${upcoming} rendez-vous réservés, ${full} jour(s) déjà bien remplis (6 rendez-vous ou plus).\n\n${full >= 3 ? "Ton agenda semble chargé : une hausse de 5 CHF sur la prestation la plus demandée est envisageable (hypothèse à tester sur 4 semaines, en surveillant le nombre de rendez-vous)." : "Ton agenda n'est pas encore plein : remplis d'abord les creux, augmente ensuite."}\n\nCompare aussi avec 2-3 barbiers de Lausanne (prix à vérifier sur leurs pages Planity, je ne les invente pas).`,
        { rdvAVenir: upcoming, joursRemplis: full },
      );
    }
    case "filling": {
      const quiet = s.planning.quietestDays;
      return done(
        `${free.length ? `Jours sans aucun rendez-vous sur les 7 prochains jours : ${free.join(", ")}.` : "Tes 7 prochains jours ont tous au moins un rendez-vous."}${quiet.length ? ` Sur 8 semaines, tes jours les plus creux sont ${quiet.join(" et ")}.` : ""}\n\nPour remplir (bonnes pratiques) :\n1. Story « dernières places » avec 2 horaires précis : ${STORY_IDEAS[0]}\n2. ${s.clients.overdue.length ? `Relance tes ${s.clients.overdue.length} client(s) régulier(s) en retard (Clients → À relancer, bouton WhatsApp).` : "Écris à 3 clients réguliers que tu n'as pas vus depuis un moment pour leur proposer un créneau."}\n3. Offre ciblée sur le créneau creux (ex. « mardi matin : barbe offerte avec la coupe ») plutôt qu'une remise générale.\n\n**Action du jour :** poste la story maintenant et envoie 3 messages.`,
        { joursSansRdv: free.length, clientsARelancer: s.clients.overdue.length },
      );
    }
    case "retention": {
      const freq = s.clients.eightWeeks.avgFrequencyDays;
      return done(
        `${freq ? `Tes clients reviennent en moyenne tous les ${Math.round(freq)} jours.` : "Fréquence de retour encore inconnue (il faut au moins 2 visites par client dans le Planning)."} ${s.clients.overdue.length} client(s) régulier(s) ont dépassé leur rythme habituel.\n\nCe qui marche dans la niche :\n1. Proposer le prochain rendez-vous avant qu'il parte (« Je te mets dans 3 semaines, même heure ? »).\n2. Relance personnalisée quand il dépasse son rythme : « Salut Karim, ça fait 5 semaines, ton dégradé doit commencer à pousser 😄 J'ai de la place jeudi 17h ou samedi 10h, je te bloque lequel ? »\n3. Noter dans sa fiche le sabot et ses préférences pour refaire exactement la même coupe.\n\n**Action du jour :** envoie la relance à tes clients en retard (bouton WhatsApp dans Clients).`,
        { frequenceJours: freq ? Math.round(freq) : null, clientsEnRetard: s.clients.overdue.length },
      );
    }
    case "dm":
      return done(
        `Règles qui font répondre (bonnes pratiques) : réponds en moins d'une heure, propose 2 créneaux précis plutôt que « quand tu veux », et finis par une question simple.\n\nExemples prêts à envoyer :\n- Demande de prix : « Salut ! La coupe c'est ${s.services[0] ? Math.round(s.services[0].priceCents / 100) : "XX"} CHF${s.services[1] ? `, ${s.services[1].name.toLowerCase()} ${Math.round(s.services[1].priceCents / 100)} CHF` : ""}. J'ai de la place jeudi 17h ou samedi 10h, je te réserve lequel ? »\n- Client perdu de vue : « Ça fait un moment ! Je t'ai gardé un créneau samedi matin si tu veux, dis-moi. »\n- Après une story : « Merci pour ta réponse ! Tu veux que je te bloque la place ? »`,
        {},
      );
    case "stories":
      return done(`3 à 5 stories par jour suffisent, avec un sticker (sondage, question ou lien) en 3e ou 4e position.\n\nIdées pour aujourd'hui :\n${pickN(STORY_IDEAS, 3, seed).map((x, i) => `${i + 1}. ${x}`).join("\n")}${free.length ? `\n\nTu as des jours sans rendez-vous (${free.slice(0, 2).join(", ")}) : commence par la story « dernières places ».` : ""}`, { joursSansRdv: free.length });
  }
}
