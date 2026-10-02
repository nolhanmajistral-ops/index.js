import Link from "next/link";
import type { AcquisitionChannel } from "@prisma/client";
import { requireOnboardedUser } from "@/lib/auth/session";
import { listClients, visitStatsFor, clientNames } from "@/repositories/clients";
import { listLeads } from "@/repositories/leads";
import { listContentOptions } from "@/repositories/contents";
import { countPendingReviews } from "@/repositories/match-reviews";
import { getAnalytics } from "@/domain/analytics/service";
import { PageHeader, Card, SectionTitle } from "@/components/ui/card";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { Stat } from "@/components/ui/stat";
import { EmptyState } from "@/components/ui/empty";
import { CHANNEL_LABEL } from "@/lib/labels";
import { acquisitionChannels } from "@/lib/validation/schemas";
import { formatCHF, formatNumber, formatPercent } from "@/lib/money";
import { formatDateFr } from "@/lib/dates";
import { LeadForm } from "./lead-form";
import { leadStatusAction } from "./actions";

export const metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireOnboardedUser();
  const sp = await searchParams;
  const channel = acquisitionChannels.includes(sp.channel as AcquisitionChannel) ? (sp.channel as AcquisitionChannel) : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const [list, reviews, { snapshot: s }, leads, contents] = await Promise.all([listClients(user.id, { q: sp.q?.slice(0, 100), channel, page, pageSize: 25 }), countPendingReviews(user.id), getAnalytics(user.id), listLeads(user.id), listContentOptions(user.id)]);
  const stats = await visitStatsFor(user.id, list.items.map((c) => c.id));
  const overdueNames = new Map((await clientNames(user.id, s.clients.overdue.slice(0, 10).map((o) => o.clientId))).map((c) => [c.id, c.displayName]));
  const openLeads = leads.filter((l) => l.status === "NEW" || l.status === "CONTACTED" || l.status === "BOOKED");
  const qs = (extra: Record<string, string | undefined>) => new URLSearchParams(Object.entries({ ...sp, ...extra }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div>
      <PageHeader title="Clients" subtitle="CRM, récurrence et attribution." action={<><Link href="/clients/review" className="btn-ghost">À vérifier {reviews ? <Badge tone="warn">{reviews}</Badge> : null}</Link><Link href="/clients/new" className="btn-primary">Ajouter un client</Link></>} />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card><Stat label="Clients" value={formatNumber(s.clients.total)} /></Card>
        <Card><Stat label="Actifs (60 j)" value={formatNumber(s.clients.month.activeClients)} /></Card>
        <Card><Stat label="Nouveaux ce mois" value={formatNumber(s.clients.month.newClients)} /></Card>
        <Card><Stat label="Récurrence (8 sem.)" value={formatPercent(s.clients.eightWeeks.recurrenceRate)} /></Card>
        <Card><Stat label="Fréquence moy." value={s.clients.eightWeeks.avgFrequencyDays === null ? "—" : `${Math.round(s.clients.eightWeeks.avgFrequencyDays)} j`} hint={`CA/client ${formatCHF(s.clients.eightWeeks.revenuePerClientCents)}`} /></Card>
      </div>

      {s.clients.overdue.length ? (
        <>
          <SectionTitle>À relancer</SectionTitle>
          <Card>
            <ul className="divide-y divide-line text-sm">
              {s.clients.overdue.slice(0, 10).map((o) => (
                <li key={o.clientId} className="flex justify-between py-2">
                  <Link href={`/clients/${o.clientId}`}>{overdueNames.get(o.clientId) ?? "Client"}</Link>
                  <span className="text-xs text-mute">{o.daysSince} j sans visite · habituellement tous les {o.usualInterval} j</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : null}

      <SectionTitle>Tous les clients</SectionTitle>
      <form className="card mb-3 grid gap-2 sm:grid-cols-[1fr_200px_auto]" role="search">
        <input name="q" defaultValue={sp.q} className="input" placeholder="Nom, email ou téléphone exact…" aria-label="Recherche client" />
        <select name="channel" defaultValue={channel ?? ""} className="input" aria-label="Source"><option value="">Toutes sources</option>{acquisitionChannels.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}</select>
        <button className="btn-ghost">Rechercher</button>
      </form>
      {list.items.length === 0 ? (
        <EmptyState title="Aucun client" href="/clients/new" cta="Ajouter un client" />
      ) : (
        <Card className="p-0 md:p-0">
          <ul className="divide-y divide-line">
            {list.items.map((c) => {
              const st = stats.get(c.id);
              return (
                <li key={c.id}>
                  <Link href={`/clients/${c.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-ink-3/40">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 font-medium">{c.displayName}{c.source === "DEMO" ? <DemoBadge /> : null}</div>
                      <div className="text-xs text-mute">{CHANNEL_LABEL[c.acquisitionChannel]} · {st?.visits ?? 0} visite(s){st?.lastVisit ? ` · dernière ${formatDateFr(st.lastVisit)}` : ""}</div>
                    </div>
                    {st && st.visits >= 2 ? <Badge tone="gold">Récurrent</Badge> : st?.visits === 1 ? <Badge>Nouveau</Badge> : null}
                    <span className="w-24 text-right text-sm tabular-nums text-soft">{formatCHF(st?.revenueCents ?? 0)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="flex justify-between px-4 py-3 text-sm">
            {page > 1 ? <Link className="text-gold" href={`/clients?${qs({ page: String(page - 1) })}`}>← Précédent</Link> : <span />}
            <span className="text-mute">{list.total} clients</span>
            {page * list.pageSize < list.total ? <Link className="text-gold" href={`/clients?${qs({ page: String(page + 1) })}`}>Suivant →</Link> : <span />}
          </div>
        </Card>
      )}

      <SectionTitle>Prospects (leads)</SectionTitle>
      <Card className="space-y-4">
        <LeadForm contents={contents} />
        {openLeads.length ? (
          <ul className="divide-y divide-line text-sm">
            {openLeads.slice(0, 20).map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{l.name ?? "Prospect"} <span className="text-xs text-mute">· {CHANNEL_LABEL[l.channel]}{l.content ? ` · ${l.content.title}` : ""} · {formatDateFr(l.createdAt)}</span> {l.source === "DEMO" ? <DemoBadge /> : null}</span>
                <span className="flex gap-1">
                  <Badge>{{ NEW: "Nouveau", CONTACTED: "Contacté", BOOKED: "Réservé" }[l.status as "NEW"]}</Badge>
                  {(["CONTACTED", "BOOKED", "CONVERTED", "LOST"] as const).map((st) => (
                    <form key={st} action={leadStatusAction.bind(null, l.id, st)}><button className="rounded-lg px-2 py-0.5 text-xs text-mute hover:text-bone">{{ CONTACTED: "Contacté", BOOKED: "Réservé", CONVERTED: "Converti", LOST: "Perdu" }[st]}</button></form>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-mute">Aucun prospect ouvert.</p>
        )}
      </Card>
    </div>
  );
}
