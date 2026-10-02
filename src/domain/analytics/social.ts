import type { Platform } from "@prisma/client";
import type { SocialMetricRow } from "./dataset";
import { DAY_MS, type Period } from "@/lib/dates";

/** Métriques sociales dérivées des SNAPSHOTS (jamais écrasés). */
export function latestSnapshot(rows: SocialMetricRow[], platform: Platform, before?: Date, field: "followers" | "views" = "followers"): SocialMetricRow | null {
  let best: SocialMetricRow | null = null;
  for (const r of rows) {
    if (r.platform !== platform || r[field] === null) continue;
    if (before && r.capturedAt.getTime() > before.getTime()) continue;
    if (!best || r.capturedAt > best.capturedAt) best = r;
  }
  return best;
}

export interface SocialSummary {
  platform: Platform;
  snapshots: number;
  latestFollowers: number | null;
  latestAt: Date | null;
  followersDelta7d: number | null;
  followersDelta30d: number | null;
  growth30d: number | null;
}

export function socialSummary(rows: SocialMetricRow[], platform: Platform, now: Date): SocialSummary {
  const mine = rows.filter((r) => r.platform === platform);
  const latest = latestSnapshot(mine, platform, now);
  const ref = (days: number) => latestSnapshot(mine, platform, new Date(now.getTime() - days * DAY_MS));
  const r7 = ref(7);
  const r30 = ref(30);
  const delta = (r: SocialMetricRow | null) => (latest?.followers != null && r?.followers != null && r !== latest ? latest.followers - r.followers : null);
  return {
    platform,
    snapshots: mine.length,
    latestFollowers: latest?.followers ?? null,
    latestAt: latest?.capturedAt ?? null,
    followersDelta7d: delta(r7),
    followersDelta30d: delta(r30),
    growth30d: latest?.followers != null && r30?.followers ? (latest.followers - r30.followers) / r30.followers : null,
  };
}

/** Série hebdomadaire : dernier snapshot connu à la fin de chaque semaine (null si aucun). */
export function weeklyFollowerSeries(rows: SocialMetricRow[], platform: Platform, weeks: Period[]) {
  return weeks.map((w) => ({ start: w.start, followers: latestSnapshot(rows, platform, new Date(w.end.getTime() - 1))?.followers ?? null }));
}

/** Vues gagnées sur une période = différence de compteurs cumulés (si snapshots disponibles). */
export function viewsGained(rows: SocialMetricRow[], platform: Platform, period: Period): number | null {
  const end = latestSnapshot(rows, platform, new Date(period.end.getTime() - 1), "views");
  const start = latestSnapshot(rows, platform, period.start, "views");
  if (!end || !start || end === start || end.views === null || start.views === null) return null;
  return Math.max(0, end.views - start.views);
}
