import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createTestUser, prisma, resetDb } from "./helpers/db";
import { rollbackImport, runPlanityImport } from "@/datahub/import";
import { createClient } from "@/repositories/clients";
import { createManualRevenue } from "@/repositories/revenues";
import { upsertService } from "@/repositories/services";

const samples = path.join(process.cwd(), "docs", "samples");
const NOW = new Date("2026-10-02T12:00:00Z");
const csv = () => fs.readFileSync(path.join(samples, "planity-sample.csv"));
const xlsx = () => fs.readFileSync(path.join(samples, "planity-sample.xlsx"));
const importCsv = (userId: string, dryRun = false) => runPlanityImport(userId, { buffer: csv(), kind: "csv", fileName: "planity-sample.csv", mimeType: "text/csv", dryRun, now: NOW });

async function counts(userId: string) {
  const [clients, appointments, revenues, services, reviews] = await Promise.all([
    prisma.client.count({ where: { userId } }),
    prisma.appointment.count({ where: { userId } }),
    prisma.revenue.count({ where: { userId } }),
    prisma.service.count({ where: { userId } }),
    prisma.clientMatchReview.count({ where: { userId } }),
  ]);
  return { clients, appointments, revenues, services, reviews };
}

async function seedCatalog(userId: string) {
  for (const [name, chf] of [["Coupe", 40], ["Coupe + barbe", 55], ["Transformation", 55], ["Transformation + barbe", 65]] as const)
    await upsertService(userId, { name, priceCents: chf * 100 });
}

beforeEach(resetDb);

describe("Import Planity — bout en bout (PostgreSQL)", () => {
  it("l'aperçu (dry-run) calcule le rapport sans rien écrire", async () => {
    const u = await createTestUser();
    await seedCatalog(u.id);
    const before = await counts(u.id);
    const report = await importCsv(u.id, true);
    expect(report.dryRun).toBe(true);
    expect(report.batchId).toBeNull();
    expect(report.importedRows).toBe(19);
    expect(report.duplicateRows).toBe(1);
    expect(report.errorRows).toBe(4);
    expect(await counts(u.id)).toEqual(before);
    expect(await prisma.importBatch.count({ where: { userId: u.id } })).toBe(0);
  });

  it("importe, déduplique, matche, et le réimport produit 0 doublon", async () => {
    const u = await createTestUser();
    await seedCatalog(u.id);
    const r1 = await importCsv(u.id);
    expect(r1).toMatchObject({ totalRows: 24, importedRows: 19, duplicateRows: 1, errorRows: 4, clientsCreated: 10, reviewsCreated: 1 });
    expect(r1.servicesCreated).toEqual([]);
    // CA : rendez-vous réalisés uniquement (annulé, absent, futur exclus)
    // 40+55+55+65+55+40+40+55(Noah estimé)+55+40+40+65+55+40+40+55 = 795 CHF
    expect(r1.revenueCents).toBe(79500);
    expect(r1.estimatedRevenueCents).toBe(5500);
    const c1 = await counts(u.id);
    expect(c1.appointments).toBe(19);
    expect(c1.revenues).toBe(16);
    expect(await prisma.importRowError.count({ where: { importBatch: { userId: u.id } } })).toBe(4);
    // Attribution déclarée → HIGH
    const luca = await prisma.client.findFirstOrThrow({ where: { userId: u.id, displayName: "Luca Bianchi" }, include: { attribution: true, appointments: true } });
    expect(luca.attribution).toMatchObject({ channel: "INSTAGRAM", confidence: "HIGH", method: "DECLARED" });
    expect(luca.appointments).toHaveLength(4);
    // Jean Dupond → revue "À vérifier" vs Jean Dupont, jamais fusionné automatiquement
    const review = await prisma.clientMatchReview.findFirstOrThrow({ where: { userId: u.id }, include: { client: true, candidateClient: true } });
    expect(review.level).toBe("TO_VERIFY");
    expect([review.client.displayName, review.candidateClient.displayName].sort()).toEqual(["Jean Dupond", "Jean Dupont"]);

    const r2 = await importCsv(u.id);
    expect(r2.importedRows).toBe(0);
    expect(r2.duplicateRows).toBe(20);
    expect(r2.clientsCreated).toBe(0);
    expect(r2.alreadyImportedAt).not.toBeNull();
    expect(await counts(u.id)).toEqual(c1);

    // Même données au format XLSX (colonnes EN) → aucun doublon non plus
    const r3 = await runPlanityImport(u.id, { buffer: xlsx(), kind: "xlsx", fileName: "planity-sample.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", dryRun: false, now: NOW });
    expect(r3.importedRows).toBe(0);
    expect(await counts(u.id)).toEqual(c1);
  });

  it("rattache aux clients existants par email/téléphone ; propose une revue sur nom identique", async () => {
    const u = await createTestUser();
    await seedCatalog(u.id);
    const luca = await createClient(u.id, { fullName: "L. Bianchi", email: "LUCA.BIANCHI@example.com", source: "MANUAL" });
    const marco = await createClient(u.id, { fullName: "Marco Rossi", source: "MANUAL" });
    const r = await importCsv(u.id);
    expect(r.matchLevels.CERTAIN).toBeGreaterThanOrEqual(1);
    expect(await prisma.appointment.count({ where: { clientId: luca.id } })).toBe(4);
    // Marco Rossi (nom seul) : nouveau client + revue PROBABLE, pas de fusion automatique
    expect(await prisma.appointment.count({ where: { clientId: marco.id } })).toBe(0);
    const probable = await prisma.clientMatchReview.findFirst({ where: { userId: u.id, candidateClientId: marco.id } });
    expect(probable?.level).toBe("PROBABLE");
  });

  it("anti double-comptage : un revenu manuel identique est marqué doublon, et restauré au rollback", async () => {
    const u = await createTestUser();
    await seedCatalog(u.id);
    const luca = await createClient(u.id, { fullName: "Luca Bianchi", email: "luca.bianchi@example.com", source: "MANUAL" });
    const manual = await createManualRevenue(u.id, { amountCents: 4000, occurredAt: new Date("2026-09-01T08:00:00Z"), clientId: luca.id, serviceId: null, kind: "SERVICE", reviewStatus: "OK" });
    const r = await importCsv(u.id);
    expect(r.manualRevenueMarkedDuplicate).toBe(1);
    const after = await prisma.revenue.findUniqueOrThrow({ where: { id: manual.id } });
    expect(after.reviewStatus).toBe("DUPLICATE_IGNORED");
    const okTotal = await prisma.revenue.aggregate({ where: { userId: u.id, reviewStatus: "OK" }, _sum: { amountCents: true } });
    expect(okTotal._sum.amountCents).toBe(79500); // le manuel n'est pas compté en plus

    await rollbackImport(u.id, r.batchId!);
    const restored = await prisma.revenue.findUniqueOrThrow({ where: { id: manual.id } });
    expect(restored.reviewStatus).toBe("OK");
    expect(restored.duplicateOfId).toBeNull();
  });

  it("rollback : supprime uniquement ce que l'import a créé, puis réimport possible", async () => {
    const u = await createTestUser();
    await seedCatalog(u.id);
    const keep = await createClient(u.id, { fullName: "Client Manuel", source: "MANUAL" });
    const before = await counts(u.id);
    const r = await importCsv(u.id);
    await rollbackImport(u.id, r.batchId!);
    expect(await counts(u.id)).toEqual(before);
    expect(await prisma.client.findUnique({ where: { id: keep.id } })).not.toBeNull();
    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: r.batchId! } });
    expect(batch.status).toBe("ROLLED_BACK");
    await expect(rollbackImport(u.id, r.batchId!)).rejects.toThrow();
    const again = await importCsv(u.id);
    expect(again.importedRows).toBe(19);
  });

  it("un autre utilisateur ne peut pas annuler mon import", async () => {
    const a = await createTestUser("A");
    const b = await createTestUser("B");
    await seedCatalog(a.id);
    const r = await importCsv(a.id);
    await expect(rollbackImport(b.id, r.batchId!)).rejects.toThrow("Import introuvable");
    expect(await prisma.appointment.count({ where: { userId: a.id } })).toBe(19);
  });

  it("crée les prestations inconnues (source PLANITY) et les supprime au rollback", async () => {
    const u = await createTestUser();
    const r = await importCsv(u.id);
    expect(r.servicesCreated.sort()).toEqual(["Coupe", "Coupe + barbe", "Transformation", "Transformation + barbe"]);
    await rollbackImport(u.id, r.batchId!);
    expect(await prisma.service.count({ where: { userId: u.id } })).toBe(0);
  });
});
