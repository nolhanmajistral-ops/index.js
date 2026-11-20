import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyDataset } from "@/domain/analytics/dataset";
import { buildSnapshot } from "@/domain/analytics/snapshot";
import { buildAiContext } from "@/ai/context/context-builder";
import { deterministicAnswer, detectIntent, INSUFFICIENT, SUGGESTED_QUESTIONS } from "@/ai/coach/deterministic";
import { cleanText } from "@/ai/style/humanize";
import { planningPatterns } from "@/domain/analytics/planning-patterns";
import { evaluate, ruleWeightsFromHistory } from "@/ai/learning/learning-engine";
import { deterministicIdea } from "@/ai/content/generator";
import { setAIProviderForTests, type AIProvider } from "@/ai/providers";
import { askCoach } from "@/ai/coach/coach";
import { ensureTodayMissions, recordMissionResult, runLearningCycle } from "@/ai/recommendations/service";
import { createClient } from "@/repositories/clients";
import { createAppointmentWithRevenue } from "@/repositories/appointments";
import { appt, NOW, withAppointments } from "./fixtures/dataset";
import { createTestUser, prisma, resetDb } from "./helpers/db";
import { DAY_MS } from "@/lib/dates";

const extras = { memories: [], recentRecommendations: [], experiments: [], nextMove: null, profile: null };

describe("ContextBuilder", () => {
  it("n'envoie que des agrégats (aucun identifiant ni donnée personnelle)", () => {
    const ds = withAppointments([appt("client-secret-id", "2026-09-29T08:00:00Z")]);
    const ctx = JSON.stringify(buildAiContext(buildSnapshot(ds), [], extras));
    expect(ctx).not.toContain("client-secret-id");
    expect(ctx).not.toMatch(/@|\+41/);
    expect(JSON.parse(ctx).business.caSemaine).toBe(40);
  });
  it("signale les données DEMO", () => {
    const ds = withAppointments([{ ...appt("c", "2026-09-29T08:00:00Z"), source: "DEMO" }]);
    expect(buildAiContext(buildSnapshot(ds), [], extras).qualiteDonnees.note).toMatch(/DEMO/);
  });
});

describe("Coach déterministe", () => {
  it("détecte les intentions des questions du cahier des charges", () => {
    expect(detectIntent("Que dois-je faire aujourd'hui ?")).toBe("today");
    expect(detectIntent("Pourquoi ?")).toBe("why");
    expect(detectIntent("Quel contenu dois-je publier ?")).toBe("content");
    expect(detectIntent("Qu'est-ce qui fonctionne ?")).toBe("works");
    expect(detectIntent("Qu'est-ce qui baisse ?")).toBe("declining");
    expect(detectIntent("Comment augmenter mon CA ?")).toBe("revenue");
    expect(detectIntent("Comment augmenter mon panier moyen ?")).toBe("basket");
    expect(detectIntent("Comment obtenir plus de clients ?")).toBe("clients");
  });
  it("répond « Données insuffisantes pour conclure. » sans données", () => {
    const s = buildSnapshot(emptyDataset(NOW));
    for (const q of ["Comment augmenter mon CA ?", "Comment augmenter mon panier moyen ?", "Qu'est-ce qui baisse ?", "Quel contenu dois-je publier ?", "Qu'est-ce qui fonctionne ?"]) {
      const a = deterministicAnswer(q, s, [], null);
      expect(a.insufficient, q).toBe(true);
      expect(a.answer).toContain(INSUFFICIENT);
    }
  });
  it("répond avec des chiffres réels quand ils existent", () => {
    const ds = withAppointments([appt("c1", "2026-10-01T08:00:00Z", "Coupe", 4000), appt("c2", "2026-10-01T09:00:00Z", "Coupe + barbe", 5500)]);
    const a = deterministicAnswer("Comment augmenter mon CA ?", buildSnapshot(ds), [], null);
    expect(a.insufficient).toBe(false);
    expect(a.answer).toContain("95 CHF");
  });
});

describe("Coach : une réponse adaptée à chaque question", () => {
  const data = () => withAppointments([
    appt("c1", "2026-08-07T08:00:00Z"), appt("c1", "2026-08-28T08:00:00Z"),
    appt("c2", "2026-09-29T09:00:00Z", "Coupe + barbe", 5500), appt("c3", "2026-10-01T14:00:00Z"),
    appt("c4", "2026-10-03T09:00:00Z", "Coupe", 4000, "BOOKED"),
  ]);
  it("reconnaît les nouvelles questions suggérées, chacune avec son sujet", () => {
    expect(SUGGESTED_QUESTIONS.map(detectIntent)).toEqual(["brief", "filling", "content", "trends", "retention", "reviews", "pricing", "basket"]);
    expect(detectIntent("Comment éviter les lapins ?")).toBe("noshow");
    expect(detectIntent("Que répondre à un DM qui demande le prix ?")).toBe("pricing");
    expect(detectIntent("Que répondre à ce message ?")).toBe("dm");
    expect(detectIntent("Idées de stories pour aujourd'hui")).toBe("stories");
    expect(detectIntent("Salut")).toBe("general");
  });
  it("des questions différentes ne reçoivent jamais la même réponse", () => {
    const s = buildSnapshot(data());
    const questions = [...SUGGESTED_QUESTIONS, "Comment éviter les lapins ?", "Que répondre à ce message ?", "Idées de stories pour aujourd'hui", "Salut", "Pourquoi ?", "Qu'est-ce qui baisse ?"];
    const answers = questions.map((q) => deterministicAnswer(q, s, [], null).answer);
    expect(new Set(answers).size).toBe(questions.length);
  });
  it("tendances : ne les invente pas sans recherche web", () => {
    const a = deterministicAnswer("Qu'est-ce qui marche en ce moment dans la niche barber ?", buildSnapshot(data()), [], null);
    expect(a.answer).toMatch(/recherche web/);
    expect(a.answer).toMatch(/je ne vais pas t'inventer/i);
  });
  it("créneaux vides : cite les jours sans rendez-vous des 7 prochains jours", () => {
    const a = deterministicAnswer("Comment remplir mes créneaux vides ?", buildSnapshot(data()), [], null);
    expect(a.answer).toMatch(/Jours sans aucun rendez-vous/);
    expect(a.answer).toMatch(/dimanche/); // 4 oct. 2026 : aucun rendez-vous
    expect(a.answer).not.toMatch(/samedi,/); // samedi 3 oct. : 1 rendez-vous réservé
  });
  it("idées de vidéos variées : la sélection change selon le jour", () => {
    const ideas = (iso: string) => deterministicAnswer("Donne-moi 3 idées de vidéos", buildSnapshot({ ...emptyDataset(new Date(iso)) }), [], null).answer;
    const days = ["2026-10-01T12:00:00Z", "2026-10-02T12:00:00Z", "2026-10-03T12:00:00Z", "2026-10-04T12:00:00Z"].map(ideas);
    expect(new Set(days).size).toBeGreaterThan(1);
    expect(days[0]).toContain(INSUFFICIENT);
  });
});

describe("Planning : habitudes et charge à venir", () => {
  it("compte les jours remplis, les tranches horaires et les rendez-vous des 7 prochains jours", () => {
    const ds = withAppointments([appt("a", "2026-09-29T08:00:00Z"), appt("b", "2026-09-29T13:00:00Z"), appt("c", "2026-09-30T16:00:00Z"), appt("d", "2026-10-03T09:00:00Z", "Coupe", 4000, "BOOKED")]);
    const p = planningPatterns(ds.appointments, { start: new Date("2026-08-01"), end: new Date("2026-10-10") }, NOW, "Europe/Zurich");
    expect(p.total).toBe(3);
    expect(p.busiestDays[0]).toBe("mardi");
    expect(p.bySlot).toEqual({ matin: 1, midi: 0, apresMidi: 1, soir: 1 }); // heures de Zurich (UTC+2)
    expect(p.quietestDays).toEqual([]); // moins de 10 rendez-vous : pas de conclusion
    expect(p.nextDays[0]).toEqual({ day: "vendredi", booked: 0 });
    expect(p.nextDays[1]).toEqual({ day: "samedi", booked: 1 });
  });
});

describe("Style humain", () => {
  it("retire tirets longs, caractères invisibles et apostrophes courbes", () => {
    expect(cleanText("Le dégradé — c'est la base\u200B. Tu l’as ? Oui…")).toBe("Le dégradé, c'est la base. Tu l'as ? Oui...");
    expect(cleanText("— point de liste")).toBe("- point de liste");
  });
});

describe("Générateur de contenu", () => {
  it("utilise un modèle par défaut explicitement présenté comme hypothèse sans historique", () => {
    const idea = deterministicIdea(buildSnapshot(emptyDataset(NOW)));
    expect(idea.format).toBe("TRANSFORMATION");
    expect(idea.justification).toMatch(/hypothèse/);
    expect(idea.disclaimer).toMatch(/Aucune garantie/);
    expect(idea.hook && idea.cta && idea.caption && idea.script.length && idea.plans.length && idea.hashtags.length && idea.stories.length).toBeTruthy();
  });
});

describe("LearningEngine", () => {
  it("évalue avant/après et reste INCONCLUSIVE sans données", () => {
    const created = new Date(NOW.getTime() - 14 * DAY_MS);
    const appts = [appt("a", new Date(created.getTime() - 3 * DAY_MS).toISOString()), ...[1, 2, 3].map((i) => appt(`b${i}`, new Date(created.getTime() + i * DAY_MS).toISOString()))];
    const ev = evaluate({ metric: "clientsServed", horizonDays: 7, createdAt: created, actedAt: created }, withAppointments(appts));
    expect(ev).toMatchObject({ outcome: "POSITIVE", before: 1, after: 3 });
    expect(ev.note).toMatch(/pas une preuve de causalité/);
    expect(evaluate({ metric: "avgTicket", horizonDays: 7, createdAt: created, actedAt: null }, emptyDataset(NOW)).outcome).toBe("INCONCLUSIVE");
  });
  it("les poids appris favorisent les règles qui ont fonctionné", () => {
    const w = ruleWeightsFromHistory([
      { ruleCode: "GOOD", outcome: "POSITIVE", status: "DONE", count: 3 },
      { ruleCode: "BAD", outcome: "NEGATIVE", status: "DONE", count: 3 },
      { ruleCode: "BAD", outcome: null, status: "SKIPPED", count: 2 },
    ]);
    expect(w.GOOD).toBeGreaterThan(1);
    expect(w.BAD).toBeLessThan(1);
    expect(w.BAD).toBeGreaterThanOrEqual(0.6);
  });
});

describe("Boucle complète (PostgreSQL)", () => {
  beforeEach(resetDb);
  afterEach(() => setAIProviderForTests(null));

  it("missions ≤ 5 → résultat → recommandation DONE → évaluation → mémoire", async () => {
    const u = await createTestUser();
    const t0 = new Date("2026-09-10T10:00:00Z");
    for (let i = 0; i < 6; i++) {
      const c = await createClient(u.id, { fullName: `Client ${i}`, source: "MANUAL" });
      for (const d of [100, 70, 40]) await prisma.$transaction((tx) => createAppointmentWithRevenue(u.id, { clientId: c.id, serviceId: null, serviceName: "Coupe", startsAt: new Date(t0.getTime() - (d + i) * DAY_MS), status: "COMPLETED", priceCents: 4000, source: "MANUAL" }, tx));
    }
    const missions = await ensureTodayMissions(u.id, t0);
    expect(missions.length).toBeGreaterThan(0);
    expect(missions.length).toBeLessThanOrEqual(5);
    expect(await ensureTodayMissions(u.id, t0)).toHaveLength(missions.length); // idempotent
    const linked = missions.find((m) => m.recommendationId);
    expect(linked).toBeDefined();
    await recordMissionResult(u.id, linked!.id, "DONE", "Fait en 20 minutes");
    const rec = await prisma.aiRecommendation.findUniqueOrThrow({ where: { id: linked!.recommendationId! } });
    expect(rec.status).toBe("DONE");
    // Des clients reviennent après l'action
    for (let i = 0; i < 3; i++) {
      const c = await prisma.client.findFirstOrThrow({ where: { userId: u.id, displayName: `Client ${i}` } });
      await prisma.$transaction((tx) => createAppointmentWithRevenue(u.id, { clientId: c.id, serviceId: null, serviceName: "Coupe", startsAt: new Date(t0.getTime() + (i + 1) * DAY_MS), status: "COMPLETED", priceCents: 4000, source: "MANUAL" }, tx));
    }
    const results = await runLearningCycle(u.id, new Date(t0.getTime() + 30 * DAY_MS));
    expect(results.length).toBeGreaterThan(0);
    const evaluated = await prisma.aiRecommendation.findUniqueOrThrow({ where: { id: rec.id } });
    expect(evaluated.evaluatedAt).not.toBeNull();
    expect(evaluated.outcome).not.toBeNull();
    expect(await prisma.aiMemory.count({ where: { userId: u.id, kind: "RECOMMENDATION_OUTCOME" } })).toBeGreaterThan(0);
    expect(await prisma.aiMemory.count({ where: { userId: u.id, kind: "DECISION" } })).toBe(1);
  });

  it("coach : mode déterministe sans fournisseur ; avec fournisseur, le payload ne contient aucune donnée personnelle", async () => {
    const u = await createTestUser();
    const c = await createClient(u.id, { fullName: "Secret Person", email: "secret@example.com", phone: "079 111 22 33", source: "MANUAL" });
    await prisma.$transaction((tx) => createAppointmentWithRevenue(u.id, { clientId: c.id, serviceId: null, serviceName: "Coupe", startsAt: new Date(), status: "COMPLETED", priceCents: 4000, source: "MANUAL" }, tx));
    const plain = await askCoach(u.id, "Que dois-je faire aujourd'hui ?");
    expect(plain.mode).toBe("deterministic");

    let captured = "";
    const fake: AIProvider = { name: "fake", isConfigured: () => true, async complete({ system, messages }) { captured = system + JSON.stringify(messages); return { text: "Réponse LLM", model: "fake-1", provider: "fake" }; } };
    setAIProviderForTests(fake);
    const llm = await askCoach(u.id, "Comment augmenter mon CA ?");
    expect(llm).toMatchObject({ mode: "llm", answer: "Réponse LLM" });
    expect(captured).toContain("Données insuffisantes pour conclure");
    expect(captured).not.toContain("Secret Person");
    expect(captured).not.toContain("secret@example.com");
    expect(captured).not.toContain("111 22 33");

    // Fournisseur en flux : prompt expert barber, recherche web demandée, texte progressif, sources, style nettoyé.
    let request: { system: string; messages: { content: string }[]; webSearch?: boolean } | null = null;
    const deltas: string[] = [];
    setAIProviderForTests({
      ...fake,
      async stream(input, handlers) {
        request = input;
        handlers.onStatus?.("Recherche web en cours…");
        for (const d of ["Remplis jeudi ", "— poste une story."]) handlers.onText?.(d);
        return { text: "Remplis jeudi — poste une story.", model: "fake-2", provider: "fake", sources: [{ title: "Tendances", url: "https://example.com/t" }] };
      },
    });
    const streamed = await askCoach(u.id, "Comment remplir mes créneaux vides ?", [], new Date(), { onText: (d) => deltas.push(d) });
    expect(streamed).toMatchObject({ mode: "llm", answer: "Remplis jeudi, poste une story.", sources: [{ url: "https://example.com/t" }] });
    expect(deltas).toHaveLength(2);
    expect(request!.system).toContain("expert reconnu de la niche barber");
    expect(request!.webSearch).toBe(true);
    const last = request!.messages.at(-1)!.content;
    expect(last).toContain("Question de Nolhan : Comment remplir mes créneaux vides ?");
    expect(last).toContain("<donnees_nolhan_os");
    expect(last).not.toContain("Secret Person");

    setAIProviderForTests({ ...fake, async complete() { throw new Error("timeout"); } });
    const fallback = await askCoach(u.id, "Comment augmenter mon CA ?");
    expect(fallback.mode).toBe("deterministic");
    expect(fallback.notice).toMatch(/n'a pas répondu/);
  });
});
