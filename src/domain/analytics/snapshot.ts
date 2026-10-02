import type { AnalyticsDataset } from "./dataset";
import { averageTicketCents, completedAppointments, growth, revenueSeries, serviceMix, summarizeRevenue } from "@/domain/revenue/metrics";
import { clientAggregates, overdueClients, revenueByChannel } from "@/domain/clients/metrics";
import { bestContent, bestFormat, computeContentScores, formatPerformance, publishedIn } from "@/domain/content";
import { socialSummary, weeklyFollowerSeries } from "./social";
import { computeGoalProgress } from "@/domain/goals/progress";
import { lastWeeks, periodOf, previousPeriod, type Period } from "@/lib/dates";
import type { ScoreWeights } from "@/lib/validation/schemas";

function toDate(prev: Period, current: Period, now: Date): Period {
  const elapsed = Math.max(0, now.getTime() - current.start.getTime());
  return { start: prev.start, end: new Date(Math.min(prev.end.getTime(), prev.start.getTime() + elapsed)) };
}

/**
 * BusinessSnapshot : l'unique agrégat consommé par Dashboard, Analyse, Coach IA, Missions et Next Best Action.
 * Toute métrique affichée provient d'ici → définition unique (règle de cohérence).
 */
export function buildSnapshot(ds: AnalyticsDataset, weights?: ScoreWeights) {
  const { now, tz } = ds;
  const day = periodOf("day", now, tz);
  const week = periodOf("week", now, tz);
  const month = periodOf("month", now, tz);
  const year = periodOf("year", now, tz);
  const prevWeek = previousPeriod("week", now, tz);
  const prevMonth = previousPeriod("month", now, tz);
  const weeks = lastWeeks(8, now, tz);

  const rev = {
    today: summarizeRevenue(ds.revenues, day),
    week: summarizeRevenue(ds.revenues, week),
    prevWeek: summarizeRevenue(ds.revenues, prevWeek),
    month: summarizeRevenue(ds.revenues, month),
    prevMonth: summarizeRevenue(ds.revenues, prevMonth),
    year: summarizeRevenue(ds.revenues, year),
    allTime: summarizeRevenue(ds.revenues),
  };
  const weeklySeries = revenueSeries(ds.revenues, weeks);
  const weeksWithRevenue = weeklySeries.filter((w) => w.totalCents > 0);
  const scores = computeContentScores(ds.contents, { social: ds.socialMetrics, clients: ds.clients, attributions: ds.attributions, revenues: ds.revenues }, weights);
  const formats = formatPerformance(ds.contents, scores);
  const hasPlanityData = ds.appointments.some((a) => a.source === "PLANITY") || ds.imports.count > 0;

  return {
    now,
    periods: { day, week, month, year, prevWeek, prevMonth, weeks },
    revenue: {
      ...rev,
      // Comparaisons "à date" : période en cours vs même durée écoulée de la période précédente.
      prevWeekToDate: summarizeRevenue(ds.revenues, toDate(prevWeek, week, now)),
      prevMonthToDate: summarizeRevenue(ds.revenues, toDate(prevMonth, month, now)),
      growthWeek: growth(rev.week.totalCents, summarizeRevenue(ds.revenues, toDate(prevWeek, week, now)).totalCents),
      growthMonth: growth(rev.month.totalCents, summarizeRevenue(ds.revenues, toDate(prevMonth, month, now)).totalCents),
      averageWeekCents: weeksWithRevenue.length ? Math.round(weeksWithRevenue.reduce((s, w) => s + w.totalCents, 0) / weeksWithRevenue.length) : null,
      avgTicketMonth: averageTicketCents(ds.revenues, ds.appointments, month),
      avgTicketPrevMonth: averageTicketCents(ds.revenues, ds.appointments, prevMonth),
      avgTicket8w: averageTicketCents(ds.revenues, ds.appointments, { start: weeks[0]!.start, end: week.end }),
      servicesWeek: completedAppointments(ds.appointments, week).length,
      servicesMonth: completedAppointments(ds.appointments, month).length,
      mixMonth: serviceMix(ds.appointments, ds.revenues, month),
      mix8w: serviceMix(ds.appointments, ds.revenues, { start: weeks[0]!.start, end: week.end }),
      byChannelMonth: revenueByChannel(ds.clients, ds.attributions, ds.revenues, month),
      weeklySeries,
    },
    clients: {
      total: ds.clients.length,
      week: clientAggregates(ds.appointments, ds.revenues, week, now),
      prevWeek: clientAggregates(ds.appointments, ds.revenues, prevWeek, now),
      month: clientAggregates(ds.appointments, ds.revenues, month, now),
      prevMonth: clientAggregates(ds.appointments, ds.revenues, prevMonth, now),
      prevMonthToDate: clientAggregates(ds.appointments, ds.revenues, toDate(prevMonth, month, now), now),
      eightWeeks: clientAggregates(ds.appointments, ds.revenues, { start: weeks[0]!.start, end: week.end }, now),
      overdue: overdueClients(ds.appointments, now),
      unknownChannelShare: ds.clients.length ? ds.clients.filter((c) => c.acquisitionChannel === "UNKNOWN" && !ds.attributions.some((a) => a.clientId === c.id && a.channel !== "UNKNOWN")).length / ds.clients.length : null,
      weeklyNew: weeks.map((w) => ({ start: w.start, ...clientAggregates(ds.appointments, ds.revenues, w, now) })),
    },
    social: {
      instagram: { ...socialSummary(ds.socialMetrics, "INSTAGRAM", now), status: ds.socialAccounts.find((a) => a.platform === "INSTAGRAM")?.status ?? "CONFIGURATION_REQUIRED", series: weeklyFollowerSeries(ds.socialMetrics, "INSTAGRAM", weeks) },
      tiktok: { ...socialSummary(ds.socialMetrics, "TIKTOK", now), status: ds.socialAccounts.find((a) => a.platform === "TIKTOK")?.status ?? "CONFIGURATION_REQUIRED", series: weeklyFollowerSeries(ds.socialMetrics, "TIKTOK", weeks) },
    },
    content: {
      total: ds.contents.filter((c) => !c.archivedAt).length,
      publishedWeek: publishedIn(ds.contents, week).length,
      publishedPrevWeek: publishedIn(ds.contents, prevWeek).length,
      publishedMonth: publishedIn(ds.contents, month).length,
      publishedPrevMonthToDate: publishedIn(ds.contents, toDate(prevMonth, month, now)).length,
      pipeline: ds.contents.filter((c) => !c.archivedAt && ["TO_FILM", "FILMED", "TO_EDIT", "READY"].includes(c.status)).length,
      ideas: ds.contents.filter((c) => !c.archivedAt && c.status === "IDEA").length,
      lastPublishedAt: ds.contents.filter((c) => c.publishedAt && c.status === "PUBLISHED").map((c) => c.publishedAt!).sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
      best30d: bestContent(ds.contents, scores, { start: new Date(now.getTime() - 30 * 86_400_000), end: now }),
      bestAllTime: bestContent(ds.contents, scores),
      formats,
      bestFormat: bestFormat(formats),
      scores,
      weeklyPublished: weeks.map((w) => ({ start: w.start, count: publishedIn(ds.contents, w).length })),
    },
    planity: {
      hasData: hasPlanityData,
      status: ds.imports.count > 0 ? ("CONNECTED_IMPORT" as const) : ("CONFIGURATION_REQUIRED" as const),
      lastImportAt: ds.imports.lastAt,
      imports: ds.imports.count,
      appointmentsWeek: ds.appointments.filter((a) => a.source === "PLANITY" && a.startsAt >= week.start && a.startsAt < week.end && a.status !== "CANCELLED").length,
      upcoming: ds.appointments.filter((a) => a.status === "BOOKED" && a.startsAt > now).length,
      noShowRate8w: (() => {
        const w = ds.appointments.filter((a) => a.startsAt >= weeks[0]!.start && a.startsAt < now && a.status !== "BOOKED");
        return w.length >= 10 ? w.filter((a) => a.status === "NO_SHOW").length / w.length : null;
      })(),
    },
    goals: computeGoalProgress(ds),
    leads: {
      open: ds.leads.filter((l) => l.status === "NEW" || l.status === "CONTACTED").length,
      stale: ds.leads.filter((l) => l.status === "NEW" && now.getTime() - l.createdAt.getTime() > 86_400_000).length,
      month: ds.leads.filter((l) => l.createdAt >= month.start).length,
    },
    dataQuality: {
      hasAppointments: ds.appointments.length > 0,
      hasRevenue: ds.revenues.length > 0,
      hasContentMetrics: ds.contents.some((c) => c.latest),
      hasSocial: ds.socialMetrics.length > 0,
      weeksOfRevenue: weeksWithRevenue.length,
      pendingMatchReviews: ds.pendingMatchReviews,
      revenueNeedsReview: rev.allTime.pendingReviewCount,
      estimatedRevenueMonth: rev.month.estimatedCents,
      demoData: ds.appointments.some((a) => a.source === "DEMO") || ds.contents.some((c) => c.source === "DEMO"),
    },
  };
}

export type BusinessSnapshot = ReturnType<typeof buildSnapshot>;
