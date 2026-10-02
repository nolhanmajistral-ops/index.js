import type { ContentType } from "@prisma/client";
import type { ContentRow } from "@/domain/analytics/dataset";
import { inPeriod, type Period } from "@/lib/dates";
import { overallScore, type ContentScore } from "./scores";

export function publishedIn(contents: ContentRow[], period: Period): ContentRow[] {
  return contents.filter((c) => c.status === "PUBLISHED" && c.publishedAt && inPeriod(c.publishedAt, period));
}

export function bestContent(contents: ContentRow[], scores: Map<string, ContentScore>, period?: Period) {
  const pool = contents.filter((c) => c.status === "PUBLISHED" && c.publishedAt && (!period || inPeriod(c.publishedAt, period)));
  let best: { content: ContentRow; score: number } | null = null;
  for (const c of pool) {
    const s = scores.get(c.id);
    const o = s ? overallScore(s) : null;
    if (o !== null && (!best || o > best.score)) best = { content: c, score: o };
  }
  return best;
}

export interface FormatPerformance {
  type: ContentType;
  count: number;
  avgViews: number | null;
  avgOverall: number | null;
  avgLeads: number | null;
  clients: number;
}

/** Performance par format. Un format n'est jugé qu'à partir de 2 contenus publiés avec métriques. */
export function formatPerformance(contents: ContentRow[], scores: Map<string, ContentScore>): FormatPerformance[] {
  const groups = new Map<ContentType, ContentRow[]>();
  for (const c of contents) {
    if (c.status !== "PUBLISHED" || !c.latest) continue;
    groups.set(c.type, [...(groups.get(c.type) ?? []), c]);
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  return [...groups.entries()]
    .map(([type, list]) => ({
      type,
      count: list.length,
      avgViews: avg(list.map((c) => c.latest!.views)),
      avgLeads: avg(list.map((c) => c.latest!.leads)),
      avgOverall: avg(list.map((c) => { const sc = scores.get(c.id); return sc ? overallScore(sc) : null; }).filter((x): x is number => x !== null)),
      clients: list.reduce((s, c) => s + (scores.get(c.id)?.clientsGenerated ?? 0), 0),
    }))
    .sort((a, b) => (b.avgOverall ?? -1) - (a.avgOverall ?? -1));
}

export function bestFormat(perf: FormatPerformance[]): FormatPerformance | null {
  return perf.find((p) => p.count >= 2 && p.avgOverall !== null) ?? null;
}
