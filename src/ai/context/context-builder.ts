import type { BusinessSnapshot } from "@/domain/analytics/snapshot";
import type { Anomaly } from "@/domain/analytics/anomalies";
import type { ActionCandidate } from "@/domain/recommendations/types";
import { CHANNEL_LABEL, CONTENT_TYPE_LABEL, GOAL_LABEL } from "@/lib/labels";

/**
 * ContextBuilder : construit un CONTEXTE RÉSUMÉ pour le modèle.
 * Jamais la base entière, jamais de données personnelles (noms, emails, téléphones de clients) :
 * uniquement des agrégats, des titres de contenus, des objectifs et l'historique d'apprentissage.
 */
export interface AiContextExtras {
  memories: { kind: string; content: string }[];
  recentRecommendations: { action: string; status: string; outcome: string | null; createdAt: Date }[];
  experiments: { hypothesis: string; status: string; conclusion: string | null; outcome: string | null }[];
  nextMove: ActionCandidate | null;
  profile: { activity: string; city: string } | null;
}

const chf = (c: number | null | undefined) => (c === null || c === undefined ? null : Math.round(c / 100));
const pct = (r: number | null | undefined) => (r === null || r === undefined ? null : Math.round(r * 100));

export function buildAiContext(s: BusinessSnapshot, anomalies: Anomaly[], x: AiContextExtras) {
  return {
    generatedAt: s.now.toISOString(),
    profil: x.profile,
    devise: "CHF",
    qualiteDonnees: {
      ...s.dataQuality,
      note: s.dataQuality.demoData ? "ATTENTION : une partie des données est marquée DEMO (fictive)." : undefined,
    },
    business: {
      caSemaine: chf(s.revenue.week.totalCents),
      caSemainePrecedenteADate: chf(s.revenue.prevWeekToDate.totalCents),
      caMois: chf(s.revenue.month.totalCents),
      caMoisPrecedent: chf(s.revenue.prevMonth.totalCents),
      croissanceMoisADatePct: pct(s.revenue.growthMonth),
      caParSourceMois: Object.fromEntries(Object.entries(s.revenue.month.bySource).map(([k, v]) => [k, chf(v)])),
      caAVerifier: chf(s.revenue.month.pendingReviewCents),
      caEstimeMois: chf(s.revenue.month.estimatedCents),
      panierMoyenMois: chf(s.revenue.avgTicketMonth),
      panierMoyen8Semaines: chf(s.revenue.avgTicket8w),
      prestationsSemaine: s.revenue.servicesWeek,
      mixServices8Semaines: s.revenue.mix8w.map((m) => ({ service: m.serviceName, nombre: m.count, partPct: pct(m.share) })),
      caParCanalMois: Object.fromEntries(Object.entries(s.revenue.byChannelMonth).map(([k, v]) => [CHANNEL_LABEL[k] ?? k, chf(v)])),
      caHebdo8Semaines: s.revenue.weeklySeries.map((w) => chf(w.totalCents)),
    },
    clients: {
      total: s.clients.total,
      semaine: { servis: s.clients.week.clientsServed, nouveaux: s.clients.week.newClients },
      mois: { servis: s.clients.month.clientsServed, nouveaux: s.clients.month.newClients, recurrencePct: pct(s.clients.month.recurrenceRate) },
      actifs60j: s.clients.month.activeClients,
      frequenceMoyenneJours: s.clients.eightWeeks.avgFrequencyDays === null ? null : Math.round(s.clients.eightWeeks.avgFrequencyDays),
      clientsEnRetardDeVisite: s.clients.overdue.length,
      partSourceInconnuePct: pct(s.clients.unknownChannelShare),
    },
    reseaux: {
      instagram: { statut: s.social.instagram.status, abonnes: s.social.instagram.latestFollowers, delta30j: s.social.instagram.followersDelta30d, snapshots: s.social.instagram.snapshots },
      tiktok: { statut: s.social.tiktok.status, abonnes: s.social.tiktok.latestFollowers, delta30j: s.social.tiktok.followersDelta30d, snapshots: s.social.tiktok.snapshots },
    },
    contenu: {
      publiesSemaine: s.content.publishedWeek,
      publiesMois: s.content.publishedMonth,
      enPreparation: s.content.pipeline,
      meilleurContenu30j: s.content.best30d ? { titre: s.content.best30d.content.title, format: CONTENT_TYPE_LABEL[s.content.best30d.content.type], hook: s.content.best30d.content.hook, score: s.content.best30d.score } : null,
      formats: s.content.formats.map((f) => ({ format: CONTENT_TYPE_LABEL[f.type], contenus: f.count, vuesMoyennes: f.avgViews === null ? null : Math.round(f.avgViews), leadsMoyens: f.avgLeads, scoreMoyen: f.avgOverall === null ? null : Math.round(f.avgOverall), clientsAttribues: f.clients })),
    },
    planity: { statut: s.planity.status, imports: s.planity.imports, rdvSemaine: s.planity.appointmentsWeek, rdvAVenir: s.planity.upcoming, tauxAbsencePct: pct(s.planity.noShowRate8w) },
    objectifs: s.goals.map((g) => ({
      objectif: GOAL_LABEL[g.metric]?.label ?? g.metric,
      cible: GOAL_LABEL[g.metric]?.unit === "chf" ? chf(g.target) : g.target,
      reel: g.actual === null ? "Non disponible" : GOAL_LABEL[g.metric]?.unit === "chf" ? chf(g.actual) : g.actual,
      progressionPct: pct(g.progress),
      surLaBonneVoie: g.onTrack,
    })),
    anomalies: anomalies.slice(0, 5).map((a) => ({ titre: a.title, observation: a.observation, causesPossibles: a.possibleCauses, actionATester: a.actionToTest })),
    prochainMove: x.nextMove ? { action: x.nextMove.action, pourquoi: x.nextMove.why, confiance: x.nextMove.confidence } : null,
    memoire: x.memories.slice(0, 20),
    recommandationsPassees: x.recentRecommendations.slice(0, 10).map((r) => ({ action: r.action, statut: r.status, resultat: r.outcome, date: r.createdAt.toISOString().slice(0, 10) })),
    experiences: x.experiments.slice(0, 5),
  };
}

export type AiContext = ReturnType<typeof buildAiContext>;
