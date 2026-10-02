import type { DataSource } from "@prisma/client";
import type { AppointmentRow, RevenueRow } from "./types";
import { inPeriod, type Period } from "@/lib/dates";

/**
 * DÉFINITIONS UNIQUES des métriques de CA (utilisées par Dashboard, Analyse, Coach et Missions).
 *  - CA confirmé : somme des revenus reviewStatus = OK (dédupliqués).
 *  - À vérifier : revenus NEEDS_REVIEW (non inclus dans le CA confirmé).
 *  - Doublons ignorés : DUPLICATE_IGNORED (jamais comptés).
 *  - Estimé : revenus isEstimated = true (signalés séparément).
 *  - Prestations : rendez-vous COMPLETED.
 *  - Panier moyen : CA confirmé des prestations / nombre de prestations réalisées.
 */
export interface RevenueSummary {
  totalCents: number;
  bySource: Record<DataSource, number>;
  pendingReviewCents: number;
  pendingReviewCount: number;
  duplicatesIgnoredCount: number;
  estimatedCents: number;
  transactions: number;
}

const ZERO_SOURCES = (): Record<DataSource, number> => ({ PLANITY: 0, INSTAGRAM: 0, TIKTOK: 0, MANUAL: 0, DEMO: 0 });

export function summarizeRevenue(revenues: RevenueRow[], period?: Period): RevenueSummary {
  const rows = period ? revenues.filter((r) => inPeriod(r.occurredAt, period)) : revenues;
  const s: RevenueSummary = { totalCents: 0, bySource: ZERO_SOURCES(), pendingReviewCents: 0, pendingReviewCount: 0, duplicatesIgnoredCount: 0, estimatedCents: 0, transactions: 0 };
  for (const r of rows) {
    if (r.reviewStatus === "OK") {
      s.totalCents += r.amountCents;
      s.bySource[r.source] += r.amountCents;
      s.transactions++;
      if (r.isEstimated) s.estimatedCents += r.amountCents;
    } else if (r.reviewStatus === "NEEDS_REVIEW") {
      s.pendingReviewCents += r.amountCents;
      s.pendingReviewCount++;
    } else {
      s.duplicatesIgnoredCount++;
    }
  }
  return s;
}

export function completedAppointments(appts: AppointmentRow[], period?: Period): AppointmentRow[] {
  return appts.filter((a) => a.status === "COMPLETED" && (!period || inPeriod(a.startsAt, period)));
}

/** Panier moyen = CA confirmé des prestations / prestations réalisées. null si aucune prestation. */
export function averageTicketCents(revenues: RevenueRow[], appts: AppointmentRow[], period?: Period): number | null {
  const done = completedAppointments(appts, period);
  if (done.length === 0) return null;
  const ids = new Set(done.map((a) => a.id));
  const total = revenues.filter((r) => r.reviewStatus === "OK" && r.appointmentId && ids.has(r.appointmentId)).reduce((s, r) => s + r.amountCents, 0);
  return Math.round(total / done.length);
}

export interface ServiceMixEntry {
  serviceName: string;
  count: number;
  revenueCents: number;
  share: number;
}

export function serviceMix(appts: AppointmentRow[], revenues: RevenueRow[], period?: Period): ServiceMixEntry[] {
  const done = completedAppointments(appts, period);
  const revByAppt = new Map(revenues.filter((r) => r.reviewStatus === "OK" && r.appointmentId).map((r) => [r.appointmentId as string, r.amountCents]));
  const map = new Map<string, { count: number; revenueCents: number }>();
  for (const a of done) {
    const e = map.get(a.serviceName) ?? { count: 0, revenueCents: 0 };
    e.count++;
    e.revenueCents += revByAppt.get(a.id) ?? 0;
    map.set(a.serviceName, e);
  }
  return [...map.entries()]
    .map(([serviceName, e]) => ({ serviceName, ...e, share: done.length ? e.count / done.length : 0 }))
    .sort((a, b) => b.count - a.count);
}

/** Variation relative ; null si la base est nulle (pas de croissance calculable). */
export function growth(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

export function revenueSeries(revenues: RevenueRow[], periods: Period[]): { start: Date; totalCents: number }[] {
  return periods.map((p) => ({ start: p.start, totalCents: summarizeRevenue(revenues, p).totalCents }));
}
