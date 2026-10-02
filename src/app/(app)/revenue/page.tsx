import { requireOnboardedUser } from "@/lib/auth/session";
import { getAnalytics } from "@/domain/analytics/service";
import { listRevenues } from "@/repositories/revenues";
import { listServices } from "@/repositories/services";
import { clientOptions } from "@/repositories/clients";
import { PageHeader, Card, SectionTitle } from "@/components/ui/card";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { Stat } from "@/components/ui/stat";
import { Chart } from "@/components/charts";
import { formatCHF } from "@/lib/money";
import { CHANNEL_LABEL, SOURCE_LABEL } from "@/lib/labels";
import { formatDateTimeFr, shortDayLabel, toLocalInput } from "@/lib/dates";
import { AppointmentForm, RevenueForm } from "./forms";
import { deleteRevenueAction, revenueReviewAction } from "./actions";

export const metadata = { title: "CA" };

export default async function RevenuePage() {
  const user = await requireOnboardedUser();
  const [{ snapshot: s }, recent, review, services, clients] = await Promise.all([
    getAnalytics(user.id),
    listRevenues(user.id, { take: 30 }),
    listRevenues(user.id, { status: "NEEDS_REVIEW", take: 50 }),
    listServices(user.id, { activeOnly: true }),
    clientOptions(user.id),
  ]);
  const r = s.revenue;
  const now = toLocalInput(new Date());
  const svc = services.map((x) => ({ id: x.id, name: x.name, priceCents: x.priceCents }));
  const cl = clients.map((c) => ({ id: c.id, name: c.displayName }));

  return (
    <div>
      <PageHeader title="Chiffre d'affaires" subtitle="CA confirmé = revenus dédupliqués. Les montants à vérifier ou estimés sont affichés séparément." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><Stat label="Aujourd'hui" value={formatCHF(r.today.totalCents)} /></Card>
        <Card><Stat label="Semaine" value={formatCHF(r.week.totalCents)} delta={r.growthWeek} hint="vs à date" /></Card>
        <Card><Stat label="Mois" value={formatCHF(r.month.totalCents)} delta={r.growthMonth} hint="vs à date" /></Card>
        <Card><Stat label="Année" value={formatCHF(r.year.totalCents)} /></Card>
        <Card><Stat label="Panier moyen (mois)" value={formatCHF(r.avgTicketMonth)} hint={`mois préc. ${formatCHF(r.avgTicketPrevMonth)}`} /></Card>
        <Card><Stat label="CA moyen / semaine" value={formatCHF(r.averageWeekCents)} hint="8 semaines" /></Card>
        <Card><Stat label="CA / client (mois)" value={formatCHF(s.clients.month.revenuePerClientCents)} /></Card>
        <Card><Stat label="Prestations (mois)" value={r.servicesMonth} hint={`${r.servicesWeek} cette semaine`} /></Card>
      </div>

      <SectionTitle>CA du mois par source</SectionTitle>
      <Card className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="Planity" value={formatCHF(r.month.bySource.PLANITY)} />
        <Stat label="Manuel" value={formatCHF(r.month.bySource.MANUAL)} />
        <Stat label="DEMO" value={formatCHF(r.month.bySource.DEMO)} hint={r.month.bySource.DEMO ? "fictif" : undefined} />
        <Stat label="Total dédupliqué" value={formatCHF(r.month.totalCents)} />
        <Stat label="À vérifier" value={formatCHF(r.month.pendingReviewCents)} hint={`${r.month.pendingReviewCount} revenu(s), non inclus`} />
        {r.month.estimatedCents ? <p className="col-span-full text-xs text-warn">Dont {formatCHF(r.month.estimatedCents)} estimé (prix catalogue utilisé faute de prix dans l&apos;export).</p> : null}
      </Card>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Card><Chart kind="bar" unit="chf" title="CA confirmé par semaine" data={r.weeklySeries.map((w) => ({ label: shortDayLabel(w.start), value: w.totalCents / 100 }))} /></Card>
        <Card>
          <div className="mb-2 text-sm text-soft">Mix prestations (8 semaines)</div>
          <ul className="space-y-2 text-sm">
            {r.mix8w.map((m) => (
              <li key={m.serviceName}>
                <div className="flex justify-between"><span>{m.serviceName}</span><span className="tabular-nums text-soft">{m.count} · {formatCHF(m.revenueCents)}</span></div>
                <div className="mt-1 h-1.5 rounded-full bg-ink-3"><div className="h-full rounded-full bg-[var(--color-chart)]" style={{ width: `${m.share * 100}%` }} /></div>
              </li>
            ))}
            {r.mix8w.length === 0 ? <li className="text-mute">Aucune prestation.</li> : null}
          </ul>
          <div className="mt-5 text-sm text-soft">CA du mois par canal d&apos;acquisition</div>
          <ul className="mt-2 space-y-1 text-sm">
            {Object.entries(r.byChannelMonth).sort((a, b) => b[1] - a[1]).map(([k, v]) => <li key={k} className="flex justify-between"><span className="text-mute">{CHANNEL_LABEL[k]}</span><span className="tabular-nums">{formatCHF(v)}</span></li>)}
          </ul>
        </Card>
      </div>

      {review.length ? (
        <>
          <SectionTitle>À vérifier (doublons possibles)</SectionTitle>
          <Card>
            <ul className="divide-y divide-line text-sm">
              {review.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{formatDateTimeFr(x.occurredAt)} · {formatCHF(x.amountCents)} · {x.client?.displayName ?? "sans client"} <span className="text-xs text-mute">— {x.reviewNote}</span></span>
                  <span className="flex gap-2">
                    <form action={revenueReviewAction.bind(null, x.id, "OK")}><button className="btn-ghost px-3 py-1 text-xs">Compter</button></form>
                    <form action={revenueReviewAction.bind(null, x.id, "DUPLICATE_IGNORED")}><button className="btn-ghost px-3 py-1 text-xs">C&apos;est un doublon</button></form>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : null}

      <SectionTitle>Saisie manuelle</SectionTitle>
      <div className="grid gap-3 md:grid-cols-2">
        <Card><h3 className="mb-3 text-sm text-soft">Rendez-vous (génère le revenu s&apos;il est réalisé)</h3><AppointmentForm services={svc} clients={cl} now={now} /></Card>
        <Card><h3 className="mb-3 text-sm text-soft">Revenu hors rendez-vous (contrôle anti double-comptage)</h3><RevenueForm services={svc} clients={cl} now={now} /></Card>
      </div>

      <SectionTitle>Derniers revenus</SectionTitle>
      <Card>
        <ul className="divide-y divide-line text-sm">
          {recent.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{formatDateTimeFr(x.occurredAt)} · {x.label ?? x.service?.name ?? "Revenu"} · <span className="text-mute">{x.client?.displayName ?? "—"}</span></span>
              <span className="flex items-center gap-2">
                {x.source === "DEMO" ? <DemoBadge /> : <Badge>{SOURCE_LABEL[x.source]}</Badge>}
                {x.reviewStatus !== "OK" ? <Badge tone="warn">{x.reviewStatus === "NEEDS_REVIEW" ? "À vérifier" : "Doublon ignoré"}</Badge> : null}
                {x.isEstimated ? <Badge tone="warn">Estimé</Badge> : null}
                <span className="w-20 text-right tabular-nums">{formatCHF(x.amountCents)}</span>
                {!x.appointmentId ? <form action={deleteRevenueAction.bind(null, x.id)}><button className="text-xs text-mute hover:text-bad" aria-label="Supprimer">✕</button></form> : null}
              </span>
            </li>
          ))}
          {recent.length === 0 ? <li className="py-2 text-mute">Aucun revenu.</li> : null}
        </ul>
      </Card>
    </div>
  );
}
