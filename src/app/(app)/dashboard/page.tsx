import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth/session";
import { getNextMove } from "@/ai/recommendations/service";
import { listAuditLogs } from "@/repositories/audit";
import { getProfile } from "@/repositories/profile";
import { Card, SectionTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { ConnectionBadge, Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { NextMoveCard } from "@/components/domain/next-move";
import { GoalProgressList } from "@/components/domain/goal-progress";
import { DemoBanner } from "@/components/domain/demo-banner";
import { Chart } from "@/components/charts";
import { formatCHF, formatNumber, formatPercent } from "@/lib/money";
import { CONTENT_TYPE_LABEL } from "@/lib/labels";
import { formatDateTimeFr, formatDateFr, shortDayLabel } from "@/lib/dates";
import { ACTIVITY_LABEL } from "@/lib/activity";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireOnboardedUser();
  const [{ snapshot: s, nba, recommendation }, logs, profile] = await Promise.all([getNextMove(user.id), listAuditLogs(user.id, 8), getProfile(user.id)]);
  const firstName = (profile?.displayName ?? user.name).split(" ")[0];
  const weekLabel = (d: Date) => shortDayLabel(d);
  const growthIg = s.social.instagram;
  const growthTt = s.social.tiktok;

  return (
    <div>
      <h1 className="font-display text-4xl tracking-tight md:text-5xl">Bonjour {firstName}.</h1>
      <p className="mt-2 mb-8 text-sm text-mute">{new Intl.DateTimeFormat("fr-CH", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Zurich" }).format(s.now)} · Lausanne</p>
      {s.dataQuality.demoData ? <DemoBanner /> : null}

      <NextMoveCard move={nba.primary} recommendationId={recommendation?.id} status={recommendation?.status} />
      {nba.alternatives.length ? (
        <p className="mt-3 text-xs text-mute">
          Ensuite : {nba.alternatives.map((a) => a.title).join(" · ")} — <Link href="/missions" className="text-gold">voir les missions du jour</Link>
        </p>
      ) : null}

      <SectionTitle>Business</SectionTitle>
      <div className="grid gap-3 md:grid-cols-[1fr_1.4fr]">
        <Card className="grid grid-cols-2 gap-5">
          <Stat label="CA semaine" value={formatCHF(s.revenue.week.totalCents)} delta={s.revenue.growthWeek} hint="vs sem. préc. à date" />
          <Stat label="CA mois" value={formatCHF(s.revenue.month.totalCents)} delta={s.revenue.growthMonth} hint="vs mois préc. à date" />
          <Stat label="Clients semaine" value={formatNumber(s.clients.week.clientsServed)} hint={`${s.clients.week.newClients} nouveaux`} />
          <Stat label="Panier moyen" value={formatCHF(s.revenue.avgTicketMonth)} hint="ce mois" />
          {s.revenue.month.pendingReviewCount || s.revenue.month.estimatedCents ? (
            <p className="col-span-2 text-xs text-mute">
              {s.revenue.month.pendingReviewCount ? <>{formatCHF(s.revenue.month.pendingReviewCents)} à vérifier (non inclus). </> : null}
              {s.revenue.month.estimatedCents ? <>Dont {formatCHF(s.revenue.month.estimatedCents)} estimé (prix catalogue).</> : null}
            </p>
          ) : null}
        </Card>
        <Card>
          <Chart kind="bar" unit="chf" title="CA confirmé par semaine (8 semaines)" data={s.revenue.weeklySeries.map((w) => ({ label: weekLabel(w.start), value: w.totalCents / 100 }))} />
        </Card>
      </div>

      <SectionTitle>Réseaux</SectionTitle>
      <div className="grid gap-3 md:grid-cols-2">
        {[{ name: "Instagram", d: growthIg }, { name: "TikTok", d: growthTt }].map(({ name, d }) => (
          <Card key={name}>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm">{name}</span>
              <ConnectionBadge status={d.status} />
            </div>
            {d.snapshots === 0 ? (
              <EmptyState title="Aucune donnée disponible." href="/social" cta="Ajouter un snapshot ou connecter le compte" />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Stat label="Abonnés" value={formatNumber(d.latestFollowers)} hint={d.latestAt ? `snapshot ${formatDateFr(d.latestAt)}` : undefined} />
                  <Stat label="30 jours" value={d.followersDelta30d === null ? "—" : `${d.followersDelta30d > 0 ? "+" : ""}${formatNumber(d.followersDelta30d)}`} delta={d.growth30d} />
                </div>
                <div className="mt-4">
                  <Chart kind="line" height={140} title="Abonnés (fin de semaine)" data={d.series.map((p) => ({ label: weekLabel(p.start), value: p.followers }))} />
                </div>
              </>
            )}
          </Card>
        ))}
      </div>

      <SectionTitle>Contenu</SectionTitle>
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="grid grid-cols-2 gap-4 md:col-span-1">
          <Stat label="Publiés semaine" value={s.content.publishedWeek} hint={`${s.content.publishedPrevWeek} sem. préc.`} />
          <Stat label="Publiés mois" value={s.content.publishedMonth} />
          <Stat label="En préparation" value={s.content.pipeline} />
          <Stat label="Idées" value={s.content.ideas} />
        </Card>
        <Card>
          <div className="label">Meilleur contenu (30 j)</div>
          {s.content.best30d ? (
            <Link href={`/contents/${s.content.best30d.content.id}`} className="mt-2 block">
              <div className="font-display text-xl">{s.content.best30d.content.title}</div>
              <div className="mt-1 text-xs text-mute">{CONTENT_TYPE_LABEL[s.content.best30d.content.type]} · score {s.content.best30d.score}/100 · {s.content.best30d.content.latest ? `${formatNumber(s.content.best30d.content.latest.views)} vues` : ""}</div>
            </Link>
          ) : (
            <p className="mt-2 text-sm text-mute">Données insuffisantes (au moins 3 contenus publiés avec métriques).</p>
          )}
        </Card>
        <Card>
          <div className="label">Meilleur format</div>
          {s.content.bestFormat ? (
            <>
              <div className="mt-2 font-display text-xl">{CONTENT_TYPE_LABEL[s.content.bestFormat.type]}</div>
              <div className="mt-1 text-xs text-mute">score moyen {Math.round(s.content.bestFormat.avgOverall ?? 0)}/100 sur {s.content.bestFormat.count} contenus · {s.content.bestFormat.clients} client(s) attribué(s)</div>
            </>
          ) : (
            <p className="mt-2 text-sm text-mute">Données insuffisantes (2 contenus mesurés par format minimum).</p>
          )}
        </Card>
      </div>

      <SectionTitle action={<Link href="/planning" className="text-xs text-gold">Ouvrir le planning</Link>}>Planning</SectionTitle>
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm">Rendez-vous & clients</span>
          <div className="flex items-center gap-2">
            {s.planity.imports ? <ConnectionBadge status={s.planity.status} /> : null}
            {s.planity.lastImportAt ? <span className="text-xs text-mute">dernier import {formatDateFr(s.planity.lastImportAt)}</span> : null}
          </div>
        </div>
        {!s.dataQuality.hasAppointments ? (
          <EmptyState title="Aucun rendez-vous." href="/planning" cta="Ajouter tes rendez-vous dans le planning" />
        ) : (
          <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
            <Stat label="RDV semaine" value={formatNumber(s.revenue.servicesWeek)} hint={`${s.planity.upcoming} à venir`} />
            <Stat label="Nouveaux clients" value={formatNumber(s.clients.week.newClients)} hint={`${s.clients.month.newClients} ce mois`} />
            <Stat label="Récurrence" value={formatPercent(s.clients.month.recurrenceRate)} hint="ce mois" />
            <Stat label="À relancer" value={formatNumber(s.clients.overdue.length)} hint="clients en retard" />
          </div>
        )}
      </Card>

      <SectionTitle action={<Link href="/goals" className="text-xs text-gold">Gérer</Link>}>Objectifs</SectionTitle>
      <Card>{s.goals.length ? <GoalProgressList goals={s.goals} /> : <EmptyState title="Aucun objectif" href="/goals" cta="Définir un objectif" />}</Card>

      <SectionTitle>Activité récente</SectionTitle>
      <Card>
        {logs.length ? (
          <ul className="divide-y divide-line text-sm">
            {logs.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                <span>{ACTIVITY_LABEL[l.action] ?? l.action}</span>
                <span className="text-xs text-mute">{formatDateTimeFr(l.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-mute">Aucune activité.</p>
        )}
        {s.dataQuality.pendingMatchReviews ? (
          <p className="mt-3 text-xs">
            <Badge tone="warn">À vérifier</Badge> <Link href="/clients/review" className="text-gold">{s.dataQuality.pendingMatchReviews} correspondance(s) client</Link>
          </p>
        ) : null}
      </Card>
    </div>
  );
}
