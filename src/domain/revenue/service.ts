import type { RevenueKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { classifyManualRevenue } from "./ledger";
import { createManualRevenue, revenuesAround } from "@/repositories/revenues";
import { findClientRow } from "@/repositories/clients";
import { findServiceById } from "@/repositories/services";
import { audit } from "@/repositories/audit";
import { createAppointmentWithRevenue } from "@/repositories/appointments";

/** Saisie manuelle d'un revenu avec contrôle anti double-comptage. */
export async function recordManualRevenue(userId: string, input: { amountCents: number; occurredAt: Date; clientId?: string | null; serviceId?: string | null; kind: RevenueKind; label?: string | null }) {
  if (input.clientId && !(await findClientRow(userId, input.clientId))) throw new Error("Client introuvable");
  if (input.serviceId && !(await findServiceById(userId, input.serviceId))) throw new Error("Prestation introuvable");
  const existing = await revenuesAround(userId, input.occurredAt);
  const decision = classifyManualRevenue({ amountCents: input.amountCents, occurredAt: input.occurredAt, clientId: input.clientId ?? null, serviceId: input.serviceId ?? null, kind: input.kind }, existing);
  const revenue = await createManualRevenue(userId, {
    amountCents: input.amountCents,
    occurredAt: input.occurredAt,
    clientId: input.clientId ?? null,
    serviceId: input.serviceId ?? null,
    kind: input.kind,
    label: input.label ?? null,
    reviewStatus: decision.decision === "CREATE" ? "OK" : decision.decision === "DUPLICATE" ? "DUPLICATE_IGNORED" : "NEEDS_REVIEW",
    duplicateOfId: decision.decision === "DUPLICATE" ? decision.duplicateOfId : decision.decision === "REVIEW" ? decision.candidateId : null,
    reviewNote: decision.decision === "CREATE" ? null : decision.reason,
  });
  await audit(userId, "revenue.manual.created", { entity: "Revenue", entityId: revenue.id, metadata: { decision: decision.decision } });
  return { revenue, decision };
}

/** Rendez-vous saisi manuellement (génère le revenu associé s'il est réalisé). */
export async function recordManualAppointment(userId: string, input: { clientId?: string | null; serviceId: string; startsAt: Date; priceCents?: number; status: "BOOKED" | "COMPLETED" | "CANCELLED" | "NO_SHOW" }) {
  const service = await findServiceById(userId, input.serviceId);
  if (!service) throw new Error("Prestation introuvable");
  const client = input.clientId ? await findClientRow(userId, input.clientId) : null;
  if (input.clientId && !client) throw new Error("Client introuvable");
  const res = await prisma.$transaction((tx) =>
    createAppointmentWithRevenue(
      userId,
      { clientId: client?.id ?? null, clientName: client?.displayName ?? null, serviceId: service.id, serviceName: service.name, startsAt: input.startsAt, status: input.status, priceCents: input.priceCents ?? service.priceCents, source: "MANUAL" },
      tx,
    ),
  );
  if (!res.duplicate) await audit(userId, "appointment.manual.created", { entity: "Appointment", entityId: res.appointment.id });
  return res;
}
