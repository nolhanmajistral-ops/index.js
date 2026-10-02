import type { DataSource, RevenueKind, RevenueReviewStatus } from "@prisma/client";

/** Ligne de revenu interne (ce que lit le domaine — jamais une donnée provider brute). */
export interface RevenueRow {
  id: string;
  amountCents: number;
  occurredAt: Date;
  source: DataSource;
  kind: RevenueKind;
  clientId: string | null;
  serviceId: string | null;
  appointmentId: string | null;
  isEstimated: boolean;
  reviewStatus: RevenueReviewStatus;
}

export interface AppointmentRow {
  id: string;
  clientId: string | null;
  serviceId: string | null;
  serviceName: string;
  startsAt: Date;
  status: "BOOKED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  priceCents: number;
  source: DataSource;
}
