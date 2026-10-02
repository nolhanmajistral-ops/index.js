import { beforeEach, describe, expect, it } from "vitest";
import { createTestUser, prisma, resetDb } from "./helpers/db";
import { addPlanningAppointment, defaultStatus, setAppointmentStatus } from "@/domain/planning/service";
import { createClient } from "@/repositories/clients";
import { upsertService } from "@/repositories/services";

beforeEach(resetDb);

const NOW = new Date("2026-10-02T12:00:00Z");

async function setup() {
  const u = await createTestUser();
  const coupe = await upsertService(u.id, { name: "Coupe", priceCents: 4000 });
  return { u, coupe };
}

describe("Planning manuel", () => {
  it("statut par défaut : passé = réalisé, futur = réservé", () => {
    expect(defaultStatus(new Date("2026-10-01T09:00:00Z"), NOW)).toBe("COMPLETED");
    expect(defaultStatus(new Date("2026-10-05T09:00:00Z"), NOW)).toBe("BOOKED");
  });

  it("un rendez-vous passé crée le revenu ; un futur non", async () => {
    const { u, coupe } = await setup();
    await addPlanningAppointment(u.id, { clientName: "Karim Benali", serviceId: coupe.id, startsAt: new Date("2026-10-01T09:00:00Z") }, NOW);
    await addPlanningAppointment(u.id, { clientName: "Luca Bianchi", serviceId: coupe.id, startsAt: new Date("2026-10-05T09:00:00Z") }, NOW);
    expect(await prisma.appointment.count({ where: { userId: u.id } })).toBe(2);
    expect(await prisma.revenue.count({ where: { userId: u.id } })).toBe(1);
    expect(await prisma.client.count({ where: { userId: u.id } })).toBe(2);
  });

  it("réutilise un client au nom identique (unique) au lieu d'en créer un nouveau", async () => {
    const { u, coupe } = await setup();
    const c = await createClient(u.id, { fullName: "Karim Benali", source: "MANUAL" });
    await addPlanningAppointment(u.id, { clientName: "karim  benali", serviceId: coupe.id, startsAt: new Date("2026-10-01T09:00:00Z") }, NOW);
    expect(await prisma.client.count({ where: { userId: u.id } })).toBe(1);
    expect(await prisma.appointment.count({ where: { clientId: c.id } })).toBe(1);
  });

  it("le prix saisi remplace le tarif ; pas de doublon pour le même créneau", async () => {
    const { u, coupe } = await setup();
    const at = new Date("2026-10-01T09:00:00Z");
    await addPlanningAppointment(u.id, { clientName: "Noah Favre", serviceId: coupe.id, startsAt: at, priceCents: 3500 }, NOW);
    const again = await addPlanningAppointment(u.id, { clientName: "Noah Favre", serviceId: coupe.id, startsAt: at }, NOW);
    expect(again.duplicate).toBe(true);
    const rev = await prisma.revenue.findFirstOrThrow({ where: { userId: u.id } });
    expect(rev.amountCents).toBe(3500);
  });

  it("changer le statut ajoute ou retire le revenu (jamais en double)", async () => {
    const { u, coupe } = await setup();
    const r = await addPlanningAppointment(u.id, { clientName: "Adam Keller", serviceId: coupe.id, startsAt: new Date("2026-10-05T09:00:00Z") }, NOW);
    const id = r.appointment.id;
    expect(await prisma.revenue.count({ where: { appointmentId: id } })).toBe(0);
    await setAppointmentStatus(u.id, id, "COMPLETED");
    await setAppointmentStatus(u.id, id, "COMPLETED");
    expect(await prisma.revenue.count({ where: { appointmentId: id } })).toBe(1);
    await setAppointmentStatus(u.id, id, "CANCELLED");
    expect(await prisma.revenue.count({ where: { appointmentId: id } })).toBe(0);
    await setAppointmentStatus(u.id, id, "COMPLETED");
    expect(await prisma.revenue.count({ where: { appointmentId: id } })).toBe(1);
  });

  it("un autre utilisateur ne peut pas modifier mon rendez-vous", async () => {
    const { u, coupe } = await setup();
    const other = await createTestUser("B");
    const r = await addPlanningAppointment(u.id, { serviceId: coupe.id, startsAt: new Date("2026-10-05T09:00:00Z") }, NOW);
    expect(await setAppointmentStatus(other.id, r.appointment.id, "COMPLETED")).toBeNull();
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: r.appointment.id } })).status).toBe("BOOKED");
  });

  it("refuse une prestation d'un autre utilisateur", async () => {
    const { u } = await setup();
    const other = await createTestUser("B");
    const foreign = await upsertService(other.id, { name: "Coupe", priceCents: 4000 });
    await expect(addPlanningAppointment(u.id, { serviceId: foreign.id, startsAt: NOW }, NOW)).rejects.toThrow("Prestation introuvable");
  });
});
