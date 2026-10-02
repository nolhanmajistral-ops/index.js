import type { BusinessSnapshot } from "@/domain/analytics/snapshot";
import type { Anomaly } from "@/domain/analytics/anomalies";
import type { ActionCandidate } from "@/domain/recommendations/types";
import { CHANNEL_LABEL, CONTENT_TYPE_LABEL, GOAL_LABEL } from "@/lib/labels";

export type CoachIntent = "today" | "why" | "content" | "works" | "declining" | "revenue" | "basket" | "clients" | "general";

export const SUGGESTED_QUESTIONS = [
  "Que dois-je faire aujourd'hui ?",
  "Pourquoi ?",
  "Quel contenu dois-je publier ?",
  "Qu'est-ce qui fonctionne ?",
  "Qu'est-ce qui baisse ?",
  "Comment augmenter mon CA ?",
  "Comment augmenter mon panier moyen ?",
  "Comment obtenir plus de clients ?",
];

export function detectIntent(q: string): CoachIntent {
  const s = q.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/panier/.test(s)) return "basket";
  if (/baiss|chute|recul|diminu/.test(s)) return "declining";
  if (/fonctionn|marche|performe|meilleur/.test(s)) return "works";
  if (/contenu|publier|video|post|reel|tiktok|instagram/.test(s)) return "content";
  if (/\bca\b|chiffre|revenu|argent|gagner/.test(s)) return "revenue";
  if (/client/.test(s)) return "clients";
  if (/^pourquoi|pourquoi \?/.test(s.trim())) return "why";
  if (/aujourd|maintenant|faire|priorit|move/.test(s)) return "today";
  return "general";
}

export const INSUFFICIENT = "Données insuffisantes pour conclure.";
const chf = (c: number | null | undefined) => (c === null || c === undefined ? "Non disponible" : `${Math.round(c / 100)} CHF`);
const pct = (r: number | null | undefined) => (r === null || r === undefined ? "—" : `${r > 0 ? "+" : ""}${Math.round(r * 100)} %`);

export interface CoachAnswer {
  intent: CoachIntent;
  answer: string;
  dataUsed: Record<string, string | number | null>;
  insufficient: boolean;
}

/** Réponses déterministes construites uniquement à partir du BusinessSnapshot. */
export function deterministicAnswer(q: string, s: BusinessSnapshot, anomalies: Anomaly[], move: ActionCandidate | null): CoachAnswer {
  const intent = detectIntent(q);
  const demo = s.dataQuality.demoData ? "\n\n⚠️ Une partie des données est DEMO (fictive)." : "";
  const done = (answer: string, dataUsed: CoachAnswer["dataUsed"], insufficient = false): CoachAnswer => ({ intent, answer: answer + demo, dataUsed, insufficient });

  switch (intent) {
    case "today":
    case "general":
      if (!move) return done(`${INSUFFICIENT} Ajoute des rendez-vous (import Planity) et un snapshot Instagram.`, {}, true);
      return done(`**${move.title}**\n\n${move.action}\n\n**Pourquoi :** ${move.why}\n\n**Résultat attendu :** ${move.expectedResult}\n\nConfiance : ${move.confidence}.`, move.dataUsed);
    case "why":
      if (!move) return done(INSUFFICIENT, {}, true);
      return done(`${move.why}\n\nCette action est prioritaire car elle est ${[move.criteria.goalLinked && "liée à un objectif", move.criteria.realData && "basée sur tes données réelles", move.criteria.measurable && "mesurable"].filter(Boolean).join(", ")}.`, move.dataUsed);
    case "content": {
      const best = s.content.bestFormat;
      const top = s.content.best30d;
      if (!best && !top) return done(`${INSUFFICIENT} Il faut au moins 2 contenus publiés par format avec leurs métriques pour identifier ce qui fonctionne. Par défaut (hypothèse) : une transformation avant/après avec un CTA vers Planity.`, { contenusPublies: s.content.publishedMonth }, true);
      return done(
        `Publie une **${CONTENT_TYPE_LABEL[best?.type ?? top!.content.type]}**.\n\n${best ? `Ce format a le meilleur score moyen (${Math.round(best.avgOverall ?? 0)}/100 sur ${best.count} contenus, ${best.clients} client(s) attribué(s)).` : ""}${top ? `\nTon meilleur contenu des 30 derniers jours : « ${top.content.title} » (score ${top.score}/100)${top.content.hook ? `, hook : « ${top.content.hook} »` : ""}.` : ""}\n\nMesure : vues et visites profil à J+3 vs ta moyenne. Utilise le générateur de contenu pour le script.`,
        { meilleurFormat: best ? CONTENT_TYPE_LABEL[best.type] ?? null : null, scoreMoyen: best?.avgOverall ? Math.round(best.avgOverall) : null, publiesSemaine: s.content.publishedWeek },
      );
    }
    case "works": {
      const lines: string[] = [];
      if (s.content.bestFormat) lines.push(`Format le plus performant : ${CONTENT_TYPE_LABEL[s.content.bestFormat.type]} (score moyen ${Math.round(s.content.bestFormat.avgOverall ?? 0)}/100).`);
      const channels = Object.entries(s.revenue.byChannelMonth).filter(([k]) => k !== "UNKNOWN").sort((a, b) => b[1] - a[1]);
      if (channels[0]) lines.push(`Canal qui rapporte le plus de CA ce mois (clients attribués) : ${CHANNEL_LABEL[channels[0][0]]} (${chf(channels[0][1])}).`);
      if (s.revenue.mix8w[0]) lines.push(`Prestation la plus demandée sur 8 semaines : ${s.revenue.mix8w[0].serviceName} (${Math.round(s.revenue.mix8w[0].share * 100)} %).`);
      const ups = anomalies.filter((a) => /UP|SPIKE|ACCELERATION/.test(a.code));
      for (const a of ups) lines.push(`${a.title} : ${a.observation}`);
      if (!lines.length) return done(INSUFFICIENT, {}, true);
      return done(lines.join("\n"), { contenusMesures: s.content.formats.reduce((t, f) => t + f.count, 0) });
    }
    case "declining": {
      const downs = anomalies.filter((a) => /DROP|DOWN|SLOWDOWN|CLIENTS_DOWN/.test(a.code));
      if (!downs.length) {
        if (s.dataQuality.weeksOfRevenue < 4) return done(`${INSUFFICIENT} Il faut au moins 4 semaines de données pour détecter une baisse fiable.`, { semainesDeDonnees: s.dataQuality.weeksOfRevenue }, true);
        return done(`Aucune baisse inhabituelle détectée sur les dernières semaines.\nCA du mois à date : ${chf(s.revenue.month.totalCents)} (${pct(s.revenue.growthMonth)} vs même période du mois précédent).`, { croissanceMois: s.revenue.growthMonth === null ? null : Math.round(s.revenue.growthMonth * 100) });
      }
      return done(downs.map((a) => `**${a.title}**\n${a.observation}\nCauses possibles (hypothèses) : ${a.possibleCauses.join(" ; ")}.\nÀ tester : ${a.actionToTest}`).join("\n\n"), { anomalies: downs.length });
    }
    case "revenue": {
      if (!s.dataQuality.hasRevenue) return done(`${INSUFFICIENT} Aucun revenu enregistré : importe ton export Planity ou saisis tes prestations.`, {}, true);
      const g = s.goals.find((x) => x.metric === "REVENUE_MONTH");
      const lines = [
        `CA du mois à date : ${chf(s.revenue.month.totalCents)} (${pct(s.revenue.growthMonth)} vs même période du mois précédent).`,
        g && g.actual !== null ? `Objectif ${GOAL_LABEL.REVENUE_MONTH!.label} : ${chf(g.target)} — ${Math.round((g.progress ?? 0) * 100)} % atteint, ${g.onTrack ? "dans le rythme" : "en retard sur le rythme"}.` : "Aucun objectif de CA mensuel défini.",
        `Leviers mesurables : ${s.clients.overdue.length} client(s) régulier(s) en retard à relancer ; panier moyen ${chf(s.revenue.avgTicket8w)}.`,
      ];
      if (move) lines.push(`\nAction prioritaire : ${move.action}`);
      return done(lines.join("\n"), { caMois: chf(s.revenue.month.totalCents), clientsARelancer: s.clients.overdue.length });
    }
    case "basket": {
      if (s.revenue.avgTicket8w === null) return done(`${INSUFFICIENT} Aucune prestation réalisée enregistrée.`, {}, true);
      const mix = s.revenue.mix8w.map((m) => `${m.serviceName} ${Math.round(m.share * 100)} %`).join(", ");
      return done(`Panier moyen sur 8 semaines : ${chf(s.revenue.avgTicket8w)} (mois en cours : ${chf(s.revenue.avgTicketMonth)}).\nMix : ${mix}.\n\nAction à tester (hypothèse) : proposer systématiquement « + barbe » aux coupes simples pendant 1 semaine, noter le taux d'acceptation et comparer le panier moyen.`, { panierMoyen8sem: chf(s.revenue.avgTicket8w), mix });
    }
    case "clients": {
      if (!s.dataQuality.hasAppointments) return done(`${INSUFFICIENT} Aucun rendez-vous enregistré.`, {}, true);
      const channels = Object.entries(s.revenue.byChannelMonth).filter(([k]) => k !== "UNKNOWN").sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${CHANNEL_LABEL[k]} (${chf(v)})`);
      return done(
        `Nouveaux clients : ${s.clients.week.newClients} cette semaine, ${s.clients.month.newClients} ce mois. Récurrence du mois : ${s.clients.month.recurrenceRate === null ? "—" : `${Math.round(s.clients.month.recurrenceRate * 100)} %`}.\n${channels.length ? `Canaux qui rapportent le plus : ${channels.join(", ")}.` : "Canaux d'acquisition encore inconnus pour la plupart des clients."}\n\nActions : ${s.clients.overdue.length ? `relancer ${s.clients.overdue.length} client(s) en retard, ` : ""}publier un contenu avec CTA Planity, et demander « Comment nous as-tu trouvé ? » à chaque nouveau client.`,
        { nouveauxSemaine: s.clients.week.newClients, nouveauxMois: s.clients.month.newClients, clientsEnRetard: s.clients.overdue.length },
      );
    }
  }
}
