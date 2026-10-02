import type { AnalyticsDataset } from "./dataset";
import type { BusinessSnapshot } from "./snapshot";
import { averageTicketCents } from "@/domain/revenue/metrics";
import { clientAggregates } from "@/domain/clients/metrics";
import { publishedIn } from "@/domain/content/stats";
import { latestSnapshot } from "./social";
import type { Period } from "@/lib/dates";

/**
 * Détection d'anomalies. Format : Observation (fait mesuré) / Causes possibles (HYPOTHÈSES) / Action à tester.
 * Aucune cause n'est présentée comme certaine. Pas de détection sans historique suffisant.
 */
export interface Anomaly {
  code: string;
  kind: "ANOMALY" | "TREND";
  title: string;
  observation: string;
  possibleCauses: string[];
  actionToTest: string;
  dataUsed: Record<string, unknown>;
  periodStart: Date;
  periodEnd: Date;
  severity: number; // 0..1
}

const pct = (x: number) => `${x > 0 ? "+" : ""}${Math.round(x * 100)} %`;
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

function contentViews(ds: AnalyticsDataset, p: Period): number | null {
  const pubs = publishedIn(ds.contents, p).filter((c) => c.latest);
  return pubs.length ? pubs.reduce((s, c) => s + c.latest!.views, 0) : null;
}

export function detectAnomalies(ds: AnalyticsDataset, snap: BusinessSnapshot): Anomaly[] {
  const out: Anomaly[] = [];
  const complete = snap.periods.weeks.slice(0, -1); // semaines terminées
  if (complete.length < 4) return out;
  const last = complete.at(-1)!;
  const before = complete.slice(0, -1);

  // 1. Vues : chute / hausse inhabituelle (semaine terminée vs moyenne des précédentes)
  const viewsBefore = before.map((w) => contentViews(ds, w)).filter((v): v is number => v !== null);
  const viewsLast = contentViews(ds, last);
  if (viewsLast !== null && viewsBefore.length >= 3) {
    const avg = mean(viewsBefore);
    const delta = avg > 0 ? (viewsLast - avg) / avg : 0;
    if (delta <= -0.4)
      out.push({
        code: "VIEWS_DROP", kind: "ANOMALY", title: "Chute inhabituelle des vues",
        observation: `Les contenus publiés la semaine dernière cumulent ${Math.round(viewsLast)} vues, contre ${Math.round(avg)} en moyenne sur les ${viewsBefore.length} semaines précédentes (${pct(delta)}).`,
        possibleCauses: ["Moins de contenus publiés ou formats moins performants", "Hooks moins accrocheurs sur les premières secondes", "Variation de distribution de la plateforme (non vérifiable ici)"],
        actionToTest: "Republier cette semaine un format qui a historiquement le mieux performé, avec un hook testé, et comparer les vues à J+3.",
        dataUsed: { viewsLastWeek: viewsLast, avgPreviousWeeks: Math.round(avg), weeksCompared: viewsBefore.length },
        periodStart: last.start, periodEnd: last.end, severity: Math.min(1, -delta),
      });
    else if (delta >= 0.6)
      out.push({
        code: "VIEWS_SPIKE", kind: "TREND", title: "Hausse inhabituelle des vues",
        observation: `${Math.round(viewsLast)} vues la semaine dernière contre ${Math.round(avg)} en moyenne (${pct(delta)}).`,
        possibleCauses: ["Un contenu a été davantage diffusé par l'algorithme", "Format ou sujet qui résonne mieux avec l'audience"],
        actionToTest: "Identifier le contenu responsable et produire 2 variantes du même format cette semaine.",
        dataUsed: { viewsLastWeek: viewsLast, avgPreviousWeeks: Math.round(avg) },
        periodStart: last.start, periodEnd: last.end, severity: Math.min(1, delta / 2),
      });
  }

  // 2. Abonnés : changement inhabituel
  const ig = complete.map((w) => latestSnapshot(ds.socialMetrics, "INSTAGRAM", new Date(w.end.getTime() - 1))?.followers ?? null);
  const deltas: number[] = [];
  for (let i = 1; i < ig.length; i++) if (ig[i] !== null && ig[i - 1] !== null) deltas.push(ig[i]! - ig[i - 1]!);
  if (deltas.length >= 4) {
    const lastDelta = deltas.at(-1)!;
    const prev = deltas.slice(0, -1);
    const avg = mean(prev);
    const sd = Math.sqrt(mean(prev.map((d) => (d - avg) ** 2))) || Math.max(5, Math.abs(avg) * 0.3);
    const z = (lastDelta - avg) / sd;
    if (Math.abs(z) >= 2)
      out.push({
        code: lastDelta < avg ? "FOLLOWERS_SLOWDOWN" : "FOLLOWERS_ACCELERATION", kind: "ANOMALY",
        title: lastDelta < avg ? "Croissance Instagram inhabituellement faible" : "Croissance Instagram inhabituellement forte",
        observation: `${lastDelta >= 0 ? "+" : ""}${lastDelta} abonnés Instagram la semaine dernière contre ${avg >= 0 ? "+" : ""}${Math.round(avg)} par semaine en moyenne.`,
        possibleCauses: lastDelta < avg ? ["Moins de publications ou de stories", "Contenus moins orientés découverte"] : ["Un contenu viral ou une mention externe", "Collaboration ou partage par un tiers"],
        actionToTest: lastDelta < avg ? "Publier 2 contenus de type découverte (transformation/avant-après) avec un CTA « abonne-toi »." : "Analyser le contenu de la semaine et en reprendre la structure.",
        dataUsed: { followersDeltaLastWeek: lastDelta, avgWeeklyDelta: Math.round(avg), weeks: deltas.length },
        periodStart: last.start, periodEnd: last.end, severity: Math.min(1, Math.abs(z) / 4),
      });
  }

  // 3/4. Croisement vues ↔ clients (2 dernières semaines vs 2 précédentes)
  if (complete.length >= 4) {
    const recent: Period = { start: complete.at(-2)!.start, end: last.end };
    const older: Period = { start: complete.at(-4)!.start, end: complete.at(-3)!.end };
    const vR = contentViews(ds, recent), vO = contentViews(ds, older);
    const nR = clientAggregates(ds.appointments, ds.revenues, recent, ds.now).newClients;
    const nO = clientAggregates(ds.appointments, ds.revenues, older, ds.now).newClients;
    const fR = latestSnapshot(ds.socialMetrics, "INSTAGRAM", recent.end)?.followers ?? null;
    const fO = latestSnapshot(ds.socialMetrics, "INSTAGRAM", older.end)?.followers ?? null;
    if (vR !== null && vO && nO >= 3) {
      const dv = (vR - vO) / vO, dn = (nR - nO) / nO;
      if (dv >= 0.2 && dn <= -0.2)
        out.push({
          code: "VIEWS_UP_CLIENTS_DOWN", kind: "ANOMALY", title: "Vues en hausse, nouveaux clients en baisse",
          observation: `Vues ${pct(dv)} mais nouveaux clients ${pct(dn)} (${nR} vs ${nO}) sur les 2 dernières semaines.`,
          possibleCauses: ["L'audience touchée n'est pas locale (hors Lausanne)", "Absence d'appel à l'action vers la réservation", "Contenus divertissants plutôt qu'orientés service"],
          actionToTest: "Ajouter « Réserve sur Planity — lien en bio » et la mention Lausanne sur les 3 prochains contenus, puis comparer les nouveaux clients.",
          dataUsed: { viewsRecent: vR, viewsBefore: vO, newClientsRecent: nR, newClientsBefore: nO },
          periodStart: recent.start, periodEnd: recent.end, severity: Math.min(1, dv - dn),
        });
    }
    if (nO >= 2 && fR !== null && fO !== null && fO > 0) {
      const dn = (nR - nO) / nO, df = (fR - fO) / fO;
      if (dn >= 0.3 && df < 0.01)
        out.push({
          code: "CLIENTS_UP_NO_SOCIAL", kind: "TREND", title: "Clients en hausse sans croissance sociale",
          observation: `Nouveaux clients ${pct(dn)} (${nR} vs ${nO}) alors que les abonnés Instagram sont stables (${pct(df)}).`,
          possibleCauses: ["Bouche-à-oreille ou Google plus actifs", "Effet saisonnier ou visibilité Planity"],
          actionToTest: "Demander systématiquement « Comment nous as-tu trouvé ? » aux nouveaux clients pendant 2 semaines.",
          dataUsed: { newClientsRecent: nR, newClientsBefore: nO, followersRecent: fR, followersBefore: fO },
          periodStart: recent.start, periodEnd: recent.end, severity: 0.4,
        });
    }
  }

  // 5/6. Panier moyen et récurrence (4 dernières semaines vs 4 précédentes)
  const weeks = snap.periods.weeks;
  if (weeks.length >= 8) {
    const recent: Period = { start: weeks.at(-5)!.start, end: weeks.at(-2)!.end };
    const older: Period = { start: weeks[0]!.start, end: weeks.at(-6)!.end };
    const tR = averageTicketCents(ds.revenues, ds.appointments, recent), tO = averageTicketCents(ds.revenues, ds.appointments, older);
    if (tR !== null && tO) {
      const d = (tR - tO) / tO;
      if (Math.abs(d) >= 0.1)
        out.push({
          code: d > 0 ? "AVG_TICKET_UP" : "AVG_TICKET_DOWN", kind: "TREND", title: d > 0 ? "Panier moyen en hausse" : "Panier moyen en baisse",
          observation: `Panier moyen ${Math.round(tR / 100)} CHF sur les 4 dernières semaines contre ${Math.round(tO / 100)} CHF avant (${pct(d)}).`,
          possibleCauses: d > 0 ? ["Plus de prestations combinées (barbe, transformation)"] : ["Moins de prestations barbe/transformation", "Davantage de coupes simples"],
          actionToTest: d > 0 ? "Continuer à proposer la barbe en complément et mesurer sur 2 semaines." : "Proposer « + barbe » à chaque client coupe simple pendant 1 semaine et mesurer le taux d'acceptation.",
          dataUsed: { avgTicketRecent: tR, avgTicketBefore: tO },
          periodStart: recent.start, periodEnd: recent.end, severity: Math.min(1, Math.abs(d) * 2),
        });
    }
    const rR = clientAggregates(ds.appointments, ds.revenues, recent, ds.now).recurrenceRate;
    const rO = clientAggregates(ds.appointments, ds.revenues, older, ds.now).recurrenceRate;
    if (rR !== null && rO !== null && Math.abs(rR - rO) >= 0.15)
      out.push({
        code: rR > rO ? "RECURRENCE_UP" : "RECURRENCE_DOWN", kind: "TREND", title: rR > rO ? "Récurrence en hausse" : "Récurrence en baisse",
        observation: `Taux de récurrence ${Math.round(rR * 100)} % sur les 4 dernières semaines contre ${Math.round(rO * 100)} % avant.`,
        possibleCauses: rR > rO ? ["Clients fidélisés qui reviennent plus régulièrement"] : ["Afflux de nouveaux clients (mécaniquement)", "Clients réguliers qui espacent leurs visites"],
        actionToTest: rR > rO ? "Proposer la prochaine réservation en fin de prestation pour consolider." : "Relancer les clients réguliers en retard sur leur fréquence habituelle.",
        dataUsed: { recurrenceRecent: rR, recurrenceBefore: rO },
        periodStart: recent.start, periodEnd: recent.end, severity: Math.min(1, Math.abs(rR - rO) * 2),
      });
  }
  return out.sort((a, b) => b.severity - a.severity);
}
