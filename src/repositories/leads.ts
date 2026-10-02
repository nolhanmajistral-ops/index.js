import type { AcquisitionChannel, LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function createLead(userId: string, data: { name?: string | null; channel: AcquisitionChannel; contentId?: string | null; notes?: string | null }) {
  if (data.contentId) {
    const owned = await prisma.content.findFirst({ where: { id: data.contentId, userId }, select: { id: true } });
    if (!owned) throw new Error("Contenu introuvable");
  }
  return prisma.lead.create({ data: { userId, name: data.name ?? null, channel: data.channel, contentId: data.contentId ?? null, notes: data.notes ?? null } });
}

export function listLeads(userId: string, status?: LeadStatus) {
  return prisma.lead.findMany({
    where: { userId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { content: { select: { id: true, title: true } }, client: { select: { id: true, displayName: true } } },
  });
}

export async function updateLeadStatus(userId: string, id: string, status: LeadStatus, clientId?: string | null) {
  if (clientId) {
    const owned = await prisma.client.findFirst({ where: { id: clientId, userId }, select: { id: true } });
    if (!owned) throw new Error("Client introuvable");
  }
  const r = await prisma.lead.updateMany({ where: { id, userId }, data: { status, ...(clientId !== undefined ? { clientId } : {}) } });
  return r.count === 1;
}
