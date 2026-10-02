import { describe, expect, it } from "vitest";
import { emptyDataset } from "@/domain/analytics/dataset";
import { buildSnapshot } from "@/domain/analytics/snapshot";
import { detectAnomalies } from "@/domain/analytics/anomalies";
import { computeContentScores, overallScore } from "@/domain/content/scores";
import { nextBestAction, scoreCandidate } from "@/domain/recommendations";
import { missionsFromCandidates, recentlySkippedCodes, MAX_DAILY_MISSIONS } from "@/domain/missions";
import { appt, content, NOW, withAppointments } from "./fixtures/dataset";
import { lastWeeks, DAY_MS } from "@/lib/dates";

describe("scores de contenu explicables", () => {
  it("non disponibles avec moins de 3 contenus (pas de score arbitraire)", () => {
    const scores = computeContentScores([content({ views: 1000 }), content({ views: 500 })], { social: [], clients: [], attributions: [], revenues: [] });
    const s = [...scores.values()][0]!;
    expect(s.visibility.score).toBeNull();
    expect(s.visibility.explanation).toMatch(/au moins 3 contenus/);
  });
  it("score relatif + facteurs + pondérations configurables", () => {
    const cs = [content({ views: 10000, leads: 5 }), content({ views: 2000, leads: 1 }), content({ views: 500, leads: 0 })];
    const scores = computeContentScores(cs, { social: [], clients: [], attributions: [], revenues: [] });
    const top = scores.get(cs[0]!.id)!;
    expect(top.visibility.score).toBe(100);
    expect(top.visibility.factors.map((f) => f.label)).toContain("Vues");
    expect(top.visibility.factors.find((f) => f.key === "viewsPerFollower")?.display).toBe("Non disponible");
    expect(top.acquisition.explanation).toMatch(/Score relatif à tes 3 contenus/);
    const onlyLeads = computeContentScores(cs, { social: [], clients: [], attributions: [], revenues: [] }, {
      visibility: { views: 1, viewsPerFollower: 0, reach: 0 }, engagement: { likeRate: 1, commentRate: 0, shareRate: 0, saveRate: 0 },
      acquisition: { profileVisits: 0, followersGained: 0, leads: 1 }, business: { clients: 1, revenue: 0 },
    });
    expect(onlyLeads.get(cs[2]!.id)!.acquisition.score).toBe(0);
    expect(overallScore(top)).toBeGreaterThan(overallScore(scores.get(cs[2]!.id)!)!);
  });
  it("un ex æquo à zéro n'obtient jamais un score « moyen » trompeur", () => {
    const cs = [content({ views: 100 }), content({ views: 200 }), content({ views: 300 }), content({ views: 400 })];
    const scores = computeContentScores(cs, { social: [], clients: [], attributions: [], revenues: [] });
    expect(scores.get(cs[0]!.id)!.business.score).toBe(0);
  });
  it("business : clients et CA attribués via le contenu d'origine", () => {
    const cs = [content({ views: 100 }), content({ views: 200 }), content({ views: 300 })];
    const ds = withAppointments([appt("k1", "2026-09-25T08:00:00Z", "Coupe", 4000)]);
    ds.clients[0]!.originContentId = cs[0]!.id;
    const scores = computeContentScores(cs, { social: [], clients: ds.clients, attributions: [], revenues: ds.revenues });
    expect(scores.get(cs[0]!.id)).toMatchObject({ clientsGenerated: 1, revenueGeneratedCents: 4000 });
  });
});

describe("données insuffisantes", () => {
  it("dataset vide : snapshot sans erreur, aucune anomalie, action de mise en place", () => {
    const ds = emptyDataset(NOW);
    const snap = buildSnapshot(ds);
    expect(snap.revenue.week.totalCents).toBe(0);
    expect(snap.revenue.growthWeek).toBeNull();
    expect(snap.revenue.avgTicketMonth).toBeNull();
    expect(snap.clients.week.recurrenceRate).toBeNull();
    expect(snap.social.instagram.latestFollowers).toBeNull();
    expect(snap.social.instagram.status).toBe("CONFIGURATION_REQUIRED");
    expect(snap.planity.status).toBe("CONFIGURATION_REQUIRED");
    expect(detectAnomalies(ds, snap)).toEqual([]);
    const nba = nextBestAction(ds, snap);
    expect(nba.primary?.ruleCode).toBe("SETUP_IMPORT_PLANITY");
  });
});

describe("anomalies", () => {
  it("détecte une chute de vues et formule des causes comme hypothèses", () => {
    const weeks = lastWeeks(8, NOW);
    const cs = weeks.slice(0, 6).map((w) => content({ publishedAt: new Date(w.start.getTime() + 2 * DAY_MS), views: 5000 }));
    cs.push(content({ publishedAt: new Date(weeks[6]!.start.getTime() + 2 * DAY_MS), views: 1000 }));
    const ds = { ...emptyDataset(NOW), contents: cs };
    const anomalies = detectAnomalies(ds, buildSnapshot(ds));
    const drop = anomalies.find((a) => a.code === "VIEWS_DROP");
    expect(drop).toBeDefined();
    expect(drop!.observation).toMatch(/1000 vues/);
    expect(drop!.possibleCauses.length).toBeGreaterThan(0);
    expect(drop!.actionToTest).toBeTruthy();
  });
  it("panier moyen en baisse (4 dernières semaines vs 4 précédentes)", () => {
    const weeks = lastWeeks(8, NOW);
    const appts = weeks.slice(0, 3).flatMap((w, i) => [appt(`o${i}`, new Date(w.start.getTime() + DAY_MS).toISOString(), "Transformation + barbe", 6500), appt(`p${i}`, new Date(w.start.getTime() + 2 * DAY_MS).toISOString(), "Transformation + barbe", 6500)]);
    appts.push(...weeks.slice(3, 7).flatMap((w, i) => [appt(`n${i}`, new Date(w.start.getTime() + DAY_MS).toISOString(), "Coupe", 4000), appt(`m${i}`, new Date(w.start.getTime() + 2 * DAY_MS).toISOString(), "Coupe", 4000)]));
    const ds = withAppointments(appts);
    const a = detectAnomalies(ds, buildSnapshot(ds)).find((x) => x.code === "AVG_TICKET_DOWN");
    expect(a?.observation).toMatch(/40 CHF/);
  });
});

describe("Next Best Action & missions", () => {
  function richDataset() {
    const appts = [];
    for (let i = 0; i < 6; i++) {
      appts.push(appt(`r${i}`, new Date(NOW.getTime() - (120 - i) * DAY_MS).toISOString()));
      appts.push(appt(`r${i}`, new Date(NOW.getTime() - (90 - i) * DAY_MS).toISOString()));
      appts.push(appt(`r${i}`, new Date(NOW.getTime() - (60 - i) * DAY_MS).toISOString()));
    }
    for (let i = 0; i < 20; i++) appts.push(appt(`w${i}`, new Date(NOW.getTime() - (i + 1) * DAY_MS).toISOString(), "Coupe", 4000));
    const ds = withAppointments(appts);
    ds.goals = [{ id: "g", metric: "REVENUE_MONTH", target: 400000 }];
    return ds;
  }
  it("une seule action principale, priorisée vers l'objectif, avec données et confiance", () => {
    const ds = richDataset();
    const snap = buildSnapshot(ds);
    const nba = nextBestAction(ds, snap);
    expect(nba.primary).not.toBeNull();
    expect(nba.primary!.criteria.goalLinked).toBe(true);
    expect(Object.keys(nba.primary!.dataUsed).length).toBeGreaterThan(0);
    expect(["HIGH", "MEDIUM", "LOW"]).toContain(nba.primary!.confidence);
    const scores = nba.candidates.map((c) => c.priorityScore!);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
  it("l'apprentissage et les refus récents modulent la priorité", () => {
    const ds = richDataset();
    const snap = buildSnapshot(ds);
    const base = nextBestAction(ds, snap).primary!;
    expect(scoreCandidate(base, { ruleWeights: { [base.ruleCode]: 0.5 } })).toBeLessThan(scoreCandidate(base));
    const after = nextBestAction(ds, snap, { recentlySkipped: [base.ruleCode], ruleWeights: { [base.ruleCode]: 0.6 } }).primary!;
    expect(after.ruleCode).not.toBe(base.ruleCode);
  });
  it("maximum 5 missions, une par règle", () => {
    const ds = richDataset();
    const all = nextBestAction(ds, buildSnapshot(ds)).candidates;
    const missions = missionsFromCandidates([...all, ...all]);
    expect(missions.length).toBeLessThanOrEqual(MAX_DAILY_MISSIONS);
    expect(new Set(missions.map((m) => m.code)).size).toBe(missions.length);
    for (const m of missions) expect(m.why && m.action && m.expectedResult).toBeTruthy();
  });
  it("règles ignorées ≥ 2 fois en 7 jours", () => {
    const d = (n: number) => new Date(NOW.getTime() - n * DAY_MS);
    expect(recentlySkippedCodes([{ date: d(1), code: "A", status: "SKIPPED" }, { date: d(2), code: "A", status: "SKIPPED" }, { date: d(9), code: "B", status: "SKIPPED" }, { date: d(1), code: "B", status: "SKIPPED" }], NOW)).toEqual(["A"]);
  });
});
