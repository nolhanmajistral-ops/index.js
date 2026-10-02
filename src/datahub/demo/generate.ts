import type { AcquisitionChannel, ContentStatus, ContentType, Platform } from "@prisma/client";
import { DAY_MS, startOf, zonedMidnight, localDateKey } from "@/lib/dates";

/**
 * Générateur DEMO déterministe et RELATIONNEL : les clients, rendez-vous, revenus, contenus, attributions et
 * snapshots sont générés ensemble pour rester cohérents (aucune statistique indépendante incompatible).
 * Toutes les entités portent source = DEMO.
 */
export function prng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFrom(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

const FIRST = ["Luca", "Karim", "Yanis", "Noah", "Elias", "Adam", "Samir", "Mehdi", "Hugo", "Leo", "Nathan", "Ilyes", "Rayan", "Gabriel", "Mattia", "Arthur", "Enzo", "Sami", "Liam", "Jonas", "Malik", "Theo", "Bilal", "Diego", "Ryan", "Kenan", "Emir", "Nils", "Axel", "Yusuf", "Marco", "Dario", "Timo", "Aaron", "Ismail", "Loris", "Kevin", "Bastien", "Amir", "Robin", "Florian", "Hamza", "Alessio", "Victor", "Omar"];
const LAST = ["Bianchi", "Benali", "Morel", "Favre", "Meier", "Keller", "Haddad", "Rossi", "Blanc", "Girard", "Müller", "Dubois", "Rochat", "Bonvin", "Cattaneo", "Yilmaz", "Kaya", "Ferreira", "Santos", "Martin", "Perret", "Jaquet", "Gashi", "Krasniqi", "Berisha", "Moreau", "Fontana", "Schmid", "Huber", "Aydin"];

export interface DemoService { id: string; name: string; priceCents: number }

export interface DemoPlan {
  clients: { key: string; firstName: string; lastName: string; channel: AcquisitionChannel; declared: string | null; contentKey: string | null; createdAt: Date; email: string | null; phone: string | null }[];
  appointments: { clientKey: string; serviceId: string; serviceName: string; startsAt: Date; status: "COMPLETED" | "CANCELLED" | "NO_SHOW" | "BOOKED"; priceCents: number }[];
  contents: { key: string; platform: Platform; type: ContentType; status: ContentStatus; title: string; hook: string; publishedAt: Date | null; plannedAt: Date | null; durationSec: number; metrics: { views: number; likes: number; comments: number; shares: number; saves: number; followersGained: number; profileVisits: number; messages: number; leads: number } | null }[];
  social: { platform: Platform; capturedAt: Date; followers: number; views: number; likes: number }[];
  leads: { contentKey: string | null; channel: AcquisitionChannel; status: "NEW" | "CONTACTED" | "BOOKED" | "CONVERTED" | "LOST"; createdAt: Date; name: string }[];
  reviewPairs: [string, string][];
  missions: { date: Date; code: string; title: string; status: "DONE" | "SKIPPED" | "PARTIAL" }[];
}

const TYPE_PROFILE: Record<string, { views: number; leadRate: number; titles: string[]; hooks: string[] }> = {
  TRANSFORMATION: { views: 6500, leadRate: 0.0011, titles: ["Transformation mulet → fade", "De la masse au taper propre", "Transformation complète en 45 min", "Fade bas + barbe sculptée"], hooks: ["Il est arrivé comme ça…", "Regarde jusqu'à la fin", "45 minutes plus tard"] },
  BEFORE_AFTER: { views: 5200, leadRate: 0.0009, titles: ["Avant / après — burst fade", "Avant / après barbe", "Avant / après crop texturé"], hooks: ["Avant / après : tu choisis ?", "Même mec, autre vibe"] },
  FACE_CAMERA: { views: 2400, leadRate: 0.0006, titles: ["Pourquoi je suis devenu barber", "Ce que je refuse de faire au salon"], hooks: ["On ne te dit jamais ça", "Je vais être honnête"] },
  ADVICE: { views: 3000, leadRate: 0.0007, titles: ["3 erreurs avec ta barbe", "Comment garder ton fade 3 semaines", "Quel produit pour tes cheveux"], hooks: ["L'erreur que tout le monde fait", "Arrête de faire ça"] },
  HUMOR: { views: 7800, leadRate: 0.0002, titles: ["Les clients quand on sort le miroir", "POV : le client dit « juste un peu »"], hooks: ["POV", "Tous les barbers comprendront"] },
  BEHIND_THE_SCENES: { views: 1800, leadRate: 0.0004, titles: ["Ouverture du salon à 8h", "Le setup du poste"], hooks: ["Une journée au salon", "Les coulisses"] },
  CLIENT_REACTION: { views: 4200, leadRate: 0.0008, titles: ["Sa réaction au miroir", "Il ne s'attendait pas à ça"], hooks: ["Sa réaction 😳", "Attends la fin"] },
};

function pick<T>(r: () => number, xs: readonly T[]): T {
  return xs[Math.floor(r() * xs.length)]!;
}

function weighted<T>(r: () => number, entries: [T, number][]): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [v, w] of entries) {
    x -= w;
    if (x <= 0) return v;
  }
  return entries[0]![0];
}

export function generateDemoPlan(now: Date, services: DemoService[], seed: number, tz = "Europe/Zurich"): DemoPlan {
  const r = prng(seed);
  const weekStart = startOf("week", now, tz);
  const start = new Date(weekStart.getTime() - 7 * 7 * DAY_MS); // 8 semaines (7 complètes + en cours)
  const slot = (day: Date, hour: number, minute: number) => {
    const [y, m, d] = localDateKey(day, tz).split("-").map(Number) as [number, number, number];
    return new Date(zonedMidnight(y, m, d, tz).getTime() + (hour * 60 + minute) * 60_000);
  };

  // ── Contenus (8 semaines, ~3,5 par semaine) ──
  const contents: DemoPlan["contents"] = [];
  const typeWeights: [ContentType, number][] = [["TRANSFORMATION", 30], ["BEFORE_AFTER", 18], ["ADVICE", 14], ["CLIENT_REACTION", 12], ["HUMOR", 10], ["FACE_CAMERA", 8], ["BEHIND_THE_SCENES", 8]];
  let ck = 0;
  for (let w = 0; w < 8; w++) {
    const n = 3 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const publishedAt = slot(new Date(start.getTime() + (w * 7 + 1 + Math.floor(r() * 5)) * DAY_MS), 18 + Math.floor(r() * 3), 0);
      if (publishedAt.getTime() > now.getTime()) continue;
      const type = weighted(r, typeWeights);
      const prof = TYPE_PROFILE[type]!;
      const platform: Platform = r() < 0.62 ? "INSTAGRAM" : "TIKTOK";
      const growth = 1 + w * 0.05;
      const views = Math.round(prof.views * growth * (0.55 + r() * 0.9) * (platform === "TIKTOK" ? 1.3 : 1));
      const leads = Math.max(0, Math.round(views * prof.leadRate * (0.5 + r())));
      contents.push({
        key: `c${ck++}`, platform, type, status: "PUBLISHED", title: pick(r, prof.titles), hook: pick(r, prof.hooks), publishedAt, plannedAt: null, durationSec: 15 + Math.floor(r() * 35),
        metrics: { views, likes: Math.round(views * (0.04 + r() * 0.04)), comments: Math.round(views * (0.002 + r() * 0.004)), shares: Math.round(views * (0.001 + r() * 0.004)), saves: Math.round(views * (0.002 + r() * 0.005)), followersGained: Math.round(views * (0.002 + r() * 0.003)), profileVisits: Math.round(views * (0.015 + r() * 0.02)), messages: leads + Math.floor(r() * 3), leads },
      });
    }
  }
  const pipeline: [ContentStatus, string][] = [["IDEA", "Série « 1 coupe, 3 styles »"], ["IDEA", "Conseil : choisir son dégradé"], ["TO_FILM", "Transformation cheveux longs"], ["FILMED", "Réaction client — taper"], ["READY", "Avant/après barbe complète"]];
  for (const [status, title] of pipeline)
    contents.push({ key: `c${ck++}`, platform: "INSTAGRAM", type: title.startsWith("Conseil") ? "ADVICE" : title.startsWith("Réaction") ? "CLIENT_REACTION" : "TRANSFORMATION", status, title, hook: "", publishedAt: null, plannedAt: status === "READY" ? new Date(now.getTime() + DAY_MS) : null, durationSec: 30, metrics: null });
  const published = contents.filter((c) => c.publishedAt);

  // ── Clients : 15 réguliers (historique antérieur) + nouveaux clients au fil des semaines ──
  const clients: DemoPlan["clients"] = [];
  const usedNames = new Set<string>();
  const newName = () => {
    for (;;) {
      const f = pick(r, FIRST), l = pick(r, LAST);
      if (!usedNames.has(`${f} ${l}`)) {
        usedNames.add(`${f} ${l}`);
        return [f, l] as const;
      }
    }
  };
  const channelWeights: [AcquisitionChannel, number][] = [["INSTAGRAM", 35], ["TIKTOK", 15], ["WORD_OF_MOUTH", 20], ["GOOGLE", 10], ["WALK_IN", 5], ["UNKNOWN", 15]];
  const DECLARED: Partial<Record<AcquisitionChannel, string>> = { INSTAGRAM: "Instagram", TIKTOK: "TikTok", WORD_OF_MOUTH: "Un ami", GOOGLE: "Google Maps", WALK_IN: "En passant" };
  const makeClient = (createdAt: Date, regular: boolean) => {
    const [firstName, lastName] = newName();
    const channel = regular ? weighted(r, [["WORD_OF_MOUTH", 40], ["INSTAGRAM", 30], ["UNKNOWN", 30]] as [AcquisitionChannel, number][]) : weighted(r, channelWeights);
    let contentKey: string | null = null;
    if (channel === "INSTAGRAM" || channel === "TIKTOK") {
      const candidates = published.filter((c) => c.platform === channel && c.publishedAt! < createdAt && createdAt.getTime() - c.publishedAt!.getTime() < 21 * DAY_MS);
      if (candidates.length && r() < 0.7) contentKey = weighted(r, candidates.map((c) => [c.key, c.metrics!.leads + 1] as [string, number]));
    }
    const key = `k${clients.length}`;
    const slug = `${firstName}.${lastName}`.toLowerCase().normalize("NFD").replace(/[^a-z.]/g, "");
    clients.push({ key, firstName, lastName, channel, declared: channel !== "UNKNOWN" && r() < 0.75 ? DECLARED[channel] ?? null : null, contentKey, createdAt, email: r() < 0.5 ? `${slug}@example.com` : null, phone: r() < 0.6 ? `079 000 ${String(20 + clients.length).padStart(2, "0")} ${String(Math.floor(r() * 90) + 10)}` : null });
    return key;
  };
  const regulars = Array.from({ length: 15 }, () => ({ key: makeClient(new Date(start.getTime() - (60 + Math.floor(r() * 120)) * DAY_MS), true), interval: 14 + Math.floor(r() * 21), next: 0 }));
  for (const reg of regulars) reg.next = start.getTime() + Math.floor(r() * reg.interval) * DAY_MS;

  // ── Rendez-vous : 10–14 réalisés par semaine ──
  const appointments: DemoPlan["appointments"] = [];
  const svcWeights: [DemoService, number][] = services.map((s) => [s, /transformation \+ barbe/i.test(s.name) ? 10 : /transformation/i.test(s.name) ? 15 : /barbe/i.test(s.name) ? 30 : 45]);
  const takeSlot = new Set<string>();
  const freeSlot = (dayIndex: number) => {
    for (let tries = 0; tries < 30; tries++) {
      const day = new Date(start.getTime() + dayIndex * DAY_MS);
      const at = slot(day, 9 + Math.floor(r() * 9), r() < 0.5 ? 0 : 30);
      if (!takeSlot.has(at.toISOString())) {
        takeSlot.add(at.toISOString());
        return at;
      }
    }
    return null;
  };
  const newClientsPool: string[] = [];
  for (let w = 0; w < 8; w++) {
    const target = 10 + Math.floor(r() * 5);
    let made = 0;
    // réguliers dus cette semaine
    for (const reg of regulars) {
      if (reg.next < start.getTime() + (w + 1) * 7 * DAY_MS && reg.next >= start.getTime() + w * 7 * DAY_MS && made < target) {
        const at = freeSlot(w * 7 + 1 + Math.floor(r() * 5));
        if (at) {
          appointments.push({ clientKey: reg.key, ...svc(weighted(r, svcWeights)), startsAt: at, status: "COMPLETED" });
          made++;
        }
        reg.next += reg.interval * DAY_MS;
      }
    }
    // retours de nouveaux clients (récurrence réaliste ~35 %)
    for (const k of [...newClientsPool]) {
      if (made >= target) break;
      if (r() < 0.12) {
        const at = freeSlot(w * 7 + 1 + Math.floor(r() * 5));
        if (at) {
          appointments.push({ clientKey: k, ...svc(weighted(r, svcWeights)), startsAt: at, status: "COMPLETED" });
          made++;
        }
      }
    }
    // nouveaux clients
    while (made < target) {
      const at = freeSlot(w * 7 + 1 + Math.floor(r() * 5));
      if (!at) break;
      const k = makeClient(new Date(at.getTime() - Math.floor(r() * 3) * DAY_MS), false);
      newClientsPool.push(k);
      appointments.push({ clientKey: k, ...svc(weighted(r, svcWeights)), startsAt: at, status: "COMPLETED" });
      made++;
    }
    // annulations / absences
    for (let i = 0; i < 2; i++) {
      const at = freeSlot(w * 7 + 1 + Math.floor(r() * 5));
      if (at && r() < 0.6) appointments.push({ clientKey: pick(r, clients).key, ...svc(weighted(r, svcWeights)), startsAt: at, status: r() < 0.5 ? "CANCELLED" : "NO_SHOW" });
    }
  }
  // Les RDV futurs de la semaine en cours sont "réservés" ; quelques réservations à venir.
  for (const a of appointments) if (a.startsAt.getTime() > now.getTime()) a.status = "BOOKED";
  for (let i = 0; i < 5; i++) {
    const at = freeSlot(56 + Math.floor(r() * 7));
    if (at && at.getTime() > now.getTime()) appointments.push({ clientKey: pick(r, regulars).key, ...svc(weighted(r, svcWeights)), startsAt: at, status: "BOOKED" });
  }
  // Clients sans rendez-vous dans la fenêtre (réguliers) : fenêtre élargie pour l'historique
  for (const reg of regulars) {
    const before = new Date(start.getTime() - (reg.interval + Math.floor(r() * 7)) * DAY_MS);
    appointments.push({ clientKey: reg.key, ...svc(weighted(r, svcWeights)), startsAt: slot(before, 10 + Math.floor(r() * 7), 0), status: "COMPLETED" });
  }

  // ── Réseaux : snapshots hebdomadaires cohérents avec les contenus ──
  const social: DemoPlan["social"] = [];
  let ig = 1780, tt = 920, igViews = 210_000, ttViews = 160_000;
  for (let d = 0; d <= Math.floor((now.getTime() - start.getTime()) / DAY_MS); d += 7) {
    const at = slot(new Date(start.getTime() + d * DAY_MS), 21, 0);
    if (at > now) break;
    const weekContents = published.filter((c) => c.publishedAt! >= new Date(at.getTime() - 7 * DAY_MS) && c.publishedAt! < at);
    ig += weekContents.filter((c) => c.platform === "INSTAGRAM").reduce((s, c) => s + c.metrics!.followersGained, 0) + Math.floor(r() * 10);
    tt += weekContents.filter((c) => c.platform === "TIKTOK").reduce((s, c) => s + c.metrics!.followersGained, 0) + Math.floor(r() * 10);
    igViews += weekContents.filter((c) => c.platform === "INSTAGRAM").reduce((s, c) => s + c.metrics!.views, 0);
    ttViews += weekContents.filter((c) => c.platform === "TIKTOK").reduce((s, c) => s + c.metrics!.views, 0);
    social.push({ platform: "INSTAGRAM", capturedAt: at, followers: ig, views: igViews, likes: Math.round(igViews * 0.06) });
    social.push({ platform: "TIKTOK", capturedAt: at, followers: tt, views: ttViews, likes: Math.round(ttViews * 0.07) });
  }

  // ── Leads (cohérents avec les leads des contenus) ──
  const leads: DemoPlan["leads"] = [];
  for (const c of published) {
    for (let i = 0; i < Math.min(2, c.metrics!.leads); i++) {
      const createdAt = new Date(c.publishedAt!.getTime() + (1 + Math.floor(r() * 3)) * DAY_MS);
      if (createdAt > now) continue;
      const age = (now.getTime() - createdAt.getTime()) / DAY_MS;
      leads.push({ contentKey: c.key, channel: c.platform, status: age < 2 ? "NEW" : weighted(r, [["CONVERTED", 40], ["BOOKED", 15], ["CONTACTED", 20], ["LOST", 25]]), createdAt, name: `${pick(r, FIRST)} (DM)` });
    }
  }

  // ── Doublons potentiels à vérifier (noms proches) ──
  const reviewPairs: [string, string][] = [];
  for (let i = 0; i < 3 && i < regulars.length; i++) {
    const base = clients.find((c) => c.key === regulars[i]!.key)!;
    const key = `k${clients.length}`;
    clients.push({ key, firstName: base.firstName.length > 3 ? base.firstName.slice(0, -1) + base.firstName.slice(-1).repeat(2) : base.firstName + "e", lastName: base.lastName, channel: "UNKNOWN", declared: null, contentKey: null, createdAt: new Date(now.getTime() - (10 + i) * DAY_MS), email: null, phone: null });
    appointments.push({ clientKey: key, ...svc(weighted(r, svcWeights)), startsAt: slot(new Date(now.getTime() - (10 + i) * DAY_MS), 17, 30), status: "COMPLETED" });
    reviewPairs.push([key, base.key]);
  }

  // ── Missions passées (historique de la boucle d'apprentissage) ──
  const missions: DemoPlan["missions"] = [];
  const codes: [string, string][] = [["PUBLISH_BEST_FORMAT", "Publier une transformation"], ["REACTIVATE_OVERDUE", "Relancer 3 clients en retard"], ["FILM_BATCH", "Filmer 3 contenus"], ["ANSWER_LEADS", "Répondre aux prospects"], ["ASK_REVIEWS", "Demander 2 avis Google"]];
  for (let d = 1; d <= 6; d++) {
    const date = new Date(`${localDateKey(new Date(now.getTime() - d * DAY_MS), tz)}T00:00:00.000Z`);
    for (const [code, title] of codes.slice(0, 3)) missions.push({ date, code, title, status: weighted(r, [["DONE", 60], ["PARTIAL", 20], ["SKIPPED", 20]]) });
  }

  return { clients, appointments, contents, social, leads, reviewPairs, missions };

  function svc(s: DemoService) {
    return { serviceId: s.id, serviceName: s.name, priceCents: s.priceCents };
  }
}
