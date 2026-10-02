import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { appointmentDedupKey, appointmentRevenueDedupKey, manualRevenueDedupKey } from "@/datahub/deduplication";
import { contactHashes } from "@/repositories/clients";
import { encryptNullable } from "@/lib/crypto";
import { normalizePersonName, normalizeText } from "@/datahub/normalization";
import { attributionFromDeclaration } from "@/domain/attribution/declared";
import { audit } from "@/repositories/audit";
import { DEFAULT_SERVICES } from "@/domain/onboarding/service";
import { generateDemoPlan, seedFrom } from "./generate";

/**
 * Supprime UNIQUEMENT les données source = DEMO de cet utilisateur. Jamais de données réelles, jamais un autre utilisateur.
 */
export async function deleteDemoData(userId: string) {
  return prisma.$transaction(async (tx) => {
    const demoClients = (await tx.client.findMany({ where: { userId, source: "DEMO" }, select: { id: true } })).map((c) => c.id);
    const counts = {
      revenues: (await tx.revenue.deleteMany({ where: { userId, source: "DEMO" } })).count,
      appointments: (await tx.appointment.deleteMany({ where: { userId, source: "DEMO" } })).count,
      leads: (await tx.lead.deleteMany({ where: { userId, source: "DEMO" } })).count,
      attributions: (await tx.attribution.deleteMany({ where: { userId, source: "DEMO" } })).count,
      reviews: (await tx.clientMatchReview.deleteMany({ where: { userId, OR: [{ clientId: { in: demoClients } }, { candidateClientId: { in: demoClients } }] } })).count,
      clients: (await tx.client.deleteMany({ where: { userId, source: "DEMO" } })).count,
      contentMetrics: (await tx.contentMetric.deleteMany({ where: { userId, source: "DEMO" } })).count,
      contents: (await tx.content.deleteMany({ where: { userId, source: "DEMO" } })).count,
      socialMetrics: (await tx.socialMetric.deleteMany({ where: { userId, source: "DEMO" } })).count,
      goals: (await tx.goal.deleteMany({ where: { userId, source: "DEMO" } })).count,
      missions: (await tx.dailyMission.deleteMany({ where: { userId, source: "DEMO" } })).count,
      experiments: (await tx.aiExperiment.deleteMany({ where: { userId, source: "DEMO" } })).count,
      imports: (await tx.importBatch.deleteMany({ where: { userId, provider: "DEMO" } })).count,
      services: (await tx.service.deleteMany({ where: { userId, source: "DEMO", appointments: { none: {} } } })).count,
    };
    return counts;
  });
}

/** Charge 8 semaines de données DEMO cohérentes (toutes marquées source = DEMO). */
export async function loadDemoData(userId: string, now = new Date()) {
  const started = Date.now();
  let services = await prisma.service.findMany({ where: { userId, active: true } });
  if (services.length === 0) {
    for (const s of DEFAULT_SERVICES)
      await prisma.service.create({ data: { userId, name: s.name, normalizedName: normalizeText(s.name), priceCents: s.price * 100, durationMinutes: s.duration, source: "DEMO" } });
    services = await prisma.service.findMany({ where: { userId, active: true } });
  }
  const plan = generateDemoPlan(now, services.map((s) => ({ id: s.id, name: s.name, priceCents: s.priceCents })), seedFrom(userId));

  await prisma.$transaction(
    async (tx) => {
      // Contenus + snapshots de métriques
      const contentIds = new Map<string, string>();
      for (const c of plan.contents) {
        const row = await tx.content.create({ data: { userId, platform: c.platform, type: c.type, status: c.status, title: c.title, hook: c.hook || null, publishedAt: c.publishedAt, plannedAt: c.plannedAt, durationSec: c.durationSec, source: "DEMO" } });
        contentIds.set(c.key, row.id);
        if (c.metrics && c.publishedAt) {
          // Deux snapshots : J+1 (partiel) puis le dernier état — l'historique n'est jamais écrasé.
          const early = Object.fromEntries(Object.entries(c.metrics).map(([k, v]) => [k, Math.round(v * 0.55)]));
          await tx.contentMetric.createMany({
            data: [
              { userId, contentId: row.id, capturedAt: new Date(Math.min(now.getTime(), c.publishedAt.getTime() + 86_400_000)), source: "DEMO", ...early },
              { userId, contentId: row.id, capturedAt: new Date(Math.min(now.getTime(), c.publishedAt.getTime() + 5 * 86_400_000)), source: "DEMO", ...c.metrics },
            ],
          });
        }
      }
      // Clients + identifiants + attributions
      const clientIds = new Map<string, string>();
      for (const c of plan.clients) {
        const name = `${c.firstName} ${c.lastName}`;
        const h = contactHashes(userId, c.email, c.phone);
        const declared = c.declared ? attributionFromDeclaration(c.declared) : null;
        const row = await tx.client.create({
          data: {
            userId, firstName: c.firstName, lastName: c.lastName, displayName: name, normalizedName: normalizePersonName(name),
            emailEnc: encryptNullable(h.email), emailHash: h.emailHash, phoneEnc: encryptNullable(h.phone), phoneHash: h.phoneHash,
            acquisitionChannel: c.channel, originContentId: c.contentKey ? (contentIds.get(c.contentKey) ?? null) : null,
            source: "DEMO", createdAt: new Date(Math.min(c.createdAt.getTime(), now.getTime())),
          },
        });
        clientIds.set(c.key, row.id);
        if (c.channel !== "UNKNOWN") {
          await tx.attribution.create({
            data: {
              userId, clientId: row.id, channel: c.channel, source: "DEMO",
              confidence: declared ? declared.confidence : "MEDIUM", method: declared ? "DECLARED" : "INFERRED", declaredAnswer: c.declared,
              contentId: c.contentKey ? (contentIds.get(c.contentKey) ?? null) : null,
            },
          });
        }
      }
      // Rendez-vous + revenus (1:1, mêmes clés de déduplication que les données réelles)
      const apptRows: Prisma.AppointmentCreateManyInput[] = [];
      const seen = new Set<string>();
      for (const a of plan.appointments) {
        const clientId = clientIds.get(a.clientKey)!;
        const dedupKey = appointmentDedupKey({ clientId, startsAt: a.startsAt, serviceName: a.serviceName });
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
        apptRows.push({ userId, clientId, serviceId: a.serviceId, serviceName: a.serviceName, startsAt: a.startsAt, status: a.status, priceCents: a.priceCents, dedupKey, source: "DEMO" });
      }
      await tx.appointment.createMany({ data: apptRows, skipDuplicates: true });
      const created = await tx.appointment.findMany({ where: { userId, source: "DEMO", status: "COMPLETED" }, select: { id: true, clientId: true, serviceId: true, priceCents: true, startsAt: true, dedupKey: true, serviceName: true } });
      await tx.revenue.createMany({
        data: created.map((a) => ({ userId, appointmentId: a.id, clientId: a.clientId, serviceId: a.serviceId, amountCents: a.priceCents, occurredAt: a.startsAt, kind: "SERVICE" as const, dedupKey: appointmentRevenueDedupKey(a.dedupKey), label: a.serviceName, source: "DEMO" as const })),
        skipDuplicates: true,
      });
      // Quelques saisies manuelles en doublon (détectées, non comptées) et une à vérifier
      const sample = created.slice(-3);
      for (const [i, a] of sample.entries()) {
        await tx.revenue.create({
          data: { userId, clientId: i === 2 ? null : a.clientId, amountCents: a.priceCents, occurredAt: new Date(a.startsAt.getTime() + 3_600_000), kind: "SERVICE", dedupKey: manualRevenueDedupKey(`demo-${a.id}`), source: "DEMO", reviewStatus: i === 2 ? "NEEDS_REVIEW" : "DUPLICATE_IGNORED", reviewNote: i === 2 ? "Revenu identique le même jour sans client identifiable : possible doublon" : "Même client, même jour, même montant qu'un revenu existant", label: "Saisie manuelle (DEMO)" },
        });
      }
      // Revues de correspondance "À vérifier"
      for (const [k, cand] of plan.reviewPairs)
        await tx.clientMatchReview.create({ data: { userId, clientId: clientIds.get(k)!, candidateClientId: clientIds.get(cand)!, level: "TO_VERIFY", score: 0.93, reasons: ["Nom approchant (DEMO)"] } });
      // Réseaux
      const accounts = new Map<string, string>();
      for (const platform of ["INSTAGRAM", "TIKTOK"] as const) {
        const acc = await tx.socialAccount.upsert({ where: { userId_platform: { userId, platform } }, create: { userId, platform, status: "CONFIGURATION_REQUIRED" }, update: {} });
        accounts.set(platform, acc.id);
      }
      await tx.socialMetric.createMany({ data: plan.social.map((s) => ({ userId, socialAccountId: accounts.get(s.platform), platform: s.platform, capturedAt: s.capturedAt, followers: s.followers, views: s.views, likes: s.likes, source: "DEMO" as const })), skipDuplicates: true });
      // Leads
      await tx.lead.createMany({ data: plan.leads.map((l) => ({ userId, name: l.name, channel: l.channel, contentId: l.contentKey ? contentIds.get(l.contentKey) : null, status: l.status, createdAt: l.createdAt, source: "DEMO" as const })) });
      // Objectifs (seulement ceux que l'utilisateur n'a pas définis)
      const existingGoals = new Set((await tx.goal.findMany({ where: { userId }, select: { metric: true } })).map((g) => g.metric));
      const demoGoals = [["REVENUE_MONTH", 360000], ["CLIENTS_WEEK", 13], ["VIDEOS_WEEK", 4], ["INSTAGRAM_FOLLOWERS", 2500], ["NEW_CLIENTS_WEEK", 5]] as const;
      for (const [metric, target] of demoGoals) if (!existingGoals.has(metric)) await tx.goal.create({ data: { userId, metric, target, source: "DEMO" } });
      // Missions passées
      await tx.dailyMission.createMany({
        data: plan.missions.map((m, i) => ({ userId, date: m.date, rank: (i % 3) + 1, code: m.code, title: m.title, why: "Historique DEMO", action: m.title, priority: (i % 3) + 1, expectedResult: "—", status: m.status, completedAt: m.date, source: "DEMO" as const })),
        skipDuplicates: true,
      });
      // Une expérience en cours
      await tx.aiExperiment.create({
        data: { userId, hypothesis: "Publier davantage de transformations augmente les visites profil et les nouveaux clients.", action: "4 transformations par semaine pendant 2 semaines", startDate: new Date(now.getTime() - 5 * 86_400_000), durationDays: 14, expectedResult: "+20 % de visites profil, +2 nouveaux clients/semaine", metrics: ["views", "profileVisits", "leads", "newClients", "revenue"], status: "RUNNING", source: "DEMO" },
      });
      // Trace d'import DEMO (provider DEMO : n'active jamais le statut Planity)
      await tx.importBatch.create({ data: { userId, provider: "DEMO", fileName: "demo-planity-export.csv", fileHash: "demo", fileSize: 0, mimeType: "text/csv", status: "COMPLETED", totalRows: apptRows.length, importedRows: apptRows.length, mapping: {}, report: { note: "Import fictif DEMO" }, completedAt: now } });
    },
    { timeout: 120_000 },
  );
  await audit(userId, "demo.loaded", { metadata: { clients: plan.clients.length, appointments: plan.appointments.length, contents: plan.contents.length } });
  logger.info("demo.loaded", { userId, durationMs: Date.now() - started });
  return { clients: plan.clients.length, appointments: plan.appointments.length, contents: plan.contents.length };
}

export async function resetDemoData(userId: string, now = new Date()) {
  const deleted = await deleteDemoData(userId);
  const created = await loadDemoData(userId, now);
  await audit(userId, "demo.reset", { metadata: { deleted } });
  return { deleted, created };
}
