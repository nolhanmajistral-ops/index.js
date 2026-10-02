import { prisma } from "@/lib/db";
import type { AnalyticsDataset } from "@/domain/analytics/dataset";
import { revenueRowSelect } from "./revenues";
import { DAY_MS } from "@/lib/dates";

/**
 * Charge le jeu de données interne d'un utilisateur (fenêtre glissante de 400 jours) en un nombre fixe
 * de requêtes parallèles (pas de N+1). Toutes les requêtes sont filtrées par userId.
 */
export async function loadDataset(userId: string, now = new Date()): Promise<AnalyticsDataset> {
  const since = new Date(now.getTime() - 400 * DAY_MS);
  const [profile, appointments, revenues, clients, attributions, contents, metrics, socialMetrics, socialAccounts, goals, leads, missions, services, pendingMatchReviews, importAgg] = await Promise.all([
    prisma.profile.findUnique({ where: { userId }, select: { timezone: true, usesPlanity: true } }),
    prisma.appointment.findMany({ where: { userId, startsAt: { gte: since } }, select: { id: true, clientId: true, serviceId: true, serviceName: true, startsAt: true, status: true, priceCents: true, source: true } }),
    prisma.revenue.findMany({ where: { userId, occurredAt: { gte: since } }, select: revenueRowSelect }),
    prisma.client.findMany({ where: { userId, mergedIntoId: null }, select: { id: true, createdAt: true, acquisitionChannel: true, originContentId: true, source: true } }),
    prisma.attribution.findMany({ where: { userId }, select: { clientId: true, channel: true, confidence: true, contentId: true } }),
    prisma.content.findMany({ where: { userId }, select: { id: true, platform: true, type: true, status: true, title: true, hook: true, publishedAt: true, plannedAt: true, archivedAt: true, source: true } }),
    prisma.contentMetric.findMany({ where: { userId }, orderBy: [{ contentId: "asc" }, { capturedAt: "desc" }], distinct: ["contentId"] }),
    prisma.socialMetric.findMany({ where: { userId, capturedAt: { gte: since } }, select: { platform: true, capturedAt: true, followers: true, views: true, likes: true, comments: true, shares: true, source: true } }),
    prisma.socialAccount.findMany({ where: { userId }, select: { platform: true, status: true, handle: true } }),
    prisma.goal.findMany({ where: { userId, active: true }, select: { id: true, metric: true, target: true } }),
    prisma.lead.findMany({ where: { userId, createdAt: { gte: since } }, select: { id: true, createdAt: true, channel: true, contentId: true, status: true } }),
    prisma.dailyMission.findMany({ where: { userId, date: { gte: new Date(now.getTime() - 30 * DAY_MS) } }, select: { date: true, code: true, status: true } }),
    prisma.service.findMany({ where: { userId, active: true }, select: { name: true, priceCents: true }, orderBy: { priceCents: "asc" } }),
    prisma.clientMatchReview.count({ where: { userId, status: "PENDING" } }),
    prisma.importBatch.aggregate({ where: { userId, status: "COMPLETED", provider: "PLANITY" }, _count: { _all: true }, _max: { createdAt: true } }),
  ]);
  const latestByContent = new Map(metrics.map((m) => [m.contentId, m]));
  return {
    now,
    tz: profile?.timezone ?? "Europe/Zurich",
    appointments,
    revenues,
    clients,
    attributions,
    contents: contents.map((c) => {
      const m = latestByContent.get(c.id);
      return {
        ...c,
        latest: m ? { capturedAt: m.capturedAt, views: m.views, likes: m.likes, comments: m.comments, shares: m.shares, saves: m.saves, followersGained: m.followersGained, profileVisits: m.profileVisits, messages: m.messages, leads: m.leads } : null,
      };
    }),
    socialMetrics,
    socialAccounts,
    goals,
    leads,
    missions,
    services,
    pendingMatchReviews,
    imports: { count: importAgg._count._all, lastAt: importAgg._max.createdAt },
    usesPlanity: profile?.usesPlanity ?? false,
  };
}
