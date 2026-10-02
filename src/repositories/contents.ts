import type { ContentStatus, ContentType, DataSource, Platform, Prisma } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";

export interface ContentInput {
  platform: Platform;
  title: string;
  type: ContentType;
  status: ContentStatus;
  hook?: string | null;
  description?: string | null;
  durationSec?: number | null;
  url?: string | null;
  notes?: string | null;
  publishedAt?: Date | null;
  plannedAt?: Date | null;
}

export interface MetricInput {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  followersGained?: number;
  profileVisits?: number;
  messages?: number;
  leads?: number;
}

export function createContent(userId: string, input: ContentInput, source: DataSource = "MANUAL", tx: Tx = prisma) {
  return tx.content.create({ data: { ...input, userId, source, publishedAt: input.publishedAt ?? (input.status === "PUBLISHED" ? new Date() : null) } });
}

export async function updateContent(userId: string, id: string, input: Partial<ContentInput>) {
  const res = await prisma.content.updateMany({ where: { id, userId }, data: input });
  return res.count === 1;
}

export function getContent(userId: string, id: string) {
  return prisma.content.findFirst({
    where: { id, userId },
    include: { metrics: { orderBy: { capturedAt: "desc" }, take: 20 } },
  });
}

export async function duplicateContent(userId: string, id: string) {
  const c = await prisma.content.findFirst({ where: { id, userId } });
  if (!c) return null;
  return prisma.content.create({
    data: {
      userId,
      platform: c.platform,
      title: `${c.title} (copie)`,
      type: c.type,
      status: "IDEA",
      hook: c.hook,
      description: c.description,
      durationSec: c.durationSec,
      notes: c.notes,
      source: c.source === "DEMO" ? "DEMO" : "MANUAL",
    },
  });
}

export async function archiveContent(userId: string, id: string, archived: boolean) {
  const res = await prisma.content.updateMany({ where: { id, userId }, data: { archivedAt: archived ? new Date() : null } });
  return res.count === 1;
}

export async function deleteContent(userId: string, id: string) {
  const res = await prisma.content.deleteMany({ where: { id, userId } });
  return res.count === 1;
}

/** Ajoute un snapshot de métriques (n'écrase jamais l'historique). */
export async function addContentMetric(userId: string, contentId: string, m: MetricInput, capturedAt = new Date(), source: DataSource = "MANUAL") {
  const owned = await prisma.content.findFirst({ where: { id: contentId, userId }, select: { id: true } });
  if (!owned) return null;
  return prisma.contentMetric.create({ data: { userId, contentId, capturedAt, source, ...m } });
}

export interface ContentListFilters {
  q?: string;
  platform?: Platform;
  type?: ContentType;
  status?: ContentStatus;
  archived?: boolean;
  sort?: "recent" | "views" | "planned";
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

export async function listContents(userId: string, f: ContentListFilters = {}) {
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(100, f.pageSize ?? 30);
  const where: Prisma.ContentWhereInput = {
    userId,
    archivedAt: f.archived ? { not: null } : null,
    ...(f.platform ? { platform: f.platform } : {}),
    ...(f.type ? { type: f.type } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.q ? { OR: [{ title: { contains: f.q, mode: "insensitive" } }, { hook: { contains: f.q, mode: "insensitive" } }] } : {}),
    ...(f.from || f.to
      ? { OR: [{ publishedAt: { gte: f.from, lt: f.to } }, { plannedAt: { gte: f.from, lt: f.to } }] }
      : {}),
  };
  const orderBy: Prisma.ContentOrderByWithRelationInput[] =
    f.sort === "planned" ? [{ plannedAt: "asc" }] : [{ publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }];
  const [items, total] = await Promise.all([
    prisma.content.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.content.count({ where }),
  ]);
  const latest = await latestMetricsFor(userId, items.map((i) => i.id));
  return { items: items.map((c) => ({ ...c, latest: latest.get(c.id) ?? null })), total, page, pageSize };
}

/** Dernier snapshot par contenu — une seule requête (pas de N+1). */
export async function latestMetricsFor(userId: string, contentIds: string[]) {
  if (contentIds.length === 0) return new Map<string, Awaited<ReturnType<typeof prisma.contentMetric.findFirst>>>();
  const rows = await prisma.contentMetric.findMany({
    where: { userId, contentId: { in: contentIds } },
    orderBy: [{ contentId: "asc" }, { capturedAt: "desc" }],
    distinct: ["contentId"],
  });
  return new Map(rows.map((r) => [r.contentId, r]));
}

export function listContentOptions(userId: string) {
  return prisma.content.findMany({ where: { userId, archivedAt: null }, select: { id: true, title: true, platform: true, publishedAt: true }, orderBy: { createdAt: "desc" }, take: 200 });
}
