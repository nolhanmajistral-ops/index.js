import type { AnalyticsDataset } from "@/domain/analytics/dataset";
import type { BusinessSnapshot } from "@/domain/analytics/snapshot";
import { CONTENT_TYPE_LABEL } from "@/lib/labels";
import type { ActionCandidate } from "./types";

const chf = (cents: number | null | undefined) => (cents === null || cents === undefined ? "—" : `${Math.round(cents / 100)} CHF`);
type Rule = (ds: AnalyticsDataset, s: BusinessSnapshot) => ActionCandidate | null;

/** Règles déterministes. Chaque "why" ne cite que des faits mesurés ; le résultat attendu est formulé comme un objectif à vérifier. */
export const RULES: Rule[] = [
  // ── Mise en place des données ──
  (ds, s) => {
    if (s.dataQuality.hasAppointments) return null;
    return {
      ruleCode: "SETUP_IMPORT_PLANITY", title: "Importer ton export Planity",
      action: "Exporte tes rendez-vous depuis Planity (CSV ou Excel) et importe-les dans NOLHAN OS.",
      why: "Aucun rendez-vous n'est enregistré : impossible de calculer ton CA, tes clients ou ta récurrence.",
      dataUsed: { rendezVous: 0, imports: ds.imports.count },
      expectedResult: "CA, clients et récurrence calculés sur tes vraies données.",
      confidence: "HIGH", criteria: { goalLinked: true, realData: true, feasible: true, measurable: true, learning: false }, urgency: 1,
      evaluation: { metric: "dataCompleteness", horizonDays: 1 },
    };
  },
  (_ds, s) => {
    const ig = s.social.instagram;
    const stale = !ig.latestAt || s.now.getTime() - ig.latestAt.getTime() > 7 * 86_400_000;
    if (!stale) return null;
    return {
      ruleCode: "SETUP_SOCIAL_SNAPSHOT", title: "Ajouter un snapshot Instagram",
      action: "Note tes abonnés et vues Instagram du jour dans Réseaux → Ajouter un snapshot (2 minutes).",
      why: ig.latestAt ? `Dernier snapshot Instagram il y a ${Math.round((s.now.getTime() - ig.latestAt.getTime()) / 86_400_000)} jours : la croissance n'est plus mesurable.` : "Aucun snapshot Instagram : la croissance de ton audience n'est pas mesurable.",
      dataUsed: { snapshotsInstagram: ig.snapshots, dernierSnapshot: ig.latestAt ? ig.latestAt.toISOString().slice(0, 10) : null },
      expectedResult: "Courbe de croissance à jour et objectifs followers suivis.",
      confidence: "HIGH", criteria: { goalLinked: s.goals.some((g) => g.metric === "INSTAGRAM_FOLLOWERS"), realData: true, feasible: true, measurable: true, learning: false }, urgency: 0.45,
      evaluation: { metric: "followers", horizonDays: 7 },
    };
  },
  // ── Business ──
  (ds, s) => {
    const overdue = s.clients.overdue;
    if (overdue.length < 2) return null;
    const revGoal = s.goals.find((g) => g.metric === "REVENUE_MONTH" || g.metric === "REVENUE_WEEK" || g.metric === "CLIENTS_WEEK");
    const behind = revGoal ? revGoal.onTrack === false : false;
    const n = Math.min(5, overdue.length);
    const potential = Math.round((s.revenue.avgTicket8w ?? ds.services[0]?.priceCents ?? 0) * n * 0.3);
    return {
      ruleCode: "REACTIVATE_OVERDUE", title: `Relancer ${n} clients en retard`,
      action: `Envoie un message personnalisé aux ${n} clients réguliers qui ont dépassé leur fréquence habituelle (liste dans Clients → À relancer).`,
      why: `${overdue.length} clients récurrents ne sont pas revenus depuis plus de 1,5× leur intervalle habituel (le plus ancien : ${overdue[0]!.daysSince} jours).${behind ? " Tu es en retard sur ton objectif." : ""}`,
      dataUsed: { clientsEnRetard: overdue.length, joursMax: overdue[0]!.daysSince, panierMoyen8sem: chf(s.revenue.avgTicket8w) },
      expectedResult: `Hypothèse : ~30 % de retours, soit ≈ ${chf(potential)} de CA récupéré sous 14 jours (à vérifier).`,
      confidence: overdue.length >= 4 ? "MEDIUM" : "LOW", criteria: { goalLinked: Boolean(revGoal), realData: true, feasible: true, measurable: true, learning: true }, urgency: behind ? 0.9 : 0.6,
      evaluation: { metric: "clientsServed", horizonDays: 14 },
    };
  },
  (_ds, s) => {
    const mix = s.revenue.mix8w;
    const total = mix.reduce((t, m) => t + m.count, 0);
    const simple = mix.find((m) => m.serviceName.toLowerCase() === "coupe");
    if (!simple || total < 15 || simple.share < 0.45) return null;
    return {
      ruleCode: "UPSELL_BEARD", title: "Proposer la barbe en complément",
      action: "Pendant 1 semaine, propose « + barbe » à chaque client qui vient pour une coupe simple. Note les oui/non.",
      why: `${Math.round(simple.share * 100)} % de tes prestations sur 8 semaines sont des coupes simples (${simple.count}/${total}). Panier moyen actuel : ${chf(s.revenue.avgTicket8w)}.`,
      dataUsed: { partCoupeSimple: `${Math.round(simple.share * 100)} %`, prestations8sem: total, panierMoyen: chf(s.revenue.avgTicket8w) },
      expectedResult: "Objectif mesurable : panier moyen en hausse sur les 7 prochains jours (hypothèse, non garanti).",
      confidence: "MEDIUM", criteria: { goalLinked: s.goals.some((g) => g.metric.startsWith("REVENUE")), realData: true, feasible: true, measurable: true, learning: true }, urgency: 0.5,
      evaluation: { metric: "avgTicket", horizonDays: 7 },
    };
  },
  (_ds, s) => {
    const g = s.goals.find((x) => x.metric === "REVENUE_MONTH");
    if (!g || g.actual === null || g.onTrack !== false || g.expectedByNow === null) return null;
    const gap = g.expectedByNow - g.actual;
    const ticket = s.revenue.avgTicket8w;
    const slots = ticket ? Math.ceil((g.target - g.actual) / ticket) : null;
    return {
      ruleCode: "REVENUE_GAP_FILL", title: "Remplir les créneaux libres",
      action: "Publie une story « créneaux dispo cette semaine » avec le lien Planity, et relance 3 clients réguliers.",
      why: `CA du mois : ${chf(g.actual)} pour un objectif de ${chf(g.target)}. À ce stade du mois, il faudrait ${chf(g.expectedByNow)} (écart ${chf(gap)}).`,
      dataUsed: { caMois: chf(g.actual), objectif: chf(g.target), attenduADate: chf(g.expectedByNow), prestationsManquantes: slots },
      expectedResult: slots ? `Il manque environ ${slots} prestations au panier moyen actuel pour atteindre l'objectif.` : "Réduire l'écart à l'objectif mensuel.",
      confidence: "MEDIUM", criteria: { goalLinked: true, realData: true, feasible: true, measurable: true, learning: true }, urgency: Math.min(1, 0.5 + gap / Math.max(1, g.target)),
      evaluation: { metric: "revenue", horizonDays: 7 },
    };
  },
  // ── Contenu ──
  (_ds, s) => {
    const goal = s.goals.find((g) => g.metric === "VIDEOS_WEEK");
    const daysSince = s.content.lastPublishedAt ? (s.now.getTime() - s.content.lastPublishedAt.getTime()) / 86_400_000 : null;
    const behindGoal = goal && goal.actual !== null && goal.expectedByNow !== null && goal.actual < goal.expectedByNow;
    if (!behindGoal && daysSince !== null && daysSince < 3) return null;
    const best = s.content.bestFormat;
    const fmt = (best ? CONTENT_TYPE_LABEL[best.type] : undefined) ?? "Transformation";
    return {
      ruleCode: "PUBLISH_BEST_FORMAT", title: `Publier une ${fmt.toLowerCase()}`,
      action: `Publie aujourd'hui une vidéo au format « ${fmt} »${best ? " — ton format le plus performant" : ""}, avec un hook dans les 2 premières secondes et un CTA vers Planity.`,
      why: [
        daysSince === null ? "Aucun contenu publié enregistré." : Math.floor(daysSince) === 0 ? "Dernière publication aujourd'hui." : `Dernière publication il y a ${Math.floor(daysSince)} jour(s).`,
        goal && goal.actual !== null ? `Vidéos cette semaine : ${goal.actual}/${goal.target}.` : "",
        best ? `Le format ${fmt} a le meilleur score moyen (${Math.round(best.avgOverall ?? 0)}/100 sur ${best.count} contenus).` : "Pas encore assez de contenus mesurés pour désigner un meilleur format : Transformation est proposé par défaut (hypothèse).",
      ].filter(Boolean).join(" "),
      dataUsed: { joursDepuisDernierePublication: daysSince === null ? null : Math.floor(daysSince), videosSemaine: goal?.actual ?? s.content.publishedWeek, objectifVideos: goal?.target ?? null, meilleurFormat: best ? fmt : null },
      expectedResult: "Objectif mesurable : vues et visites profil du contenu à J+3 comparées à ta moyenne.",
      confidence: best ? "MEDIUM" : "LOW", criteria: { goalLinked: Boolean(goal), realData: Boolean(best) || daysSince !== null, feasible: true, measurable: true, learning: true }, urgency: behindGoal ? 0.75 : 0.55,
      evaluation: { metric: "views", horizonDays: 7 },
    };
  },
  (_ds, s) => {
    if (s.content.pipeline >= 3) return null;
    return {
      ruleCode: "FILM_BATCH", title: "Filmer 3 contenus",
      action: "Bloque 45 minutes entre deux clients pour filmer 3 contenus (une transformation, un conseil, une réaction client).",
      why: `Seulement ${s.content.pipeline} contenu(s) en préparation (à filmer → prêt) : risque de semaine sans publication.`,
      dataUsed: { contenusEnPreparation: s.content.pipeline, idees: s.content.ideas },
      expectedResult: "Au moins 3 contenus au statut « Filmé » ou « Prêt » d'ici demain.",
      confidence: "HIGH", criteria: { goalLinked: s.goals.some((g) => g.metric === "VIDEOS_WEEK"), realData: true, feasible: true, measurable: true, learning: false }, urgency: 0.5,
      evaluation: { metric: "contentsPublished", horizonDays: 7 },
    };
  },
  (_ds, s) => {
    const best = s.content.best30d;
    const sc = best ? s.content.scores.get(best.content.id) : null;
    if (!best || !sc || (sc.acquisition.score ?? 0) < 70) return null;
    return {
      ruleCode: "ANALYZE_BEST_CONTENT", title: "Analyser ton meilleur contenu",
      action: `Revois « ${best.content.title} » : note son hook, sa durée et son CTA, puis prépare une variante.`,
      why: `C'est ton contenu le mieux noté des 30 derniers jours (score global ${best.score}/100, acquisition ${sc.acquisition.score}/100).`,
      dataUsed: { contenu: best.content.title, scoreGlobal: best.score, scoreAcquisition: sc.acquisition.score, clientsAttribues: sc.clientsGenerated },
      expectedResult: "Une variante prête à filmer qui reprend les caractéristiques gagnantes.",
      confidence: "MEDIUM", criteria: { goalLinked: false, realData: true, feasible: true, measurable: false, learning: true }, urgency: 0.35,
      evaluation: { metric: "views", horizonDays: 14 },
    };
  },
  // ── Acquisition ──
  (_ds, s) => {
    if (s.leads.stale === 0) return null;
    return {
      ruleCode: "ANSWER_LEADS", title: "Répondre aux prospects",
      action: `Réponds aux ${s.leads.stale} prospect(s) en attente depuis plus de 24 h et propose un créneau Planity.`,
      why: `${s.leads.stale} lead(s) au statut « Nouveau » depuis plus d'un jour.`,
      dataUsed: { leadsEnAttente: s.leads.stale, leadsOuverts: s.leads.open },
      expectedResult: "Leads passés en « Contacté » aujourd'hui ; conversions suivies dans Clients.",
      confidence: "HIGH", criteria: { goalLinked: s.goals.some((g) => g.metric === "NEW_CLIENTS_WEEK" || g.metric === "CLIENTS_WEEK"), realData: true, feasible: true, measurable: true, learning: true }, urgency: 0.85,
      evaluation: { metric: "newClients", horizonDays: 7 },
    };
  },
  (_ds, s) => {
    const share = s.clients.unknownChannelShare;
    if (share === null || share < 0.4 || s.clients.total < 10) return null;
    return {
      ruleCode: "ASK_ATTRIBUTION", title: "Demander « Comment nous as-tu trouvé ? »",
      action: "Pose la question à chaque nouveau client cette semaine et renseigne la réponse dans sa fiche.",
      why: `Source inconnue pour ${Math.round(share * 100)} % de tes clients : impossible de savoir quels contenus ramènent des clients.`,
      dataUsed: { partSourceInconnue: `${Math.round(share * 100)} %`, clients: s.clients.total },
      expectedResult: "Attribution HIGH pour chaque nouveau client de la semaine.",
      confidence: "HIGH", criteria: { goalLinked: false, realData: true, feasible: true, measurable: true, learning: true }, urgency: 0.3,
      evaluation: { metric: "dataCompleteness", horizonDays: 7 },
    };
  },
  (_ds, s) => {
    const served = s.clients.week.clientsServed;
    if (served < 4) return null;
    return {
      ruleCode: "ASK_REVIEWS", title: "Demander 2 avis Google",
      action: "Demande un avis Google à 2 clients satisfaits aujourd'hui (envoie le lien juste après la prestation).",
      why: `${served} clients servis cette semaine : bon moment pour collecter des avis qui alimentent la visibilité locale.`,
      dataUsed: { clientsServisSemaine: served },
      expectedResult: "2 nouveaux avis (non mesuré automatiquement : à noter dans le résultat de mission).",
      confidence: "LOW", criteria: { goalLinked: false, realData: true, feasible: true, measurable: false, learning: false }, urgency: 0.2,
      evaluation: { metric: "newClients", horizonDays: 14 },
    };
  },
  (_ds, s) => {
    const r = s.planity.noShowRate8w;
    if (r === null || r < 0.08) return null;
    return {
      ruleCode: "CONFIRM_APPOINTMENTS", title: "Confirmer les RDV de demain",
      action: "Envoie un message de confirmation aux clients de demain.",
      why: `Taux d'absence de ${Math.round(r * 100)} % sur 8 semaines.`,
      dataUsed: { tauxAbsence8sem: `${Math.round(r * 100)} %` },
      expectedResult: "Moins d'absences la semaine prochaine (à mesurer).",
      confidence: "MEDIUM", criteria: { goalLinked: true, realData: true, feasible: true, measurable: true, learning: true }, urgency: 0.6,
      evaluation: { metric: "clientsServed", horizonDays: 7 },
    };
  },
  (_ds, s) => {
    if (s.dataQuality.pendingMatchReviews === 0 && s.dataQuality.revenueNeedsReview === 0) return null;
    const n = s.dataQuality.pendingMatchReviews + s.dataQuality.revenueNeedsReview;
    return {
      ruleCode: "RESOLVE_REVIEWS", title: "Vérifier les doublons potentiels",
      action: "Traite la file de revue (Clients → À vérifier, CA → À vérifier) : fusionne ou ignore.",
      why: `${s.dataQuality.pendingMatchReviews} correspondance(s) client et ${s.dataQuality.revenueNeedsReview} revenu(s) à vérifier faussent légèrement les statistiques.`,
      dataUsed: { revuesClients: s.dataQuality.pendingMatchReviews, revenusAVerifier: s.dataQuality.revenueNeedsReview },
      expectedResult: `${n} élément(s) traité(s) : statistiques fiables.`,
      confidence: "HIGH", criteria: { goalLinked: false, realData: true, feasible: true, measurable: true, learning: false }, urgency: 0.25,
      evaluation: { metric: "dataCompleteness", horizonDays: 3 },
    };
  },
];
