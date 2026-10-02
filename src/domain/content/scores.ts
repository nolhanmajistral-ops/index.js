import type { ScoreWeights } from "@/lib/validation/schemas";
import type { AttributionRow, ClientRow, ContentRow, SocialMetricRow } from "@/domain/analytics/dataset";
import type { RevenueRow } from "@/domain/revenue/types";

/**
 * Scores de contenu EXPLICABLES (0-100), relatifs à l'historique de Nolhan :
 * chaque facteur est converti en rang percentile parmi ses propres contenus publiés,
 * puis combiné selon des pondérations configurables. Chaque score expose ses facteurs.
 */
export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  visibility: { views: 2, viewsPerFollower: 1, reach: 1 },
  engagement: { likeRate: 1, commentRate: 1.5, shareRate: 2, saveRate: 1.5 },
  acquisition: { profileVisits: 1, followersGained: 1.5, leads: 2.5 },
  business: { clients: 2, revenue: 1 },
};

export type ScoreDimension = "visibility" | "engagement" | "acquisition" | "business";

export interface ScoreFactor {
  key: string;
  label: string;
  value: number | null;
  display: string;
  percentile: number | null;
  weight: number;
}

export interface DimensionScore {
  score: number | null; // null = non disponible
  factors: ScoreFactor[];
  explanation: string;
}

export interface ContentScore {
  contentId: string;
  visibility: DimensionScore;
  engagement: DimensionScore;
  acquisition: DimensionScore;
  business: DimensionScore;
  clientsGenerated: number;
  revenueGeneratedCents: number;
}

interface RawFactors {
  views: number | null;
  viewsPerFollower: number | null;
  reach: number | null; // vues + partages × 10 (proxy de diffusion)
  likeRate: number | null;
  commentRate: number | null;
  shareRate: number | null;
  saveRate: number | null;
  profileVisits: number | null;
  followersGained: number | null;
  leads: number | null;
  clients: number;
  revenue: number;
}

const LABELS: Record<keyof RawFactors, string> = {
  views: "Vues",
  viewsPerFollower: "Vues / follower",
  reach: "Portée (vues + partages)",
  likeRate: "Likes / vue",
  commentRate: "Commentaires / vue",
  shareRate: "Partages / vue",
  saveRate: "Sauvegardes / vue",
  profileVisits: "Visites profil",
  followersGained: "Abonnés gagnés",
  leads: "Leads",
  clients: "Clients attribués",
  revenue: "CA attribué",
};

const DIMENSIONS: Record<ScoreDimension, (keyof RawFactors)[]> = {
  visibility: ["views", "viewsPerFollower", "reach"],
  engagement: ["likeRate", "commentRate", "shareRate", "saveRate"],
  acquisition: ["profileVisits", "followersGained", "leads"],
  business: ["clients", "revenue"],
};

function followersAt(social: SocialMetricRow[], platform: string, at: Date): number | null {
  let best: SocialMetricRow | null = null;
  for (const s of social) {
    if (s.platform !== platform || s.followers === null || s.capturedAt.getTime() > at.getTime()) continue;
    if (!best || s.capturedAt > best.capturedAt) best = s;
  }
  return best?.followers ?? null;
}

/** Part (0-100) des AUTRES contenus strictement inférieurs : un ex æquo à zéro vaut 0, jamais « mieux que la moitié ». */
function percentileRank(values: number[], v: number): number {
  if (values.length <= 1) return 50;
  const below = values.filter((x) => x < v).length;
  return Math.round((below / (values.length - 1)) * 100);
}

function fmt(key: keyof RawFactors, v: number | null): string {
  if (v === null) return "Non disponible";
  if (key.endsWith("Rate")) return `${(v * 100).toFixed(1)} %`;
  if (key === "viewsPerFollower") return v.toFixed(2);
  if (key === "revenue") return `${Math.round(v / 100)} CHF`;
  return new Intl.NumberFormat("fr-CH").format(Math.round(v));
}

export function computeContentScores(
  contents: ContentRow[],
  ctx: { social: SocialMetricRow[]; clients: ClientRow[]; attributions: AttributionRow[]; revenues: RevenueRow[] },
  weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS,
): Map<string, ContentScore> {
  const published = contents.filter((c) => c.status === "PUBLISHED" && c.publishedAt);
  // Clients attribués à un contenu (attribution explicite ou contenu d'origine saisi)
  const clientsByContent = new Map<string, Set<string>>();
  for (const a of ctx.attributions) if (a.contentId) clientsByContent.set(a.contentId, (clientsByContent.get(a.contentId) ?? new Set()).add(a.clientId));
  for (const c of ctx.clients) if (c.originContentId) clientsByContent.set(c.originContentId, (clientsByContent.get(c.originContentId) ?? new Set()).add(c.id));
  const revenueByClient = new Map<string, number>();
  for (const r of ctx.revenues) if (r.reviewStatus === "OK" && r.clientId) revenueByClient.set(r.clientId, (revenueByClient.get(r.clientId) ?? 0) + r.amountCents);

  const raw = new Map<string, RawFactors>();
  for (const c of published) {
    const m = c.latest;
    const clients = clientsByContent.get(c.id) ?? new Set<string>();
    const followers = followersAt(ctx.social, c.platform, c.publishedAt!);
    const views = m ? m.views : null;
    const rate = (x: number | undefined) => (m && m.views > 0 && x !== undefined ? x / m.views : null);
    raw.set(c.id, {
      views,
      viewsPerFollower: m && followers ? m.views / followers : null,
      reach: m ? m.views + m.shares * 10 : null,
      likeRate: rate(m?.likes),
      commentRate: rate(m?.comments),
      shareRate: rate(m?.shares),
      saveRate: rate(m?.saves),
      profileVisits: m ? m.profileVisits : null,
      followersGained: m ? m.followersGained : null,
      leads: m ? m.leads : null,
      clients: clients.size,
      revenue: [...clients].reduce((s, id) => s + (revenueByClient.get(id) ?? 0), 0),
    });
  }

  const distributions = new Map<keyof RawFactors, number[]>();
  for (const key of Object.keys(LABELS) as (keyof RawFactors)[]) {
    distributions.set(key, [...raw.values()].map((r) => r[key]).filter((v): v is number => v !== null));
  }

  const out = new Map<string, ContentScore>();
  for (const [id, f] of raw) {
    const dim = (d: ScoreDimension): DimensionScore => {
      const w = weights[d] as Record<string, number>;
      const factors: ScoreFactor[] = DIMENSIONS[d].map((key) => {
        const v = f[key];
        const dist = distributions.get(key) ?? [];
        return { key, label: LABELS[key], value: v, display: fmt(key, v), percentile: v === null ? null : percentileRank(dist, v), weight: w[key] ?? 0 };
      });
      const usable = factors.filter((x) => x.percentile !== null && x.weight > 0);
      const totalW = usable.reduce((s, x) => s + x.weight, 0);
      if (!usable.length || totalW === 0 || published.length < 3) {
        return { score: null, factors, explanation: published.length < 3 ? "Non disponible : au moins 3 contenus publiés avec métriques sont nécessaires pour comparer." : "Non disponible : métriques manquantes." };
      }
      const score = Math.round(usable.reduce((s, x) => s + (x.percentile as number) * x.weight, 0) / totalW);
      const top = [...usable].sort((a, b) => (b.percentile as number) - (a.percentile as number))[0]!;
      return { score, factors, explanation: `Score relatif à tes ${published.length} contenus publiés. Facteur le plus fort : ${top.label.toLowerCase()} (${top.display}, mieux que ${top.percentile} % de tes contenus).` };
    };
    out.set(id, { contentId: id, visibility: dim("visibility"), engagement: dim("engagement"), acquisition: dim("acquisition"), business: dim("business"), clientsGenerated: f.clients, revenueGeneratedCents: f.revenue });
  }
  return out;
}

/** Score global utilisé pour classer (acquisition et business pèsent plus que la visibilité). */
export function overallScore(s: ContentScore): number | null {
  const parts: [number | null, number][] = [[s.visibility.score, 1], [s.engagement.score, 1], [s.acquisition.score, 2], [s.business.score, 2]];
  const ok = parts.filter((p): p is [number, number] => p[0] !== null);
  if (!ok.length) return null;
  return Math.round(ok.reduce((t, [v, w]) => t + v * w, 0) / ok.reduce((t, [, w]) => t + w, 0));
}
