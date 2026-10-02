import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/auth/session";
import { getClient } from "@/repositories/clients";
import { getAttribution } from "@/repositories/attributions";
import { listAppointments } from "@/repositories/appointments";
import { listContentOptions } from "@/repositories/contents";
import { computeClientStats } from "@/domain/clients/metrics";
import { PageHeader, Card, SectionTitle } from "@/components/ui/card";
import { Badge, ConfidenceBadge, DemoBadge } from "@/components/ui/badge";
import { Stat } from "@/components/ui/stat";
import { APPOINTMENT_STATUS_LABEL, CHANNEL_LABEL, SOURCE_LABEL } from "@/lib/labels";
import { formatCHF } from "@/lib/money";
import { formatDateFr, formatDateTimeFr } from "@/lib/dates";
import { ClientForm } from "../client-form";
import { deleteClientAction, updateClientAction } from "../actions";

export const metadata = { title: "Client" };

export default async function ClientDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOnboardedUser();
  const { id } = await params;
  const client = await getClient(user.id, id);
  if (!client) notFound();
  const [attribution, appts, contents] = await Promise.all([getAttribution(user.id, id), listAppointments(user.id, { clientId: id, take: 200 }), listContentOptions(user.id)]);
  const rows = appts.map((a) => ({ id: a.id, clientId: a.clientId, serviceId: a.serviceId, serviceName: a.serviceName, startsAt: a.startsAt, status: a.status, priceCents: a.priceCents, source: a.source }));
  const revRows = rows.filter((a) => a.status === "COMPLETED").map((a) => ({ id: a.id, amountCents: a.priceCents, occurredAt: a.startsAt, source: a.source, kind: "SERVICE" as const, clientId: a.clientId, serviceId: a.serviceId, appointmentId: a.id, isEstimated: false, reviewStatus: "OK" as const }));
  const st = computeClientStats(id, rows, revRows);

  return (
    <div>
      <PageHeader
        title={client.displayName}
        subtitle={<span className="flex flex-wrap items-center gap-2">Source : {SOURCE_LABEL[client.source]} {client.source === "DEMO" ? <DemoBadge /> : null} · client depuis {formatDateFr(client.createdAt)}</span>}
        action={
          <>
            <a href={`/api/clients/${client.id}/export`} className="btn-ghost">Exporter (NLPD)</a>
            <form action={deleteClientAction.bind(null, client.id)}><button className="btn-danger">Supprimer</button></form>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card><Stat label="Visites" value={st.visits} hint={st.isRecurring ? "récurrent" : st.visits === 1 ? "nouveau" : undefined} /></Card>
        <Card><Stat label="Premier passage" value={st.firstVisit ? formatDateFr(st.firstVisit) : "—"} /></Card>
        <Card><Stat label="Dernière visite" value={st.lastVisit ? formatDateFr(st.lastVisit) : "—"} /></Card>
        <Card><Stat label="Panier moyen" value={formatCHF(st.averageTicketCents)} hint={st.preferredService ?? undefined} /></Card>
        <Card><Stat label="CA total" value={formatCHF(st.revenueCents)} hint={st.avgIntervalDays ? `tous les ${Math.round(st.avgIntervalDays)} j` : undefined} /></Card>
      </div>

      <SectionTitle>Attribution</SectionTitle>
      <Card className="flex flex-wrap items-center gap-3 text-sm">
        {attribution ? (
          <>
            <span>{CHANNEL_LABEL[attribution.channel]}</span>
            <ConfidenceBadge level={attribution.confidence} />
            <Badge>{attribution.method === "DECLARED" ? "Déclarée par le client" : attribution.method === "IMPORTED" ? "Importée" : "Saisie (non déclarée)"}</Badge>
            {attribution.declaredAnswer ? <span className="text-mute">« {attribution.declaredAnswer} »</span> : null}
            {attribution.content ? <span className="text-mute">· contenu : {attribution.content.title}</span> : null}
          </>
        ) : (
          <><span>Inconnu</span><ConfidenceBadge level="UNKNOWN" /></>
        )}
      </Card>

      <SectionTitle>Rendez-vous</SectionTitle>
      <Card>
        {appts.length ? (
          <ul className="divide-y divide-line text-sm">
            {appts.map((a) => (
              <li key={a.id} className="flex justify-between gap-2 py-2">
                <span>{formatDateTimeFr(a.startsAt)} · {a.serviceName}</span>
                <span className="flex items-center gap-2"><Badge tone={a.status === "COMPLETED" ? "ok" : a.status === "BOOKED" ? "gold" : "warn"}>{APPOINTMENT_STATUS_LABEL[a.status]}</Badge><span className="tabular-nums text-soft">{formatCHF(a.priceCents)}</span><span className="text-xs text-mute">{SOURCE_LABEL[a.source]}</span></span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-mute">Aucun rendez-vous.</p>}
      </Card>

      <SectionTitle>Modifier</SectionTitle>
      <Card>
        <ClientForm action={updateClientAction.bind(null, client.id)} contents={contents} submitLabel="Enregistrer" defaults={{ ...client, declaredAnswer: attribution?.declaredAnswer ?? null }} />
      </Card>
    </div>
  );
}
