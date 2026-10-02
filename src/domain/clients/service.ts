import type { AcquisitionChannel } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createClient, contactHashes, updateClient } from "@/repositories/clients";
import { upsertAttribution } from "@/repositories/attributions";
import { attributionFromManualChannel } from "@/domain/attribution/declared";
import { audit } from "@/repositories/audit";

export interface ClientFormInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  acquisitionChannel: AcquisitionChannel;
  declaredAnswer?: string;
  originContentId?: string;
  notes?: string;
}

/** Création manuelle : refuse un doublon certain (même email/téléphone) et crée l'attribution. */
export async function createClientWithAttribution(userId: string, input: ClientFormInput) {
  const h = contactHashes(userId, input.email, input.phone);
  const or = [...(h.emailHash ? [{ emailHash: h.emailHash }] : []), ...(h.phoneHash ? [{ phoneHash: h.phoneHash }] : [])];
  if (or.length) {
    const dup = await prisma.client.findFirst({ where: { userId, OR: or }, select: { id: true, displayName: true } });
    if (dup) return { duplicateOf: dup, client: null };
  }
  const attr = attributionFromManualChannel(input.acquisitionChannel, input.declaredAnswer);
  const client = await prisma.$transaction(async (tx) => {
    const c = await createClient(userId, { ...input, acquisitionChannel: attr.channel, source: "MANUAL", originContentId: input.originContentId ?? null }, tx);
    await upsertAttribution(userId, { clientId: c.id, channel: attr.channel, confidence: attr.confidence, method: attr.method, declaredAnswer: input.declaredAnswer ?? null, contentId: input.originContentId ?? null }, tx);
    return c;
  });
  await audit(userId, "client.created", { entity: "Client", entityId: client.id });
  return { client, duplicateOf: null };
}

export async function updateClientWithAttribution(userId: string, id: string, input: ClientFormInput) {
  const attr = attributionFromManualChannel(input.acquisitionChannel, input.declaredAnswer);
  const updated = await prisma.$transaction(async (tx) => {
    const c = await updateClient(userId, id, { ...input, acquisitionChannel: attr.channel, originContentId: input.originContentId ?? null }, tx);
    if (!c) return null;
    await upsertAttribution(userId, { clientId: c.id, channel: attr.channel, confidence: attr.confidence, method: attr.method, declaredAnswer: input.declaredAnswer ?? null, contentId: input.originContentId ?? null }, tx);
    return c;
  });
  if (updated) await audit(userId, "client.updated", { entity: "Client", entityId: id });
  return updated;
}
