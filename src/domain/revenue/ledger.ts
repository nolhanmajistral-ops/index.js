import type { RevenueKind } from "@prisma/client";
import type { RevenueRow } from "./types";
import { localDateKey } from "@/lib/dates";

/** Un rendez-vous ne génère un revenu que s'il est réalisé (COMPLETED) et payant. */
export function appointmentGeneratesRevenue(a: { status: string; priceCents: number }): boolean {
  return a.status === "COMPLETED" && a.priceCents > 0;
}

export type ManualRevenueDecision =
  | { decision: "CREATE" }
  | { decision: "DUPLICATE"; duplicateOfId: string; reason: string }
  | { decision: "REVIEW"; candidateId: string; reason: string };

export interface ManualRevenueCandidate {
  amountCents: number;
  occurredAt: Date;
  clientId: string | null;
  serviceId: string | null;
  kind: RevenueKind;
}

/**
 * Anti double-comptage d'une saisie manuelle face aux revenus existants.
 * 1. même jour + même client + même montant → DOUBLON (non compté)
 * 2. même jour + même client + montant différent (prestation) → REVUE
 * 3. même jour + même montant + même prestation, client inconnu d'un côté → REVUE (ambigu)
 * 4. sinon → création
 */
export function classifyManualRevenue(candidate: ManualRevenueCandidate, existing: RevenueRow[]): ManualRevenueDecision {
  const day = localDateKey(candidate.occurredAt);
  const sameDay = existing.filter((r) => r.reviewStatus === "OK" && localDateKey(r.occurredAt) === day);
  if (candidate.clientId) {
    const sameClient = sameDay.filter((r) => r.clientId === candidate.clientId);
    const exact = sameClient.find((r) => r.amountCents === candidate.amountCents);
    if (exact) return { decision: "DUPLICATE", duplicateOfId: exact.id, reason: "Même client, même jour, même montant qu'un revenu existant" };
    const sameKind = sameClient.find((r) => r.kind === candidate.kind && candidate.kind === "SERVICE");
    if (sameKind) return { decision: "REVIEW", candidateId: sameKind.id, reason: "Le client a déjà une prestation ce jour avec un montant différent" };
  }
  const ambiguous = sameDay.find(
    (r) =>
      r.amountCents === candidate.amountCents &&
      r.kind === candidate.kind &&
      (!candidate.clientId || !r.clientId) &&
      (!candidate.serviceId || !r.serviceId || r.serviceId === candidate.serviceId),
  );
  if (ambiguous) return { decision: "REVIEW", candidateId: ambiguous.id, reason: "Revenu identique le même jour sans client identifiable : possible doublon" };
  return { decision: "CREATE" };
}
