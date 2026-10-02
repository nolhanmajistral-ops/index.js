import type { AcquisitionChannel } from "@prisma/client";
import type { AppointmentRow, RevenueRow } from "@/domain/revenue/types";
import type { AttributionRow, ClientRow } from "@/domain/analytics/dataset";
import { DAY_MS, inPeriod, type Period } from "@/lib/dates";

/**
 * DÉFINITIONS UNIQUES des métriques clients.
 *  - Visite : rendez-vous COMPLETED rattaché à un client.
 *  - Nouveau client (période) : première visite réalisée dans la période.
 *  - Client actif : au moins une visite dans les 60 derniers jours.
 *  - Client récurrent : au moins 2 visites réalisées.
 *  - Taux de récurrence (période) : part des clients venus dans la période qui avaient déjà une visite avant.
 *  - Fréquence : intervalle moyen (jours) entre deux visites des clients récurrents.
 */
export const ACTIVE_WINDOW_DAYS = 60;

export interface ClientStats {
  clientId: string;
  firstVisit: Date | null;
  lastVisit: Date | null;
  visits: number;
  preferredService: string | null;
  revenueCents: number;
  averageTicketCents: number | null;
  isRecurring: boolean;
  avgIntervalDays: number | null;
}

export function visitsByClient(appts: AppointmentRow[]): Map<string, AppointmentRow[]> {
  const map = new Map<string, AppointmentRow[]>();
  for (const a of appts) {
    if (a.status !== "COMPLETED" || !a.clientId) continue;
    const list = map.get(a.clientId) ?? [];
    list.push(a);
    map.set(a.clientId, list);
  }
  for (const list of map.values()) list.sort((x, y) => x.startsAt.getTime() - y.startsAt.getTime());
  return map;
}

export function computeClientStats(clientId: string, appts: AppointmentRow[], revenues: RevenueRow[]): ClientStats {
  const visits = appts.filter((a) => a.clientId === clientId && a.status === "COMPLETED").sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const revenueCents = revenues.filter((r) => r.clientId === clientId && r.reviewStatus === "OK").reduce((s, r) => s + r.amountCents, 0);
  const counts = new Map<string, number>();
  for (const v of visits) counts.set(v.serviceName, (counts.get(v.serviceName) ?? 0) + 1);
  const preferred = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const intervals: number[] = [];
  for (let i = 1; i < visits.length; i++) intervals.push((visits[i]!.startsAt.getTime() - visits[i - 1]!.startsAt.getTime()) / DAY_MS);
  return {
    clientId,
    firstVisit: visits[0]?.startsAt ?? null,
    lastVisit: visits.at(-1)?.startsAt ?? null,
    visits: visits.length,
    preferredService: preferred,
    revenueCents,
    averageTicketCents: visits.length ? Math.round(revenueCents / visits.length) : null,
    isRecurring: visits.length >= 2,
    avgIntervalDays: intervals.length ? intervals.reduce((s, x) => s + x, 0) / intervals.length : null,
  };
}

export interface ClientAggregates {
  clientsServed: number;
  newClients: number;
  returningClients: number;
  recurrenceRate: number | null;
  activeClients: number;
  recurringClientsTotal: number;
  avgFrequencyDays: number | null;
  revenuePerClientCents: number | null;
}

export function clientAggregates(appts: AppointmentRow[], revenues: RevenueRow[], period: Period, now: Date): ClientAggregates {
  const byClient = visitsByClient(appts);
  let served = 0, fresh = 0, returning = 0, active = 0, recurring = 0;
  const intervals: number[] = [];
  const activeSince = now.getTime() - ACTIVE_WINDOW_DAYS * DAY_MS;
  for (const visits of byClient.values()) {
    const inP = visits.filter((v) => inPeriod(v.startsAt, period));
    if (inP.length) {
      served++;
      if (inPeriod(visits[0]!.startsAt, period)) fresh++;
      else returning++;
    }
    if (visits.some((v) => v.startsAt.getTime() >= activeSince && v.startsAt.getTime() <= now.getTime())) active++;
    if (visits.length >= 2) {
      recurring++;
      for (let i = 1; i < visits.length; i++) intervals.push((visits[i]!.startsAt.getTime() - visits[i - 1]!.startsAt.getTime()) / DAY_MS);
    }
  }
  const periodRevenue = revenues.filter((r) => r.reviewStatus === "OK" && inPeriod(r.occurredAt, period)).reduce((s, r) => s + r.amountCents, 0);
  return {
    clientsServed: served,
    newClients: fresh,
    returningClients: returning,
    recurrenceRate: served ? returning / served : null,
    activeClients: active,
    recurringClientsTotal: recurring,
    avgFrequencyDays: intervals.length ? intervals.reduce((s, x) => s + x, 0) / intervals.length : null,
    revenuePerClientCents: served ? Math.round(periodRevenue / served) : null,
  };
}

/** Canal effectif d'un client : attribution (si connue) sinon canal saisi. */
export function effectiveChannel(client: ClientRow, attributions: Map<string, AttributionRow>): AcquisitionChannel {
  const a = attributions.get(client.id);
  if (a && a.channel !== "UNKNOWN") return a.channel;
  return client.acquisitionChannel;
}

/** CA confirmé par canal d'acquisition des clients. */
export function revenueByChannel(clients: ClientRow[], attributions: AttributionRow[], revenues: RevenueRow[], period?: Period): Record<string, number> {
  const attr = new Map(attributions.map((a) => [a.clientId, a]));
  const channelOf = new Map(clients.map((c) => [c.id, effectiveChannel(c, attr)]));
  const out: Record<string, number> = {};
  for (const r of revenues) {
    if (r.reviewStatus !== "OK" || (period && !inPeriod(r.occurredAt, period))) continue;
    const ch = r.clientId ? (channelOf.get(r.clientId) ?? "UNKNOWN") : "UNKNOWN";
    out[ch] = (out[ch] ?? 0) + r.amountCents;
  }
  return out;
}

/** Clients récurrents en retard sur leur fréquence habituelle (candidats à une relance). */
export function overdueClients(appts: AppointmentRow[], now: Date, minFactor = 1.5, minDays = 35) {
  const out: { clientId: string; daysSince: number; usualInterval: number }[] = [];
  for (const [clientId, visits] of visitsByClient(appts)) {
    const past = visits.filter((v) => v.startsAt.getTime() <= now.getTime());
    if (past.length < 2) continue;
    const futureBooked = appts.some((a) => a.clientId === clientId && a.status === "BOOKED" && a.startsAt.getTime() > now.getTime());
    if (futureBooked) continue;
    const intervals = past.slice(1).map((v, i) => (v.startsAt.getTime() - past[i]!.startsAt.getTime()) / DAY_MS);
    const usual = intervals.reduce((s, x) => s + x, 0) / intervals.length;
    const daysSince = (now.getTime() - past.at(-1)!.startsAt.getTime()) / DAY_MS;
    if (daysSince >= Math.max(minDays, usual * minFactor)) out.push({ clientId, daysSince: Math.round(daysSince), usualInterval: Math.round(usual) });
  }
  return out.sort((a, b) => b.daysSince - a.daysSince);
}
