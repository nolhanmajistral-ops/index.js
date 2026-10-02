import type { AppointmentStatus, DataSource } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { appointmentDedupKey, appointmentRevenueDedupKey } from "@/datahub/deduplication";
import { appointmentGeneratesRevenue } from "@/domain/revenue/ledger";

export interface AppointmentInput {
  clientId: string | null;
  clientName?: string | null;
  serviceId: string | null;
  serviceName: string;
  startsAt: Date;
  status: AppointmentStatus;
  priceCents: number;
  source: DataSource;
  externalId?: string | null;
  importBatchId?: string | null;
  importedAt?: Date | null;
  notes?: string | null;
}

export function findAppointmentByExternalId(userId: string, source: DataSource, externalId: string, tx: Tx = prisma) {
  return tx.appointment.findUnique({ where: { userId_source_externalId: { userId, source, externalId } } });
}

export function findAppointmentByDedupKey(userId: string, dedupKey: string, tx: Tx = prisma) {
  return tx.appointment.findUnique({ where: { userId_dedupKey: { userId, dedupKey } } });
}

/**
 * Crée un rendez-vous et, s'il est réalisé, son revenu associé (1:1) dans la même transaction.
 * Renvoie null si un rendez-vous identique existe déjà (même clé métier) → pas de doublon.
 */
export async function createAppointmentWithRevenue(userId: string, input: AppointmentInput, tx: Tx) {
  const dedupKey = appointmentDedupKey({ clientId: input.clientId, clientName: input.clientName, startsAt: input.startsAt, serviceName: input.serviceName });
  if (input.externalId) {
    const byExt = await findAppointmentByExternalId(userId, input.source, input.externalId, tx);
    if (byExt) return { appointment: byExt, revenue: null, duplicate: true as const };
  }
  const byKey = await findAppointmentByDedupKey(userId, dedupKey, tx);
  if (byKey) return { appointment: byKey, revenue: null, duplicate: true as const };

  const appointment = await tx.appointment.create({
    data: {
      userId,
      clientId: input.clientId,
      serviceId: input.serviceId,
      serviceName: input.serviceName,
      startsAt: input.startsAt,
      status: input.status,
      priceCents: input.priceCents,
      dedupKey,
      source: input.source,
      externalId: input.externalId ?? null,
      importBatchId: input.importBatchId ?? null,
      importedAt: input.importedAt ?? null,
      notes: input.notes ?? null,
    },
  });
  let revenue = null;
  if (appointmentGeneratesRevenue(appointment)) {
    revenue = await tx.revenue.create({
      data: {
        userId,
        appointmentId: appointment.id,
        clientId: appointment.clientId,
        serviceId: appointment.serviceId,
        amountCents: appointment.priceCents,
        occurredAt: appointment.startsAt,
        kind: "SERVICE",
        dedupKey: appointmentRevenueDedupKey(dedupKey),
        label: appointment.serviceName,
        source: input.source,
        externalId: input.externalId ? `appt:${input.externalId}` : null,
        importBatchId: input.importBatchId ?? null,
        importedAt: input.importedAt ?? null,
      },
    });
  }
  return { appointment, revenue, duplicate: false as const };
}

export function listAppointments(userId: string, opts: { from?: Date; to?: Date; clientId?: string; take?: number; skip?: number } = {}) {
  return prisma.appointment.findMany({
    where: {
      userId,
      ...(opts.clientId ? { clientId: opts.clientId } : {}),
      ...(opts.from || opts.to ? { startsAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lt: opts.to } : {}) } } : {}),
    },
    orderBy: { startsAt: "desc" },
    take: Math.min(opts.take ?? 50, 500),
    skip: opts.skip ?? 0,
    include: { client: { select: { id: true, displayName: true } } },
  });
}

export async function deleteAppointment(userId: string, id: string) {
  const res = await prisma.appointment.deleteMany({ where: { id, userId } });
  return res.count === 1;
}
