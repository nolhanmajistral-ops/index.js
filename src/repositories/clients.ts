import type { AcquisitionChannel, Client, DataSource, Prisma } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { blindIndex, decryptNullable, encryptNullable } from "@/lib/crypto";
import { displayName, normalizeEmail, normalizePersonName, normalizePhone } from "@/datahub/normalization";

/** Vue client déchiffrée — ne jamais renvoyer emailEnc/phoneEnc au frontend. */
export interface ClientView {
  id: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  acquisitionChannel: AcquisitionChannel;
  originContentId: string | null;
  notes: string | null;
  source: DataSource;
  externalId: string | null;
  createdAt: Date;
}

export function toClientView(c: Client): ClientView {
  return {
    id: c.id,
    displayName: c.displayName,
    firstName: c.firstName,
    lastName: c.lastName,
    email: decryptNullable(c.emailEnc),
    phone: decryptNullable(c.phoneEnc),
    acquisitionChannel: c.acquisitionChannel,
    originContentId: c.originContentId,
    notes: c.notes,
    source: c.source,
    externalId: c.externalId,
    createdAt: c.createdAt,
  };
}

export interface ClientInput {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  acquisitionChannel?: AcquisitionChannel;
  originContentId?: string | null;
  notes?: string | null;
  source: DataSource;
  externalId?: string | null;
  importedAt?: Date | null;
  createdAt?: Date;
}

export function contactHashes(userId: string, email?: string | null, phone?: string | null) {
  const e = normalizeEmail(email);
  const p = normalizePhone(phone);
  return {
    email: e,
    phone: p,
    emailHash: e ? blindIndex(userId, `email:${e}`) : null,
    phoneHash: p ? blindIndex(userId, `phone:${p}`) : null,
  };
}

export async function createClient(userId: string, input: ClientInput, tx: Tx = prisma) {
  const name = displayName(input.firstName, input.lastName, input.fullName);
  if (!name) throw new Error("Nom du client requis");
  const h = contactHashes(userId, input.email, input.phone);
  if (input.originContentId) {
    const owned = await tx.content.findFirst({ where: { id: input.originContentId, userId }, select: { id: true } });
    if (!owned) throw new Error("Contenu d'origine introuvable");
  }
  const client = await tx.client.create({
    data: {
      userId,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      displayName: name,
      normalizedName: normalizePersonName(name),
      emailEnc: encryptNullable(h.email),
      emailHash: h.emailHash,
      phoneEnc: encryptNullable(h.phone),
      phoneHash: h.phoneHash,
      acquisitionChannel: input.acquisitionChannel ?? "UNKNOWN",
      originContentId: input.originContentId ?? null,
      notes: input.notes ?? null,
      source: input.source,
      externalId: input.externalId ?? null,
      importedAt: input.importedAt ?? null,
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    },
  });
  const identifiers: Prisma.ClientIdentifierCreateManyInput[] = [];
  if (h.emailHash) identifiers.push({ userId, clientId: client.id, type: "EMAIL_HASH", value: h.emailHash, source: input.source });
  if (h.phoneHash) identifiers.push({ userId, clientId: client.id, type: "PHONE_HASH", value: h.phoneHash, source: input.source });
  identifiers.push({ userId, clientId: client.id, type: "NAME", value: client.normalizedName, source: input.source });
  if (input.externalId) identifiers.push({ userId, clientId: client.id, type: "EXTERNAL", value: `${input.source}:${input.externalId}`, source: input.source });
  await tx.clientIdentifier.createMany({ data: identifiers, skipDuplicates: true });
  return client;
}

export function findClientRow(userId: string, id: string, tx: Tx = prisma) {
  return tx.client.findFirst({ where: { id, userId } });
}

export async function getClient(userId: string, id: string): Promise<ClientView | null> {
  const c = await findClientRow(userId, id);
  return c ? toClientView(c) : null;
}

export async function listClients(
  userId: string,
  opts: { q?: string; channel?: AcquisitionChannel; page?: number; pageSize?: number } = {},
) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
  const where: Prisma.ClientWhereInput = { userId, mergedIntoId: null };
  if (opts.channel) where.acquisitionChannel = opts.channel;
  if (opts.q && opts.q.trim()) {
    const q = opts.q.trim();
    const h = contactHashes(userId, q, q);
    where.OR = [
      { displayName: { contains: q, mode: "insensitive" } },
      ...(h.emailHash ? [{ emailHash: h.emailHash }] : []),
      ...(h.phoneHash ? [{ phoneHash: h.phoneHash }] : []),
    ];
  }
  const [rows, total] = await Promise.all([
    prisma.client.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.client.count({ where }),
  ]);
  return { items: rows.map(toClientView), total, page, pageSize };
}

/** Données minimales pour le matching (aucune donnée en clair). */
export function listClientsForMatching(userId: string, tx: Tx = prisma) {
  return tx.client.findMany({
    where: { userId, mergedIntoId: null },
    select: { id: true, normalizedName: true, emailHash: true, phoneHash: true, source: true, externalId: true },
  });
}

export async function updateClient(userId: string, id: string, input: Omit<ClientInput, "source">, tx: Tx = prisma) {
  const existing = await findClientRow(userId, id, tx);
  if (!existing) return null;
  const name = displayName(input.firstName, input.lastName, input.fullName) || existing.displayName;
  const h = contactHashes(userId, input.email, input.phone);
  return tx.client.update({
    where: { id },
    data: {
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      displayName: name,
      normalizedName: normalizePersonName(name),
      emailEnc: encryptNullable(h.email),
      emailHash: h.emailHash,
      phoneEnc: encryptNullable(h.phone),
      phoneHash: h.phoneHash,
      acquisitionChannel: input.acquisitionChannel ?? existing.acquisitionChannel,
      originContentId: input.originContentId ?? null,
      notes: input.notes ?? null,
    },
  });
}

/** Suppression NLPD : supprime le client, ses identifiants, ses attributions ; ses rendez-vous sont anonymisés (clientId = null). */
export async function deleteClient(userId: string, id: string) {
  const res = await prisma.client.deleteMany({ where: { id, userId } });
  return res.count === 1;
}

/**
 * Fusionne `mergeId` dans `keepId` (décision manuelle tracée).
 * Rendez-vous, revenus, leads et identifiants sont transférés ; le client fusionné est supprimé.
 */
export async function mergeClients(userId: string, keepId: string, mergeId: string, tx: Tx) {
  if (keepId === mergeId) throw new Error("Impossible de fusionner un client avec lui-même");
  const [keep, merge] = await Promise.all([findClientRow(userId, keepId, tx), findClientRow(userId, mergeId, tx)]);
  if (!keep || !merge) throw new Error("Client introuvable");
  await tx.appointment.updateMany({ where: { userId, clientId: mergeId }, data: { clientId: keepId } });
  await tx.revenue.updateMany({ where: { userId, clientId: mergeId }, data: { clientId: keepId } });
  await tx.lead.updateMany({ where: { userId, clientId: mergeId }, data: { clientId: keepId } });
  const ids = await tx.clientIdentifier.findMany({ where: { clientId: mergeId } });
  for (const i of ids) {
    await tx.clientIdentifier.upsert({
      where: { clientId_type_value: { clientId: keepId, type: i.type, value: i.value } },
      create: { userId, clientId: keepId, type: i.type, value: i.value, source: i.source },
      update: {},
    });
  }
  const keepAttr = await tx.attribution.findUnique({ where: { clientId: keepId } });
  if (!keepAttr) await tx.attribution.updateMany({ where: { userId, clientId: mergeId }, data: { clientId: keepId } });
  await tx.client.update({
    where: { id: keepId },
    data: {
      emailEnc: keep.emailEnc ?? merge.emailEnc,
      emailHash: keep.emailHash ?? merge.emailHash,
      phoneEnc: keep.phoneEnc ?? merge.phoneEnc,
      phoneHash: keep.phoneHash ?? merge.phoneHash,
      acquisitionChannel: keep.acquisitionChannel === "UNKNOWN" ? merge.acquisitionChannel : keep.acquisitionChannel,
      originContentId: keep.originContentId ?? merge.originContentId,
      notes: [keep.notes, merge.notes].filter(Boolean).join("\n") || null,
    },
  });
  await tx.client.delete({ where: { id: mergeId } });
  return keep;
}

export function countClients(userId: string) {
  return prisma.client.count({ where: { userId, mergedIntoId: null } });
}
