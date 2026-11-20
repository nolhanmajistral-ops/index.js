import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSnapshot } from "@/domain/analytics/snapshot";
import { emptyDataset } from "@/domain/analytics/dataset";
import { deterministicAudit, runStudio, studioFallback } from "@/ai/studio/studio";
import { STUDIO_MODES } from "@/ai/studio/modes";
import { STUDIO_METHODS } from "@/ai/studio/methods";
import { setAIProviderForTests, type AIProvider, type AIRequest } from "@/ai/providers";
import { createClient } from "@/repositories/clients";
import { createAppointmentWithRevenue } from "@/repositories/appointments";
import { content, NOW, withAppointments, appt } from "./fixtures/dataset";
import { createTestUser, prisma, resetDb } from "./helpers/db";

describe("Studio : trames sans IA", () => {
  it("chaque mode produit une trame utile, sans valeur manquante affichée", () => {
    const ds = withAppointments([appt("c1", "2026-09-29T08:00:00Z")]);
    const s = buildSnapshot(ds);
    for (const m of STUDIO_MODES) {
      const inputs = Object.fromEntries(m.fields.map((f) => [f.name, f.options?.[0]?.value ?? "Transformation burst fade"]));
      const text = studioFallback(m.id, inputs, s, ds);
      expect(text.length, m.id).toBeGreaterThan(40);
      expect(text, m.id).not.toMatch(/undefined|NaN|\[object/);
    }
  });
  it("chaque mode a sa méthode", () => {
    for (const m of STUDIO_MODES) expect(STUDIO_METHODS[m.id], m.id).toMatch(/MÉTHODE/);
  });
  it("audit : classe par multiple de la médiane et refuse de conclure sans données", () => {
    const empty = emptyDataset(NOW);
    expect(deterministicAudit(empty, buildSnapshot(empty))).toMatch(/Données insuffisantes pour conclure/);
    const ds = { ...emptyDataset(NOW), contents: [content({ title: "Avant/après Karim", views: 9000 }), content({ title: "Conseil barbe", type: "ADVICE", views: 1000 }), content({ title: "Coulisses", type: "BEHIND_THE_SCENES", views: 3000 })] };
    const text = deterministicAudit(ds, buildSnapshot(ds));
    expect(text).toMatch(/médiane 3000 vues/);
    expect(text.indexOf("3.0x « Avant/après Karim »")).toBeLessThan(text.indexOf("0.3x « Conseil barbe »"));
  });
});

describe("Studio avec IA (PostgreSQL)", () => {
  beforeEach(resetDb);
  afterEach(() => setAIProviderForTests(null));

  it("envoie la méthode du mode, la demande et les chiffres, jamais les données personnelles des clients", async () => {
    const u = await createTestUser();
    const c = await createClient(u.id, { fullName: "Secret Person", email: "secret@example.com", phone: "079 111 22 33", source: "MANUAL" });
    await prisma.$transaction((tx) => createAppointmentWithRevenue(u.id, { clientId: c.id, serviceId: null, serviceName: "Coupe", startsAt: new Date(), status: "COMPLETED", priceCents: 4000, source: "MANUAL" }, tx));
    const requests: AIRequest[] = [];
    const fake: AIProvider = {
      name: "fake",
      isConfigured: () => true,
      async complete(r) { requests.push(r); return { text: "x", model: "fake", provider: "fake" }; },
      async stream(r, h) { requests.push(r); h.onText?.("Accroche — test"); return { text: "Accroche — test", model: "fake-1", provider: "fake" }; },
    };
    setAIProviderForTests(fake);
    const reel = await runStudio(u.id, "reel", { idee: "Burst fade sur cheveux bouclés", duree: "30" });
    expect(reel).toMatchObject({ mode: "llm", text: "Accroche, test" });
    const r = requests[0]!;
    expect(r.system).toContain("MÉTHODE : SCRIPT REEL");
    expect(r.system).toContain("N'invente JAMAIS");
    expect(r.webSearch).toBe(false);
    const msg = r.messages[0]!.content;
    expect(msg).toContain("Burst fade sur cheveux bouclés");
    expect(msg).toContain("<donnees_nolhan_os");
    expect(msg).not.toMatch(/Secret Person|secret@example\.com|111 22 33/);

    await runStudio(u.id, "trends", {});
    expect(requests[1]!.webSearch).toBe(true);
    expect(requests[1]!.system).toContain("MÉTHODE : TENDANCES");
  });

  it("sans fournisseur ou en cas d'erreur : trame sans IA", async () => {
    const u = await createTestUser();
    const none = await runStudio(u.id, "caption", { sujet: "Avant/après low taper", role: "A" });
    expect(none.mode).toBe("deterministic");
    setAIProviderForTests({ name: "broken", isConfigured: () => true, async complete() { throw new Error("timeout"); } });
    const broken = await runStudio(u.id, "stories", { objectif: "remplir" });
    expect(broken).toMatchObject({ mode: "deterministic", notice: expect.stringMatching(/n'a pas répondu/) });
  });
});
