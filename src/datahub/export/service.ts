import { prisma } from "@/lib/db";
import { toClientView } from "@/repositories/clients";
import { audit } from "@/repositories/audit";

export const EXPORT_ENTITIES = ["clients", "contents", "appointments", "revenue", "metrics"] as const;
export type ExportEntity = (typeof EXPORT_ENTITIES)[number];

const cents = (c: number | null | undefined) => (c === null || c === undefined ? null : c / 100);

/** Données exportables d'un utilisateur (toujours filtrées par userId). Montants en CHF. */
export async function exportRows(userId: string, entity: ExportEntity): Promise<Record<string, unknown>[]> {
  switch (entity) {
    case "clients": {
      const rows = await prisma.client.findMany({ where: { userId }, include: { attribution: true }, orderBy: { createdAt: "asc" } });
      return rows.map((r) => {
        const v = toClientView(r);
        return { id: v.id, nom: v.displayName, prenom: v.firstName, nomFamille: v.lastName, email: v.email, telephone: v.phone, sourceAcquisition: v.acquisitionChannel, attributionConfiance: r.attribution?.confidence ?? "UNKNOWN", reponseDeclaree: r.attribution?.declaredAnswer ?? null, contenuOrigine: v.originContentId, notes: v.notes, source: v.source, creeLe: v.createdAt };
      });
    }
    case "contents": {
      const rows = await prisma.content.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
      return rows.map((c) => ({ id: c.id, plateforme: c.platform, titre: c.title, type: c.type, statut: c.status, hook: c.hook, description: c.description, dureeSec: c.durationSec, url: c.url, publieLe: c.publishedAt, prevuLe: c.plannedAt, archiveLe: c.archivedAt, notes: c.notes, source: c.source }));
    }
    case "appointments": {
      const rows = await prisma.appointment.findMany({ where: { userId }, include: { client: { select: { displayName: true } } }, orderBy: { startsAt: "asc" } });
      return rows.map((a) => ({ id: a.id, date: a.startsAt, client: a.client?.displayName ?? null, clientId: a.clientId, prestation: a.serviceName, prixCHF: cents(a.priceCents), statut: a.status, source: a.source, externalId: a.externalId, importBatchId: a.importBatchId }));
    }
    case "revenue": {
      const rows = await prisma.revenue.findMany({ where: { userId }, orderBy: { occurredAt: "asc" } });
      return rows.map((r) => ({ id: r.id, date: r.occurredAt, montantCHF: cents(r.amountCents), type: r.kind, statutRevue: r.reviewStatus, estime: r.isEstimated, source: r.source, rendezVousId: r.appointmentId, clientId: r.clientId, libelle: r.label }));
    }
    case "metrics": {
      const [social, content] = await Promise.all([
        prisma.socialMetric.findMany({ where: { userId }, orderBy: { capturedAt: "asc" } }),
        prisma.contentMetric.findMany({ where: { userId }, orderBy: { capturedAt: "asc" } }),
      ]);
      return [
        ...social.map((m) => ({ type: "social", plateforme: m.platform, contenuId: null, date: m.capturedAt, abonnes: m.followers, vues: m.views, likes: m.likes, commentaires: m.comments, partages: m.shares, leads: null, source: m.source })),
        ...content.map((m) => ({ type: "contenu", plateforme: null, contenuId: m.contentId, date: m.capturedAt, abonnes: m.followersGained, vues: m.views, likes: m.likes, commentaires: m.comments, partages: m.shares, leads: m.leads, source: m.source })),
      ];
    }
  }
}

export async function exportAll(userId: string) {
  const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), currency: "CHF" };
  for (const e of EXPORT_ENTITIES) out[e] = await exportRows(userId, e);
  await audit(userId, "data.exported", { metadata: { entity: "all" } });
  return out;
}

/** Export NLPD des données d'un client (droit d'accès). */
export async function exportClient(userId: string, clientId: string) {
  const c = await prisma.client.findFirst({ where: { id: clientId, userId }, include: { attribution: true, appointments: true, revenues: true, leads: true } });
  if (!c) return null;
  await audit(userId, "client.exported", { entity: "Client", entityId: clientId });
  const v = toClientView(c);
  return {
    exportedAt: new Date().toISOString(),
    client: v,
    attribution: c.attribution ? { channel: c.attribution.channel, confidence: c.attribution.confidence, declaredAnswer: c.attribution.declaredAnswer } : null,
    appointments: c.appointments.map((a) => ({ date: a.startsAt, service: a.serviceName, priceCHF: a.priceCents / 100, status: a.status, source: a.source })),
    revenues: c.revenues.map((r) => ({ date: r.occurredAt, amountCHF: r.amountCents / 100, status: r.reviewStatus })),
    leads: c.leads.map((l) => ({ date: l.createdAt, channel: l.channel, status: l.status })),
  };
}
