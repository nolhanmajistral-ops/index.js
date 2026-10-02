import type { AcquisitionChannel, AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizePersonName } from "@/datahub/normalization";
import { appointmentRevenueDedupKey } from "@/datahub/deduplication";
import { appointmentGeneratesRevenue } from "@/domain/revenue/ledger";
import { recordManualAppointment } from "@/domain/revenue/service";
import { createClientWithAttribution } from "@/domain/clients/service";
import { audit } from "@/repositories/audit";

export interface PlanningInput {
  clientId?: string;
  clientName?: string; // saisie libre : client existant (nom exact) ou nouveau client
  clientPhone?: string;
  acquisitionChannel?: AcquisitionChannel;
  serviceId: string;
  startsAt: Date;
  priceCents?: number;
  status?: AppointmentStatus;
  notes?: string;
}

/** Statut par défaut : passé = réalisé, futur = réservé. */
export function defaultStatus(startsAt: Date, now = new Date()): AppointmentStatus {
  return startsAt.getTime() <= now.getTime() ? "COMPLETED" : "BOOKED";
}

/**
 * Résout le client d'un rendez-vous saisi dans le planning :
 * id choisi dans la liste > nom identique à UN SEUL client existant > nouveau client.
 */
async function resolveClient(userId: string, input: PlanningInput): Promise<string | null> {
  if (input.clientId) {
    const c = await prisma.client.findFirst({ where: { id: input.clientId, userId }, select: { id: true } });
    if (!c) throw new Error("Client introuvable");
    return c.id;
  }
  const name = input.clientName?.trim();
  if (!name) return null;
  const same = await prisma.client.findMany({ where: { userId, normalizedName: normalizePersonName(name), mergedIntoId: null }, select: { id: true }, take: 2 });
  if (same.length === 1) return same[0]!.id;
  const parts = name.split(/\s+/);
  const res = await createClientWithAttribution(userId, {
    firstName: parts[0],
    lastName: parts.slice(1).join(" ") || undefined,
    phone: input.clientPhone,
    acquisitionChannel: input.acquisitionChannel ?? "UNKNOWN",
  });
  return res.client?.id ?? res.duplicateOf!.id;
}

export async function addPlanningAppointment(userId: string, input: PlanningInput, now = new Date()) {
  const clientId = await resolveClient(userId, input);
  const res = await recordManualAppointment(userId, {
    clientId,
    serviceId: input.serviceId,
    startsAt: input.startsAt,
    priceCents: input.priceCents,
    status: input.status ?? defaultStatus(input.startsAt, now),
  });
  if (input.notes && !res.duplicate) await prisma.appointment.updateMany({ where: { id: res.appointment.id, userId }, data: { notes: input.notes } });
  return res;
}

/** Change le statut ; le revenu associé est créé (réalisé) ou retiré (annulé/absent/réservé) automatiquement. */
export async function setAppointmentStatus(userId: string, id: string, status: AppointmentStatus) {
  const updated = await prisma.$transaction(async (tx) => {
    const appt = await tx.appointment.findFirst({ where: { id, userId }, include: { revenue: true } });
    if (!appt) return null;
    const next = await tx.appointment.update({ where: { id }, data: { status } });
    const shouldHaveRevenue = appointmentGeneratesRevenue(next);
    if (shouldHaveRevenue && !appt.revenue) {
      await tx.revenue.create({
        data: {
          userId, appointmentId: appt.id, clientId: appt.clientId, serviceId: appt.serviceId, amountCents: appt.priceCents,
          occurredAt: appt.startsAt, kind: "SERVICE", dedupKey: appointmentRevenueDedupKey(appt.dedupKey), label: appt.serviceName, source: appt.source,
        },
      });
    } else if (!shouldHaveRevenue && appt.revenue) {
      await tx.revenue.delete({ where: { id: appt.revenue.id } });
    }
    return next;
  });
  if (updated) await audit(userId, "appointment.status", { entity: "Appointment", entityId: id, metadata: { status } });
  return updated;
}

export function listWeekAppointments(userId: string, from: Date, to: Date) {
  return prisma.appointment.findMany({
    where: { userId, startsAt: { gte: from, lt: to } },
    orderBy: { startsAt: "asc" },
    take: 500,
    include: { client: { select: { id: true, displayName: true } } },
  });
}
