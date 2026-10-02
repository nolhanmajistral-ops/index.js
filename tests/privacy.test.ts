import { beforeEach, describe, expect, it } from "vitest";
import { createTestUser, prisma, resetDb } from "./helpers/db";
import { csvCell, toCsv } from "@/datahub/export/csv";
import { exportClient, exportRows } from "@/datahub/export/service";
import { applyRetention } from "@/datahub/privacy/retention";
import { createClient, deleteClient } from "@/repositories/clients";
import { createAppointmentWithRevenue } from "@/repositories/appointments";
import { deleteUserCascade } from "@/repositories/users";
import { rateLimit, resetRateLimits } from "@/lib/rate-limit";

beforeEach(resetDb);

const appt = (userId: string, clientId: string, at: string) => prisma.$transaction((tx) => createAppointmentWithRevenue(userId, { clientId, serviceId: null, serviceName: "Coupe", startsAt: new Date(at), status: "COMPLETED", priceCents: 4000, source: "MANUAL" }, tx));

describe("Exports", () => {
  it("CSV : échappement et protection contre l'injection de formules", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("-12.5")).toBe("-12.5");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(toCsv([{ a: 1, b: null }])).toContain("a,b\r\n1,\r\n");
  });
  it("exports scopés par utilisateur, emails déchiffrés pour le propriétaire uniquement", async () => {
    const a = await createTestUser("A");
    const b = await createTestUser("B");
    const c = await createClient(a.id, { fullName: "Jean Test", email: "jean@example.com", source: "MANUAL" });
    await appt(a.id, c.id, "2026-09-01T08:00:00Z");
    const rows = await exportRows(a.id, "clients");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.email).toBe("jean@example.com");
    expect(await exportRows(b.id, "clients")).toHaveLength(0);
    expect(await exportRows(a.id, "revenue")).toEqual([expect.objectContaining({ montantCHF: 40 })]);
    expect(await exportClient(b.id, c.id)).toBeNull();
    const own = await exportClient(a.id, c.id);
    expect(own?.appointments).toHaveLength(1);
  });
});

describe("NLPD", () => {
  it("suppression d'un client : rendez-vous anonymisés, CA historique conservé", async () => {
    const a = await createTestUser();
    const c = await createClient(a.id, { fullName: "À Supprimer", phone: "079 123 45 67", source: "MANUAL" });
    await appt(a.id, c.id, "2026-09-01T08:00:00Z");
    expect(await deleteClient(a.id, c.id)).toBe(true);
    expect(await prisma.clientIdentifier.count({ where: { clientId: c.id } })).toBe(0);
    const ap = await prisma.appointment.findFirstOrThrow({ where: { userId: a.id } });
    expect(ap.clientId).toBeNull();
  });
  it("rétention : supprime l'ancien, garde le récent", async () => {
    const a = await createTestUser();
    const old = await createClient(a.id, { fullName: "Ancien", source: "MANUAL", createdAt: new Date("2020-01-01") });
    const recent = await createClient(a.id, { fullName: "Récent", source: "MANUAL" });
    await appt(a.id, old.id, "2020-02-01T08:00:00Z");
    await appt(a.id, recent.id, "2026-09-01T08:00:00Z");
    const r = await applyRetention(a.id, 36, new Date("2026-10-02"));
    expect(r).toMatchObject({ appointments: 1, revenues: 1, clients: 1 });
    expect(await prisma.client.findUnique({ where: { id: recent.id } })).not.toBeNull();
    await expect(applyRetention(a.id, 2)).rejects.toThrow();
  });
  it("suppression globale : toutes les données de l'utilisateur, et seulement les siennes", async () => {
    const a = await createTestUser("A");
    const b = await createTestUser("B");
    const ca = await createClient(a.id, { fullName: "A1", source: "MANUAL" });
    const cb = await createClient(b.id, { fullName: "B1", source: "MANUAL" });
    await appt(a.id, ca.id, "2026-09-01T08:00:00Z");
    await appt(b.id, cb.id, "2026-09-01T08:00:00Z");
    await deleteUserCascade(a.id);
    expect(await prisma.client.count({ where: { userId: a.id } })).toBe(0);
    expect(await prisma.revenue.count({ where: { userId: a.id } })).toBe(0);
    expect(await prisma.client.count({ where: { userId: b.id } })).toBe(1);
    expect(await prisma.revenue.count({ where: { userId: b.id } })).toBe(1);
  });
});

describe("Rate limiting", () => {
  it("bloque au-delà de la limite puis libère après la fenêtre", () => {
    resetRateLimits();
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 1000, 0).ok).toBe(true);
    expect(rateLimit("k", 3, 1000, 10)).toMatchObject({ ok: false });
    expect(rateLimit("k", 3, 1000, 1500).ok).toBe(true);
  });
});
