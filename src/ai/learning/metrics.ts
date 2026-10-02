import type { AnalyticsDataset } from "@/domain/analytics/dataset";
import type { EvalMetric } from "@/domain/recommendations/types";
import { averageTicketCents, summarizeRevenue } from "@/domain/revenue/metrics";
import { clientAggregates } from "@/domain/clients/metrics";
import { publishedIn } from "@/domain/content/stats";
import { latestSnapshot } from "@/domain/analytics/social";
import type { Period } from "@/lib/dates";

/** Valeur d'une métrique d'évaluation sur une fenêtre — réutilise les définitions uniques du domaine. */
export function evalMetricValue(metric: EvalMetric, ds: AnalyticsDataset, p: Period): number | null {
  switch (metric) {
    case "revenue":
      return summarizeRevenue(ds.revenues, p).totalCents;
    case "clientsServed":
      return clientAggregates(ds.appointments, ds.revenues, p, ds.now).clientsServed;
    case "newClients":
      return clientAggregates(ds.appointments, ds.revenues, p, ds.now).newClients;
    case "recurrence":
      return clientAggregates(ds.appointments, ds.revenues, p, ds.now).recurrenceRate;
    case "avgTicket":
      return averageTicketCents(ds.revenues, ds.appointments, p);
    case "contentsPublished":
      return publishedIn(ds.contents, p).length;
    case "views": {
      const pubs = publishedIn(ds.contents, p).filter((c) => c.latest);
      return pubs.length ? pubs.reduce((s, c) => s + c.latest!.views, 0) / pubs.length : null;
    }
    case "followers": {
      const end = latestSnapshot(ds.socialMetrics, "INSTAGRAM", p.end)?.followers ?? null;
      const start = latestSnapshot(ds.socialMetrics, "INSTAGRAM", p.start)?.followers ?? null;
      return end !== null && start !== null ? end - start : null;
    }
    case "dataCompleteness":
      return (ds.appointments.length > 0 ? 1 : 0) + (ds.socialMetrics.length > 0 ? 1 : 0) + (ds.pendingMatchReviews === 0 ? 1 : 0);
  }
}
