import { beforeEach, describe, expect, it } from "vitest";
import { matchClient } from "@/datahub/matching";
import { createTestUser, prisma, resetDb } from "./helpers/db";
import { createClient } from "@/repositories/clients";
import { createMatchReview } from "@/repositories/match-reviews";
import { decideMatchReview } from "@/domain/clients/review";
import { createAppointmentWithRevenue } from "@/repositories/appointments";

const base = { emailHash: null, phoneHash: null, sourceKeys: [] as string[] };

describe("matchClient (règles)", () => {
  const existing = [
    { id: "a", normalizedName: "dupont jean", emailHash: "E1", phoneHash: null, sourceKeys: [] },
    { id: "b", normalizedName: "bianchi luca", emailHash: null, phoneHash: "P1", sourceKeys: ["PLANITY:name:bianchi luca"] },
    { id: "c", normalizedName: "martin paul", emailHash: "E3", phoneHash: null, sourceKeys: [] },
  ];
  it("CERTAIN sur email ou téléphone identique", () => {
    expect(matchClient({ normalizedName: "x", emailHash: "E1", phoneHash: null, sourceKey: null }, existing)).toMatchObject({ level: "CERTAIN", clientId: "a" });
    expect(matchClient({ normalizedName: "x", emailHash: null, phoneHash: "P1", sourceKey: null }, existing)).toMatchObject({ level: "CERTAIN", clientId: "b" });
  });
  it("PROBABLE sur nom identique : aucun rattachement automatique", () => {
    const r = matchClient({ normalizedName: "dupont jean", emailHash: null, phoneHash: null, sourceKey: null }, existing);
    expect(r).toMatchObject({ level: "PROBABLE", clientId: null, candidateId: "a" });
  });
  it("TO_VERIFY sur nom approchant", () => {
    const r = matchClient({ normalizedName: "dupond jean", emailHash: null, phoneHash: null, sourceKey: null }, existing);
    expect(r).toMatchObject({ level: "TO_VERIFY", clientId: null, candidateId: "a" });
  });
  it("UNKNOWN sinon, et pas de proposition si les emails sont en conflit", () => {
    expect(matchClient({ normalizedName: "zidane z", ...base, sourceKey: null }, existing).level).toBe("UNKNOWN");
    expect(matchClient({ normalizedName: "martin paul", emailHash: "AUTRE", phoneHash: null, sourceKey: null }, existing).level).toBe("UNKNOWN");
  });
});

describe("File de revue (PostgreSQL)", () => {
  beforeEach(resetDb);
  it("Fusionner transfère les rendez-vous et trace la décision ; Ignorer conserve les deux", async () => {
    const u = await createTestUser();
    const keep = await createClient(u.id, { fullName: "Jean Dupont", email: "j@example.com", source: "MANUAL" });
    const dup = await createClient(u.id, { fullName: "Jean Dupond", source: "PLANITY" });
    const other = await createClient(u.id, { fullName: "Jean Dupons", source: "PLANITY" });
    await prisma.$transaction((tx) => createAppointmentWithRevenue(u.id, { clientId: dup.id, serviceId: null, serviceName: "Coupe", startsAt: new Date("2026-09-01T08:00:00Z"), status: "COMPLETED", priceCents: 4000, source: "PLANITY" }, tx));
    const r1 = await createMatchReview(u.id, { clientId: dup.id, candidateClientId: keep.id, level: "TO_VERIFY", score: 0.95, reasons: ["Nom approchant"] });
    const r2 = await createMatchReview(u.id, { clientId: other.id, candidateClientId: keep.id, level: "TO_VERIFY", score: 0.93, reasons: ["Nom approchant"] });

    const b = await createTestUser("B");
    await expect(decideMatchReview(b.id, r1.id, "MERGE")).rejects.toThrow("Revue introuvable");

    await decideMatchReview(u.id, r1.id, "MERGE");
    expect(await prisma.client.findUnique({ where: { id: dup.id } })).toBeNull();
    expect(await prisma.appointment.count({ where: { clientId: keep.id } })).toBe(1);
    expect(await prisma.revenue.count({ where: { clientId: keep.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { userId: u.id, action: "client.match.merged" } })).toBe(1);

    await decideMatchReview(u.id, r2.id, "IGNORE");
    expect(await prisma.client.count({ where: { userId: u.id } })).toBe(2);
    expect((await prisma.clientMatchReview.findUniqueOrThrow({ where: { id: r2.id } })).status).toBe("IGNORED");
    await expect(decideMatchReview(u.id, r2.id, "MERGE")).rejects.toThrow("déjà traitée");
  });
});
