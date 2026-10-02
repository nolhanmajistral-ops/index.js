import { prisma } from "@/lib/db";
import { audit } from "@/repositories/audit";

/**
 * Politique de rétention (NLPD — minimisation) : supprime les rendez-vous/revenus plus anciens que N mois,
 * puis les clients sans aucune visite récente créés avant cette date. Ne touche qu'à l'utilisateur concerné.
 */
export async function applyRetention(userId: string, months: number, now = new Date()) {
  if (!Number.isInteger(months) || months < 6) throw new Error("Rétention minimale : 6 mois");
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  const result = await prisma.$transaction(async (tx) => {
    const revenues = (await tx.revenue.deleteMany({ where: { userId, occurredAt: { lt: cutoff } } })).count;
    const appointments = (await tx.appointment.deleteMany({ where: { userId, startsAt: { lt: cutoff } } })).count;
    const clients = (await tx.client.deleteMany({ where: { userId, createdAt: { lt: cutoff }, appointments: { none: {} } } })).count;
    const leads = (await tx.lead.deleteMany({ where: { userId, createdAt: { lt: cutoff } } })).count;
    const audits = (await tx.auditLog.deleteMany({ where: { userId, createdAt: { lt: cutoff } } })).count;
    return { revenues, appointments, clients, leads, audits };
  });
  await audit(userId, "privacy.retention.applied", { metadata: { months, ...result } });
  return result;
}
