import type { ActionCandidate } from "@/domain/recommendations/types";

export const MAX_DAILY_MISSIONS = 5;

export interface MissionDraftOut {
  code: string;
  title: string;
  why: string;
  action: string;
  priority: number;
  expectedResult: string;
  dataUsed: Record<string, unknown>;
}

/** Au maximum 5 missions par jour, issues des actions candidates déjà priorisées (une par règle). */
export function missionsFromCandidates(candidates: ActionCandidate[]): MissionDraftOut[] {
  const seen = new Set<string>();
  const out: MissionDraftOut[] = [];
  for (const c of candidates) {
    if (seen.has(c.ruleCode)) continue;
    seen.add(c.ruleCode);
    out.push({ code: c.ruleCode, title: c.title, why: c.why, action: c.action, priority: out.length + 1, expectedResult: c.expectedResult, dataUsed: { ...c.dataUsed, confiance: c.confidence } });
    if (out.length === MAX_DAILY_MISSIONS) break;
  }
  return out;
}

/** Règles ignorées au moins 2 fois sur les 7 derniers jours (pour ne pas reproposer en boucle). */
export function recentlySkippedCodes(missions: { date: Date; code: string; status: string }[], now: Date): string[] {
  const since = now.getTime() - 7 * 86_400_000;
  const counts = new Map<string, number>();
  for (const m of missions) if (m.status === "SKIPPED" && m.date.getTime() >= since) counts.set(m.code, (counts.get(m.code) ?? 0) + 1);
  return [...counts.entries()].filter(([, n]) => n >= 2).map(([c]) => c);
}
