import type { GoalMetric } from "@prisma/client";
import type { AnalyticsDataset } from "@/domain/analytics/dataset";
import { summarizeRevenue } from "@/domain/revenue/metrics";
import { clientAggregates } from "@/domain/clients/metrics";
import { publishedIn } from "@/domain/content/stats";
import { latestSnapshot } from "@/domain/analytics/social";
import { periodOf, previousPeriod, type Period } from "@/lib/dates";

export interface GoalProgress {
  goalId: string;
  metric: GoalMetric;
  target: number;
  actual: number | null; // null = non disponible
  progress: number | null; // actual / target
  gap: number | null; // target - actual
  previous: number | null;
  trend: "up" | "down" | "flat" | null;
  expectedByNow: number | null; // rythme attendu à ce stade de la période
  onTrack: boolean | null;
  unavailableReason?: string;
}

/** Valeur réelle d'une métrique d'objectif sur une période (définition unique). */
export function goalMetricValue(metric: GoalMetric, ds: AnalyticsDataset, period: Period): { value: number | null; reason?: string } {
  switch (metric) {
    case "REVENUE_WEEK":
    case "REVENUE_MONTH":
      return { value: summarizeRevenue(ds.revenues, period).totalCents };
    case "CLIENTS_WEEK":
      return { value: clientAggregates(ds.appointments, ds.revenues, period, ds.now).clientsServed };
    case "NEW_CLIENTS_WEEK":
      return { value: clientAggregates(ds.appointments, ds.revenues, period, ds.now).newClients };
    case "VIDEOS_WEEK":
      return { value: publishedIn(ds.contents, period).length };
    case "VIEWS_WEEK": {
      const pubs = publishedIn(ds.contents, period).filter((c) => c.latest);
      if (!pubs.length) return { value: null, reason: "Aucun contenu publié avec métriques sur la période" };
      return { value: pubs.reduce((s, c) => s + (c.latest?.views ?? 0), 0) };
    }
    case "INSTAGRAM_FOLLOWERS":
    case "TIKTOK_FOLLOWERS": {
      const snap = latestSnapshot(ds.socialMetrics, metric === "INSTAGRAM_FOLLOWERS" ? "INSTAGRAM" : "TIKTOK", new Date(period.end.getTime() - 1));
      return snap ? { value: snap.followers } : { value: null, reason: "Aucun snapshot — ajoutez-en un ou connectez le compte" };
    }
    case "STORIES_DAY":
      return { value: null, reason: "Les stories ne sont pas encore suivies (aucune source de données)" };
  }
}

const PERIOD_UNIT: Record<GoalMetric, "week" | "month" | "day" | "none"> = {
  REVENUE_WEEK: "week",
  REVENUE_MONTH: "month",
  CLIENTS_WEEK: "week",
  NEW_CLIENTS_WEEK: "week",
  VIDEOS_WEEK: "week",
  VIEWS_WEEK: "week",
  STORIES_DAY: "day",
  INSTAGRAM_FOLLOWERS: "none",
  TIKTOK_FOLLOWERS: "none",
};

export function computeGoalProgress(ds: AnalyticsDataset): GoalProgress[] {
  return ds.goals.map((g) => {
    const unit = PERIOD_UNIT[g.metric];
    const current = unit === "none" ? periodOf("day", ds.now, ds.tz) : periodOf(unit, ds.now, ds.tz);
    const prev = unit === "none" ? previousPeriod("month", ds.now, ds.tz) : previousPeriod(unit, ds.now, ds.tz);
    const { value, reason } = goalMetricValue(g.metric, ds, current);
    const previous = goalMetricValue(g.metric, ds, prev).value;
    let expectedByNow: number | null = null;
    if (unit !== "none" && value !== null) {
      const elapsed = (ds.now.getTime() - current.start.getTime()) / (current.end.getTime() - current.start.getTime());
      expectedByNow = Math.round(g.target * Math.min(1, Math.max(0, elapsed)));
    }
    const trend = value === null || previous === null ? null : value > previous ? "up" : value < previous ? "down" : "flat";
    return {
      goalId: g.id,
      metric: g.metric,
      target: g.target,
      actual: value,
      progress: value === null || g.target === 0 ? null : value / g.target,
      gap: value === null ? null : g.target - value,
      previous,
      trend,
      expectedByNow,
      onTrack: value === null ? null : expectedByNow !== null ? value >= expectedByNow : value >= g.target,
      unavailableReason: reason,
    };
  });
}
