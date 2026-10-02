import { beforeEach, describe, expect, it } from "vitest";
import { createTestUser, prisma, resetDb } from "./helpers/db";
import { loadDemoData, resetDemoData, deleteDemoData } from "@/datahub/demo";
import { createClient } from "@/repositories/clients";
import { createContent } from "@/repositories/contents";
import { createManualRevenue } from "@/repositories/revenues";
import { upsertService } from "@/repositories/services";
import { getAnalytics } from "@/domain/analytics/service";
import { lastWeeks } from "@/lib/dates";

const NOW = new Date("2026-10-02T12:00:00Z");
beforeEach(resetDb);

async function seedCatalog(userId: string) {
  for (const [name, chf] of [["Coupe", 40], ["Coupe + barbe", 55], ["Transformation", 55], ["Transformation + barbe", 65]] as const) await upsertService(userId, { name, priceCents: chf * 100 });
}

describe("Données DEMO", () => {
  it("8 semaines réalistes, relationnelles, toutes marquées DEMO", async () => {
    const u = await createTestUser();
    await seedCatalog(u.id);
    await loadDemoData(u.id, NOW);
    const weeks = lastWeeks(8, NOW).slice(0, 7);
    for (const w of weeks) {
      const n = await prisma.appointment.count({ where: { userId: u.id, status: "COMPLETED", startsAt: { gte: w.start, lt: w.end } } });
      expect(n).toBeGreaterThanOrEqual(10);
      expect(n).toBeLessThanOrEqual(30);
    }
    const appts = await prisma.appointment.count({ where: { userId: u.id } });
    expect(appts).toBeGreaterThanOrEqual(70);
    expect(appts).toBeLessThanOrEqual(140);
    const contents = await prisma.content.count({ where: { userId: u.id } });
    expect(contents).toBeGreaterThanOrEqual(25);
    expect(contents).toBeLessThanOrEqual(40);
    for (const model of ["client", "appointment", "revenue", "content", "socialMetric", "lead", "contentMetric"] as const) {
      // @ts-expect-error accès dynamique au modèle
      const notDemo = await prisma[model].count({ where: { userId: u.id, NOT: { source: "DEMO" } } });
      expect(notDemo, model).toBe(0);
    }
    // Cohérence : chaque revenu de prestation correspond à un RDV réalisé et au même montant
    const completed = await prisma.appointment.aggregate({ where: { userId: u.id, status: "COMPLETED" }, _sum: { priceCents: true } });
    const linked = await prisma.revenue.aggregate({ where: { userId: u.id, appointmentId: { not: null } }, _sum: { amountCents: true } });
    expect(linked._sum.amountCents).toBe(completed._sum.priceCents);
    expect(await prisma.revenue.count({ where: { userId: u.id, reviewStatus: "DUPLICATE_IGNORED" } })).toBeGreaterThan(0);
    expect(await prisma.clientMatchReview.count({ where: { userId: u.id, status: "PENDING" } })).toBe(3);
    // Récurrence réaliste et analytics exploitables
    const { snapshot } = await getAnalytics(u.id, NOW);
    expect(snapshot.clients.eightWeeks.recurrenceRate).toBeGreaterThan(0.15);
    expect(snapshot.content.bestFormat).not.toBeNull();
    expect(snapshot.social.instagram.latestFollowers).toBeGreaterThan(1700);
    // Un import DEMO ne fait jamais passer Planity en "Connected (import)"
    expect(snapshot.planity.status).toBe("CONFIGURATION_REQUIRED");
    expect(snapshot.social.instagram.status).toBe("CONFIGURATION_REQUIRED");
    expect(snapshot.dataQuality.demoData).toBe(true);
  });

  it("RESET DEMO : supprime uniquement source = DEMO, jamais les données réelles ni un autre utilisateur", async () => {
    const u = await createTestUser("U");
    const other = await createTestUser("Other");
    await seedCatalog(u.id);
    await seedCatalog(other.id);
    const real = await createClient(u.id, { fullName: "Vrai Client", email: "vrai@example.com", source: "MANUAL" });
    const realContent = await createContent(u.id, { platform: "INSTAGRAM", title: "Vrai contenu", type: "TRANSFORMATION", status: "PUBLISHED" });
    const realRevenue = await createManualRevenue(u.id, { amountCents: 4000, occurredAt: new Date("2026-09-01"), clientId: real.id, serviceId: null, kind: "SERVICE", reviewStatus: "OK" });
    await loadDemoData(u.id, NOW);
    await loadDemoData(other.id, NOW);
    const otherBefore = await prisma.appointment.count({ where: { userId: other.id } });

    const first = await resetDemoData(u.id, NOW);
    expect(first.deleted.appointments).toBeGreaterThan(0);
    const afterReset = await prisma.appointment.count({ where: { userId: u.id } });
    const second = await resetDemoData(u.id, NOW);
    expect(await prisma.appointment.count({ where: { userId: u.id } })).toBe(afterReset); // déterministe, pas d'accumulation
    expect(second.deleted.appointments).toBe(afterReset);

    expect(await prisma.client.findUnique({ where: { id: real.id } })).not.toBeNull();
    expect(await prisma.content.findUnique({ where: { id: realContent.id } })).not.toBeNull();
    expect(await prisma.revenue.findUnique({ where: { id: realRevenue.id } })).not.toBeNull();
    expect(await prisma.service.count({ where: { userId: u.id } })).toBe(4);
    expect(await prisma.appointment.count({ where: { userId: other.id } })).toBe(otherBefore);

    await deleteDemoData(u.id);
    expect(await prisma.client.count({ where: { userId: u.id } })).toBe(1);
    expect(await prisma.content.count({ where: { userId: u.id } })).toBe(1);
    expect(await prisma.revenue.count({ where: { userId: u.id } })).toBe(1);
    expect(await prisma.appointment.count({ where: { userId: other.id } })).toBe(otherBefore);
  });
});
