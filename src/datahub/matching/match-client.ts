import { jaroWinkler } from "@/datahub/normalization";

export type MatchLevel = "CERTAIN" | "PROBABLE" | "TO_VERIFY" | "UNKNOWN";

export interface MatchableClient {
  id: string;
  normalizedName: string;
  emailHash: string | null;
  phoneHash: string | null;
  sourceKeys?: string[]; // identifiants source (ex. "PLANITY:name:jean dupont")
}

export interface MatchCandidate {
  normalizedName: string;
  emailHash: string | null;
  phoneHash: string | null;
  sourceKey: string | null;
}

export interface MatchResult {
  level: MatchLevel;
  clientId: string | null; // défini uniquement pour CERTAIN (rattachement automatique autorisé)
  candidateId: string | null; // client existant proposé en revue (PROBABLE / TO_VERIFY)
  score: number;
  reasons: string[];
}

export const FUZZY_THRESHOLD = 0.9;

/**
 * Règles :
 *  CERTAIN   : email identique, téléphone identique, ou même identifiant source (même système, même fiche).
 *  PROBABLE  : nom normalisé identique (→ revue manuelle, jamais de fusion automatique).
 *  TO_VERIFY : nom approchant (Jaro-Winkler ≥ 0.9) (→ revue manuelle).
 *  UNKNOWN   : aucune correspondance.
 * Un conflit de contact (emails différents tous deux renseignés) empêche toute proposition sur le nom.
 */
export function matchClient(c: MatchCandidate, existing: MatchableClient[]): MatchResult {
  if (c.emailHash) {
    const hit = existing.find((e) => e.emailHash === c.emailHash);
    if (hit) return { level: "CERTAIN", clientId: hit.id, candidateId: null, score: 1, reasons: ["Email identique"] };
  }
  if (c.phoneHash) {
    const hit = existing.find((e) => e.phoneHash === c.phoneHash);
    if (hit) return { level: "CERTAIN", clientId: hit.id, candidateId: null, score: 1, reasons: ["Téléphone identique"] };
  }
  if (c.sourceKey) {
    const hit = existing.find((e) => e.sourceKeys?.includes(c.sourceKey as string));
    if (hit) return { level: "CERTAIN", clientId: hit.id, candidateId: null, score: 1, reasons: ["Même fiche source (import précédent)"] };
  }
  if (!c.normalizedName) return { level: "UNKNOWN", clientId: null, candidateId: null, score: 0, reasons: [] };

  const compatible = (e: MatchableClient) =>
    !(c.emailHash && e.emailHash && c.emailHash !== e.emailHash) && !(c.phoneHash && e.phoneHash && c.phoneHash !== e.phoneHash);

  const exact = existing.find((e) => e.normalizedName === c.normalizedName && compatible(e));
  if (exact) return { level: "PROBABLE", clientId: null, candidateId: exact.id, score: 0.95, reasons: ["Nom et prénom identiques (normalisés)"] };

  let best: { e: MatchableClient; s: number } | null = null;
  for (const e of existing) {
    if (!compatible(e)) continue;
    const s = jaroWinkler(c.normalizedName, e.normalizedName);
    if (s >= FUZZY_THRESHOLD && (!best || s > best.s)) best = { e, s };
  }
  if (best) return { level: "TO_VERIFY", clientId: null, candidateId: best.e.id, score: Math.round(best.s * 100) / 100, reasons: [`Nom approchant (similarité ${Math.round(best.s * 100)} %)`] };
  return { level: "UNKNOWN", clientId: null, candidateId: null, score: 0, reasons: [] };
}
