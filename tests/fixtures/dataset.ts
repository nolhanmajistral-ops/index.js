import { emptyDataset, type AnalyticsDataset, type ContentRow } from "@/domain/analytics/dataset";
import type { AppointmentRow, RevenueRow } from "@/domain/revenue/types";

export const NOW = new Date("2026-10-02T12:00:00Z"); // vendredi
let seq = 0;
const id = (p: string) => `${p}${++seq}`;

export function appt(clientId: string | null, startsAt: string, serviceName = "Coupe", priceCents = 4000, status: AppointmentRow["status"] = "COMPLETED"): AppointmentRow {
  return { id: id("a"), clientId, serviceId: null, serviceName, startsAt: new Date(startsAt), status, priceCents, source: "MANUAL" };
}

export function revFor(a: AppointmentRow, over: Partial<RevenueRow> = {}): RevenueRow {
  return { id: id("r"), amountCents: a.priceCents, occurredAt: a.startsAt, source: a.source, kind: "SERVICE", clientId: a.clientId, serviceId: null, appointmentId: a.id, isEstimated: false, reviewStatus: "OK", ...over };
}

export function withAppointments(appts: AppointmentRow[], base: Partial<AnalyticsDataset> = {}): AnalyticsDataset {
  const ds = { ...emptyDataset(NOW), ...base };
  ds.appointments = appts;
  ds.revenues = appts.filter((a) => a.status === "COMPLETED").map((a) => revFor(a));
  ds.clients = [...new Set(appts.map((a) => a.clientId).filter(Boolean))].map((cid) => ({ id: cid as string, createdAt: new Date("2026-01-01"), acquisitionChannel: "UNKNOWN" as const, originContentId: null, source: "MANUAL" as const }));
  return ds;
}

export function content(over: Partial<ContentRow> & { views?: number; leads?: number; profileVisits?: number }): ContentRow {
  const { views, leads, profileVisits, ...rest } = over;
  return {
    id: id("c"), platform: "INSTAGRAM", type: "TRANSFORMATION", status: "PUBLISHED", title: "Contenu", hook: null,
    publishedAt: new Date("2026-09-20T10:00:00Z"), plannedAt: null, archivedAt: null, source: "MANUAL",
    latest: views === undefined ? null : { capturedAt: NOW, views, likes: Math.round(views * 0.05), comments: Math.round(views * 0.005), shares: Math.round(views * 0.003), saves: Math.round(views * 0.004), followersGained: Math.round(views * 0.002), profileVisits: profileVisits ?? Math.round(views * 0.02), messages: 0, leads: leads ?? 0 },
    ...rest,
  };
}
