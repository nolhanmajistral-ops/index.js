import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth/session";
import { getAnalytics } from "@/domain/analytics/service";
import { overallScore } from "@/domain/content/scores";
import { growth } from "@/domain/revenue/metrics";
import { PageHeader, Card, SectionTitle } from "@/components/ui/card";
import { Delta } from "@/components/ui/stat";
import { Badge } from "@/components/ui/badge";
import { InsufficientData } from "@/components/ui/empty";
import { Chart } from "@/components/charts";
import { CHANNEL_LABEL, CONTENT_TYPE_LABEL, PLATFORM_LABEL } from "@/lib/labels";
import { formatCHF, formatNumber, formatPercent } from "@/lib/money";
import { shortDayLabel } from "@/lib/dates";

export const metadata = { title: "Analyse" };

function Row({ label, cur, prev, fmt }: { label: string; cur: number | null; prev: number | null; fmt: (v: number | null) => string }) {
  return (
    <tr className="border-t border-line">
      <td className="py-2">{label}</td>
      <td className="text-right tabular-nums">{fmt(cur)}</td>
      <td className="text-right tabular-nums text-mute">{fmt(prev)}</td>
      <td className="text-right"><Delta value={cur === null || prev === null ? null : growth(cur, prev)} /></td>
    </tr>
  );
}

export default async function AnalyticsPage() {
  const user = await requireOnboardedUser();
  const { snapshot: s, anomalies, ds } = await getAnalytics(user.id);
  const published = ds.contents.filter((c) => c.status === "PUBLISHED" && c.latest).map((c) => ({ c, sc: s.content.scores.get(c.id) })).sort((a, b) => (b.sc ? overallScore(b.sc) ?? -1 : -1) - (a.sc ? overallScore(a.sc) ?? -1 : -1));
  const byPlatform = (["INSTAGRAM", "TIKTOK"] as const).map((p) => {
    const list = ds.contents.filter((c) => c.platform === p && c.status === "PUBLISHED" && c.latest);
    return { p, n: list.length, avgViews: list.length ? list.reduce((t, c) => t + c.latest!.views, 0) / list.length : null, leads: list.reduce((t, c) => t + c.latest!.leads, 0) };
  });
  const enough = s.dataQuality.weeksOfRevenue >= 2;

  return (
    <div>
      <PageHeader title="Analyse" subtitle="Comparaisons de périodes, anomalies et performances. Mêmes définitions que le dashboard et le coach." action={<Link href="/settings#weights" className="btn-ghost">Pondérations des scores</Link>} />

      <SectionTitle>Mois en cours vs même période du mois précédent</SectionTitle>
      <Card>
        {enough ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-mute"><tr><th className="font-normal">Métrique</th><th className="text-right font-normal">Actuel</th><th className="text-right font-normal">Précédent</th><th className="text-right font-normal">Évolution</th></tr></thead>
            <tbody>
              <Row label="CA confirmé (à date)" cur={s.revenue.month.totalCents} prev={s.revenue.prevMonthToDate.totalCents} fmt={(v) => formatCHF(v)} />
              <Row label="Panier moyen (vs mois préc. complet)" cur={s.revenue.avgTicketMonth} prev={s.revenue.avgTicketPrevMonth} fmt={(v) => formatCHF(v)} />
              <Row label="Clients servis" cur={s.clients.month.clientsServed} prev={s.clients.prevMonthToDate.clientsServed} fmt={(v) => formatNumber(v)} />
              <Row label="Nouveaux clients" cur={s.clients.month.newClients} prev={s.clients.prevMonthToDate.newClients} fmt={(v) => formatNumber(v)} />
              <Row label="Taux de récurrence" cur={s.clients.month.recurrenceRate} prev={s.clients.prevMonthToDate.recurrenceRate} fmt={(v) => formatPercent(v)} />
              <Row label="Contenus publiés" cur={s.content.publishedMonth} prev={s.content.publishedPrevMonthToDate} fmt={(v) => formatNumber(v)} />
            </tbody>
          </table>
        ) : <InsufficientData />}
        <p className="mt-3 text-xs text-mute">Toutes les lignes comparent à durée égale (mêmes N premiers jours du mois précédent), sauf le panier moyen comparé au mois précédent complet. En début de mois, les écarts portent sur peu de jours : à interpréter avec prudence.</p>
      </Card>

      <SectionTitle>Anomalies et tendances</SectionTitle>
      {anomalies.length ? (
        <div className="space-y-3">
          {anomalies.map((a) => (
            <Card key={a.code}>
              <div className="flex flex-wrap items-center gap-2"><Badge tone={a.kind === "ANOMALY" ? "warn" : "gold"}>{a.kind === "ANOMALY" ? "Anomalie" : "Tendance"}</Badge><h3 className="font-display text-lg">{a.title}</h3></div>
              <dl className="mt-3 grid gap-3 text-sm md:grid-cols-3">
                <div><dt className="label">Observation</dt><dd className="mt-1 text-soft">{a.observation}</dd></div>
                <div><dt className="label">Causes possibles (hypothèses)</dt><dd className="mt-1 text-soft"><ul className="list-disc pl-4">{a.possibleCauses.map((c) => <li key={c}>{c}</li>)}</ul></dd></div>
                <div><dt className="label">Action à tester</dt><dd className="mt-1 text-soft">{a.actionToTest}</dd></div>
              </dl>
            </Card>
          ))}
        </div>
      ) : (
        <Card><p className="text-sm text-mute">{s.periods.weeks.length && s.dataQuality.weeksOfRevenue >= 4 ? "Aucune anomalie détectée sur les dernières semaines." : "Données insuffisantes : au moins 4 semaines d'historique sont nécessaires pour détecter une anomalie fiable."}</p></Card>
      )}

      <SectionTitle>Clients et contenus (8 semaines)</SectionTitle>
      <div className="grid gap-3 md:grid-cols-2">
        <Card><Chart kind="bar" title="Nouveaux clients par semaine" data={s.clients.weeklyNew.map((w) => ({ label: shortDayLabel(w.start), value: w.newClients }))} /></Card>
        <Card><Chart kind="bar" title="Contenus publiés par semaine" data={s.content.weeklyPublished.map((w) => ({ label: shortDayLabel(w.start), value: w.count }))} /></Card>
      </div>

      <SectionTitle>Performance par format</SectionTitle>
      <Card>
        {s.content.formats.length ? (
          <table className="w-full text-sm tabular-nums">
            <thead className="text-left text-xs text-mute"><tr><th className="font-normal">Format</th><th className="text-right font-normal">Contenus</th><th className="text-right font-normal">Vues moy.</th><th className="text-right font-normal">Leads moy.</th><th className="text-right font-normal">Clients</th><th className="text-right font-normal">Score moy.</th></tr></thead>
            <tbody>{s.content.formats.map((f) => <tr key={f.type} className="border-t border-line"><td className="py-2">{CONTENT_TYPE_LABEL[f.type]}</td><td className="text-right">{f.count}</td><td className="text-right">{formatNumber(f.avgViews)}</td><td className="text-right">{formatNumber(f.avgLeads, 1)}</td><td className="text-right">{f.clients}</td><td className="text-right">{f.avgOverall === null ? "—" : Math.round(f.avgOverall)}</td></tr>)}</tbody>
          </table>
        ) : <InsufficientData>Aucun contenu publié avec métriques.</InsufficientData>}
      </Card>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Card>
          <div className="label mb-2">Plateformes</div>
          <ul className="space-y-2 text-sm">{byPlatform.map((p) => <li key={p.p} className="flex justify-between"><span>{PLATFORM_LABEL[p.p]} <span className="text-xs text-mute">({p.n})</span></span><span className="tabular-nums text-soft">{formatNumber(p.avgViews)} vues moy. · {p.leads} leads</span></li>)}</ul>
        </Card>
        <Card>
          <div className="label mb-2">Sources (CA du mois, clients attribués)</div>
          <ul className="space-y-1 text-sm">{Object.entries(s.revenue.byChannelMonth).sort((a, b) => b[1] - a[1]).map(([k, v]) => <li key={k} className="flex justify-between"><span className="text-mute">{CHANNEL_LABEL[k]}</span><span className="tabular-nums">{formatCHF(v)}</span></li>)}</ul>
          {s.clients.unknownChannelShare !== null ? <p className="mt-2 text-xs text-mute">Source inconnue : {formatPercent(s.clients.unknownChannelShare)} des clients.</p> : null}
        </Card>
        <Card>
          <div className="label mb-2">Prestations (8 semaines)</div>
          <ul className="space-y-1 text-sm">{s.revenue.mix8w.map((m) => <li key={m.serviceName} className="flex justify-between"><span className="text-mute">{m.serviceName}</span><span className="tabular-nums">{m.count} · {formatCHF(m.revenueCents)}</span></li>)}</ul>
        </Card>
      </div>

      <SectionTitle>Scores des contenus</SectionTitle>
      <Card className="p-0 md:p-0">
        {published.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left text-xs text-mute"><tr><th className="px-4 py-2 font-normal">Contenu</th><th className="text-right font-normal">Visibility</th><th className="text-right font-normal">Engagement</th><th className="text-right font-normal">Acquisition</th><th className="text-right font-normal">Business</th><th className="px-4 text-right font-normal">Global</th></tr></thead>
              <tbody>
                {published.slice(0, 30).map(({ c, sc }) => (
                  <tr key={c.id} className="border-t border-line">
                    <td className="px-4 py-2"><Link href={`/contents/${c.id}`}>{c.title}</Link> <span className="text-xs text-mute">{CONTENT_TYPE_LABEL[c.type]}</span></td>
                    {(["visibility", "engagement", "acquisition", "business"] as const).map((d) => <td key={d} className="text-right">{sc?.[d].score ?? "—"}</td>)}
                    <td className="px-4 text-right font-medium">{sc ? overallScore(sc) ?? "—" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="p-4"><InsufficientData /></div>}
      </Card>
    </div>
  );
}
