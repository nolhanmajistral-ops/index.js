import { requireOnboardedUser } from "@/lib/auth/session";
import { socialIntegrationStatus } from "@/datahub/social/service";
import { listSocialMetrics } from "@/repositories/social";
import { getAnalytics } from "@/domain/analytics/service";
import { PageHeader, Card, SectionTitle } from "@/components/ui/card";
import { Badge, ConnectionBadge, DemoBadge } from "@/components/ui/badge";
import { Stat } from "@/components/ui/stat";
import { EmptyState } from "@/components/ui/empty";
import { Chart } from "@/components/charts";
import { formatNumber } from "@/lib/money";
import { formatDateTimeFr, shortDayLabel, toLocalInput } from "@/lib/dates";
import { SOURCE_LABEL } from "@/lib/labels";
import { SnapshotForm } from "./snapshot-form";
import { deleteSnapshotAction, disconnectAction, syncAction } from "./actions";

export const metadata = { title: "Réseaux" };

const MESSAGES: Record<string, string> = {
  config: "Configuration required : l'application OAuth n'est pas configurée sur le serveur (voir docs).",
  oauth: "Échec de la vérification OAuth (state invalide ou annulé).",
  connect: "La connexion a échoué. Réessaie ou consulte le journal.",
};

export default async function SocialPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireOnboardedUser();
  const sp = await searchParams;
  const [integrations, metrics, { snapshot }] = await Promise.all([socialIntegrationStatus(user.id), listSocialMetrics(user.id), getAnalytics(user.id)]);
  return (
    <div>
      <PageHeader title="Réseaux" subtitle="Snapshots historiques (jamais écrasés). Aucune donnée n'est simulée." />
      {sp.error ? <p role="alert" className="mb-4 rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">{MESSAGES[sp.error] ?? "Erreur."}</p> : null}
      {sp.connected ? <p className="mb-4 rounded-lg bg-ok/10 px-3 py-2 text-sm text-ok">Compte connecté et synchronisé.</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {integrations.map((i) => {
          const sum = i.platform === "INSTAGRAM" ? snapshot.social.instagram : snapshot.social.tiktok;
          const name = i.platform === "INSTAGRAM" ? "Instagram" : "TikTok";
          const slug = i.platform.toLowerCase();
          return (
            <Card key={i.platform}>
              <div className="flex items-center justify-between">
                <span className="font-display text-xl">{name}{i.handle ? <span className="ml-2 text-sm text-mute">@{i.handle}</span> : null}</span>
                <ConnectionBadge status={i.status} />
              </div>
              {sum.snapshots === 0 ? (
                <div className="mt-3"><EmptyState title="Aucune donnée disponible." status={i.status === "CONFIGURATION_REQUIRED" ? "Configuration required" : undefined}>Ajoutez un snapshot ou connectez votre compte.</EmptyState></div>
              ) : (
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <Stat label="Abonnés" value={formatNumber(sum.latestFollowers)} />
                  <Stat label="7 jours" value={sum.followersDelta7d === null ? "—" : `${sum.followersDelta7d >= 0 ? "+" : ""}${sum.followersDelta7d}`} />
                  <Stat label="30 jours" value={sum.followersDelta30d === null ? "—" : `${sum.followersDelta30d >= 0 ? "+" : ""}${sum.followersDelta30d}`} delta={sum.growth30d} />
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                {i.configured ? (
                  i.status === "DISCONNECTED" ? <a href={`/api/integrations/${slug}/connect`} className="btn-primary">Connecter (OAuth officiel)</a> : (
                    <>
                      <form action={syncAction.bind(null, i.platform)}><button className="btn-ghost">Synchroniser</button></form>
                      <form action={disconnectAction.bind(null, i.platform)}><button className="btn-ghost">Déconnecter</button></form>
                    </>
                  )
                ) : (
                  <span className="text-mute">Variables à configurer : {i.missing.join(", ")} — voir docs/{i.platform === "INSTAGRAM" ? "INSTAGRAM" : "TIKTOK"}.md</span>
                )}
                {i.lastError ? <Badge tone="bad">{i.lastError}</Badge> : null}
              </div>
              {sum.snapshots > 0 ? <div className="mt-4"><Chart kind="line" height={160} title="Abonnés (fin de semaine)" data={sum.series.map((p) => ({ label: shortDayLabel(p.start), value: p.followers }))} /></div> : null}
            </Card>
          );
        })}
      </div>

      <SectionTitle>Ajouter un snapshot manuel</SectionTitle>
      <Card><SnapshotForm now={toLocalInput(new Date())} /></Card>

      <SectionTitle>Historique des snapshots</SectionTitle>
      <Card>
        {metrics.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left text-xs text-mute"><tr><th className="py-1 font-normal">Date</th><th className="font-normal">Plateforme</th><th className="font-normal">Abonnés</th><th className="font-normal">Vues</th><th className="font-normal">Likes</th><th className="font-normal">Source</th><th /></tr></thead>
              <tbody>
                {[...metrics].reverse().slice(0, 60).map((m) => (
                  <tr key={m.id} className="border-t border-line">
                    <td className="py-1.5 text-xs">{formatDateTimeFr(m.capturedAt)}</td><td>{m.platform === "INSTAGRAM" ? "Instagram" : "TikTok"}</td><td>{formatNumber(m.followers)}</td><td>{formatNumber(m.views)}</td><td>{formatNumber(m.likes)}</td>
                    <td>{m.source === "DEMO" ? <DemoBadge /> : <span className="text-xs text-mute">{SOURCE_LABEL[m.source]}</span>}</td>
                    <td className="text-right">{m.source === "MANUAL" ? <form action={deleteSnapshotAction.bind(null, m.id)}><button className="text-xs text-mute hover:text-bad" aria-label="Supprimer">✕</button></form> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-mute">Aucun snapshot.</p>}
      </Card>
    </div>
  );
}
