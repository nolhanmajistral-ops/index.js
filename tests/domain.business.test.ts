import { describe, expect, it } from "vitest";
import { averageTicketCents, growth, serviceMix, summarizeRevenue } from "@/domain/revenue/metrics";
import { classifyManualRevenue } from "@/domain/revenue/ledger";
import { clientAggregates, computeClientStats, overdueClients } from "@/domain/clients/metrics";
import { computeGoalProgress } from "@/domain/goals/progress";
import { attributionFromDeclaration, attributionFromManualChannel } from "@/domain/attribution/declared";
import { periodOf, previousPeriod, startOf } from "@/lib/dates";
import { appt, NOW, revFor, withAppointments } from "./fixtures/dataset";

describe("dates (Europe/Zurich)", () => {
  it("semaine du lundi 00:00 heure locale", () => {
    expect(startOf("week", NOW).toISOString()).toBe("2026-09-27T22:00:00.000Z"); // lundi 28.09 00:00 CEST
    expect(startOf("month", NOW).toISOString()).toBe("2026-09-30T22:00:00.000Z");
    expect(previousPeriod("week", NOW).start.toISOString()).toBe("2026-09-20T22:00:00.000Z");
    // Passage à l'heure d'hiver (25.10.2026) : la semaine dure 7 jours + 1 h
    const w = periodOf("week", new Date("2026-10-21T12:00:00Z"));
    expect((w.end.getTime() - w.start.getTime()) / 3_600_000).toBe(169);
  });
});

describe("CA", () => {
  const a1 = appt("c1", "2026-09-29T08:00:00Z", "Coupe", 4000);
  const a2 = appt("c2", "2026-09-30T08:00:00Z", "Coupe + barbe", 5500);
  const a3 = appt("c1", "2026-09-22T08:00:00Z", "Transformation", 5500);
  const cancelled = appt("c3", "2026-09-30T10:00:00Z", "Coupe", 4000, "CANCELLED");
  const revs = [revFor(a1), revFor(a2, { source: "PLANITY" }), revFor(a3), { ...revFor(a1), id: "dup", appointmentId: null, reviewStatus: "DUPLICATE_IGNORED" as const }, { ...revFor(a2), id: "rv", appointmentId: null, reviewStatus: "NEEDS_REVIEW" as const, source: "MANUAL" as const }];
  const week = periodOf("week", NOW);

  it("CA confirmé dédupliqué, par source, à vérifier séparé", () => {
    const s = summarizeRevenue(revs, week);
    expect(s.totalCents).toBe(9500);
    expect(s.bySource.PLANITY).toBe(5500);
    expect(s.bySource.MANUAL).toBe(4000);
    expect(s.pendingReviewCents).toBe(5500);
    expect(s.duplicatesIgnoredCount).toBe(1);
  });
  it("panier moyen = CA prestations / prestations réalisées (annulé exclu)", () => {
    expect(averageTicketCents(revs, [a1, a2, cancelled], week)).toBe(4750);
    expect(averageTicketCents([], [], week)).toBeNull();
  });
  it("mix services et croissance", () => {
    const mix = serviceMix([a1, a2, a3], revs);
    expect(mix.map((m) => m.serviceName)).toContain("Coupe + barbe");
    expect(growth(120, 100)).toBeCloseTo(0.2);
    expect(growth(10, 0)).toBeNull();
  });
});

describe("anti double-comptage (saisie manuelle)", () => {
  const existing = revFor(appt("c1", "2026-09-29T08:00:00Z", "Coupe", 4000), { source: "PLANITY" });
  it("même client, même jour, même montant → doublon", () => {
    expect(classifyManualRevenue({ amountCents: 4000, occurredAt: new Date("2026-09-29T15:00:00Z"), clientId: "c1", serviceId: null, kind: "SERVICE" }, [existing]).decision).toBe("DUPLICATE");
  });
  it("même client, montant différent → revue", () => {
    expect(classifyManualRevenue({ amountCents: 5500, occurredAt: new Date("2026-09-29T15:00:00Z"), clientId: "c1", serviceId: null, kind: "SERVICE" }, [existing]).decision).toBe("REVIEW");
  });
  it("sans client, même montant le même jour → revue (ambigu)", () => {
    expect(classifyManualRevenue({ amountCents: 4000, occurredAt: new Date("2026-09-29T15:00:00Z"), clientId: null, serviceId: null, kind: "SERVICE" }, [existing]).decision).toBe("REVIEW");
  });
  it("autre jour ou produit → création", () => {
    expect(classifyManualRevenue({ amountCents: 4000, occurredAt: new Date("2026-09-30T15:00:00Z"), clientId: "c1", serviceId: null, kind: "SERVICE" }, [existing]).decision).toBe("CREATE");
    expect(classifyManualRevenue({ amountCents: 2500, occurredAt: new Date("2026-09-29T15:00:00Z"), clientId: "c1", serviceId: null, kind: "PRODUCT" }, [existing]).decision).toBe("CREATE");
  });
});

describe("clients", () => {
  const appts = [
    appt("c1", "2026-08-01T08:00:00Z"), appt("c1", "2026-08-22T08:00:00Z"), appt("c1", "2026-09-29T08:00:00Z", "Coupe + barbe", 5500),
    appt("c2", "2026-09-30T08:00:00Z"),
    appt("c3", "2026-06-01T08:00:00Z"), appt("c3", "2026-06-29T08:00:00Z"),
    appt("c4", "2026-09-30T10:00:00Z", "Coupe", 4000, "NO_SHOW"),
  ];
  const ds = withAppointments(appts);
  it("stats d'un client (premier/dernier passage, visites, service préféré, panier)", () => {
    const s = computeClientStats("c1", ds.appointments, ds.revenues);
    expect(s.visits).toBe(3);
    expect(s.firstVisit?.toISOString()).toBe("2026-08-01T08:00:00.000Z");
    expect(s.preferredService).toBe("Coupe");
    expect(s.averageTicketCents).toBe(4500);
    expect(s.isRecurring).toBe(true);
    expect(s.avgIntervalDays).toBeCloseTo(29.5);
  });
  it("agrégats semaine : nouveaux vs récurrents, taux de récurrence, CA/client", () => {
    const a = clientAggregates(ds.appointments, ds.revenues, periodOf("week", NOW), NOW);
    expect(a).toMatchObject({ clientsServed: 2, newClients: 1, returningClients: 1, recurrenceRate: 0.5, revenuePerClientCents: 4750 });
    expect(a.activeClients).toBe(2); // c3 inactif (> 60 jours), c4 absent
  });
  it("clients en retard sur leur fréquence", () => {
    expect(overdueClients(ds.appointments, NOW).map((o) => o.clientId)).toEqual(["c3"]);
  });
});

describe("objectifs", () => {
  it("objectif réel / progression / écart / rythme ; Non disponible si pas de source", () => {
    const ds = withAppointments([appt("c1", "2026-09-29T08:00:00Z", "Coupe", 4000), appt("c2", "2026-10-01T08:00:00Z", "Coupe", 4000)]);
    ds.goals = [
      { id: "g1", metric: "REVENUE_WEEK", target: 70000 },
      { id: "g2", metric: "STORIES_DAY", target: 3 },
      { id: "g3", metric: "INSTAGRAM_FOLLOWERS", target: 5000 },
    ];
    const [rev, stories, ig] = computeGoalProgress(ds);
    expect(rev).toMatchObject({ actual: 8000, gap: 62000, onTrack: false });
    expect(rev!.progress).toBeCloseTo(8000 / 70000);
    expect(stories!.actual).toBeNull();
    expect(stories!.unavailableReason).toMatch(/stories/);
    expect(ig!.actual).toBeNull();
  });
});

describe("attribution", () => {
  it("HIGH uniquement si la source est déclarée et reconnue", () => {
    expect(attributionFromDeclaration("Instagram")).toEqual({ channel: "INSTAGRAM", confidence: "HIGH" });
    expect(attributionFromDeclaration("un ami m'a conseillé")).toEqual({ channel: "WORD_OF_MOUTH", confidence: "HIGH" });
    expect(attributionFromDeclaration("")).toEqual({ channel: "UNKNOWN", confidence: "UNKNOWN" });
    expect(attributionFromDeclaration("je sais plus")).toEqual({ channel: "OTHER", confidence: "LOW" });
    expect(attributionFromManualChannel("TIKTOK")).toEqual({ channel: "TIKTOK", confidence: "MEDIUM", method: "INFERRED" });
    expect(attributionFromManualChannel("UNKNOWN").confidence).toBe("UNKNOWN");
  });
});
