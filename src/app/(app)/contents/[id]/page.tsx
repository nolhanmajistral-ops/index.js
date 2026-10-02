import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/auth/session";
import { getContent } from "@/repositories/contents";
import { getAnalytics } from "@/domain/analytics/service";
import { overallScore, type DimensionScore } from "@/domain/content/scores";
import { PageHeader, Card, SectionTitle } from "@/components/ui/card";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { CONTENT_STATUS_LABEL, CONTENT_TYPE_LABEL, PLATFORM_LABEL } from "@/lib/labels";
import { formatCHF, formatNumber } from "@/lib/money";
import { formatDateTimeFr, toLocalInput } from "@/lib/dates";
import { ContentForm, MetricForm } from "../content-form";
import { addMetricAction, archiveContentAction, deleteContentAction, duplicateContentAction, updateContentAction } from "../actions";

export const metadata = { title: "Contenu" };

function ScoreCard({ title, d }: { title: string; d: DimensionScore }) {
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex items-baseline justify-between">
        <span className="label">{title}</span>
        <span className="font-display text-2xl tabular-nums">{d.score === null ? <span className="text-base text-mute">Non disponible</span> : `${d.score}`}</span>
      </div>
      <ul className="mt-3 space-y-1 text-xs">
        {d.factors.map((f) => (
          <li key={f.key} className="flex justify-between gap-2">
            <span className="text-mute">{f.label} <span className="text-mute/60">×{f.weight}</span></span>
            <span className="tabular-nums text-soft">{f.display}{f.percentile !== null ? <span className="text-mute"> · P{f.percentile}</span> : null}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-mute">{d.explanation}</p>
    </div>
  );
}

export default async function ContentDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOnboardedUser();
  const { id } = await params;
  const [content, { snapshot }] = await Promise.all([getContent(user.id, id), getAnalytics(user.id)]);
  if (!content) notFound();
  const sc = snapshot.content.scores.get(content.id);
  const o = sc ? overallScore(sc) : null;

  return (
    <div>
      <PageHeader
        title={content.title}
        subtitle={<span className="flex flex-wrap items-center gap-2">{PLATFORM_LABEL[content.platform]} · {CONTENT_TYPE_LABEL[content.type]} <Badge>{CONTENT_STATUS_LABEL[content.status]}</Badge>{content.source === "DEMO" ? <DemoBadge /> : null}{content.archivedAt ? <Badge tone="warn">Archivé</Badge> : null}</span>}
        action={
          <>
            <form action={duplicateContentAction.bind(null, content.id)}><button className="btn-ghost">Dupliquer</button></form>
            <form action={archiveContentAction.bind(null, content.id, !content.archivedAt)}><button className="btn-ghost">{content.archivedAt ? "Désarchiver" : "Archiver"}</button></form>
            <form action={deleteContentAction.bind(null, content.id)}><button className="btn-danger">Supprimer</button></form>
          </>
        }
      />

      <SectionTitle>Scores {o !== null ? <span className="ml-2 normal-case tracking-normal text-soft">· global {o}/100</span> : null}</SectionTitle>
      {sc ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ScoreCard title="Visibility" d={sc.visibility} />
          <ScoreCard title="Engagement" d={sc.engagement} />
          <ScoreCard title="Acquisition" d={sc.acquisition} />
          <ScoreCard title="Business" d={sc.business} />
        </div>
      ) : (
        <Card><p className="text-sm text-mute">Non disponible : les scores sont calculés pour les contenus publiés.</p></Card>
      )}
      {sc ? <p className="mt-2 text-xs text-mute">Clients attribués : {sc.clientsGenerated} · CA attribué : {formatCHF(sc.revenueGeneratedCents)} (via attribution déclarée ou contenu d&apos;origine renseigné sur la fiche client).</p> : null}

      <SectionTitle>Métriques (snapshots)</SectionTitle>
      <div className="grid gap-3 md:grid-cols-[1.2fr_1fr]">
        <Card>
          {content.metrics.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead className="text-left text-xs text-mute">
                  <tr><th className="py-1 font-normal">Date</th><th className="font-normal">Vues</th><th className="font-normal">Likes</th><th className="font-normal">Comm.</th><th className="font-normal">Partages</th><th className="font-normal">Visites</th><th className="font-normal">Leads</th></tr>
                </thead>
                <tbody>
                  {content.metrics.map((m) => (
                    <tr key={m.id} className="border-t border-line">
                      <td className="py-1.5 text-xs text-mute">{formatDateTimeFr(m.capturedAt)}</td>
                      <td>{formatNumber(m.views)}</td><td>{formatNumber(m.likes)}</td><td>{formatNumber(m.comments)}</td><td>{formatNumber(m.shares)}</td><td>{formatNumber(m.profileVisits)}</td><td>{formatNumber(m.leads)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-mute">Aucune métrique. Ajoute un snapshot depuis les statistiques Instagram/TikTok.</p>
          )}
        </Card>
        <Card><MetricForm action={addMetricAction.bind(null, content.id)} /></Card>
      </div>

      <SectionTitle>Modifier</SectionTitle>
      <Card>
        <ContentForm
          action={updateContentAction.bind(null, content.id)}
          submitLabel="Enregistrer"
          defaults={{ ...content, publishedAt: toLocalInput(content.publishedAt), plannedAt: toLocalInput(content.plannedAt) }}
        />
      </Card>
    </div>
  );
}
