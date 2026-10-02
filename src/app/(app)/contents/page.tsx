import Link from "next/link";
import clsx from "clsx";
import type { ContentStatus, ContentType, Platform } from "@prisma/client";
import { requireOnboardedUser } from "@/lib/auth/session";
import { listContents } from "@/repositories/contents";
import { getAnalytics } from "@/domain/analytics/service";
import { overallScore } from "@/domain/content/scores";
import { PageHeader, Card } from "@/components/ui/card";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { Stat } from "@/components/ui/stat";
import { EmptyState } from "@/components/ui/empty";
import { CONTENT_STATUS_LABEL, CONTENT_TYPE_LABEL, PLATFORM_LABEL } from "@/lib/labels";
import { contentStatuses, contentTypes, platforms } from "@/lib/validation/schemas";
import { formatNumber } from "@/lib/money";
import { formatDateFr, periodOf, addUnits, localDateKey, startOf } from "@/lib/dates";

export const metadata = { title: "Contenus" };

type SP = Record<string, string | undefined>;
const pickEnum = <T extends string>(v: string | undefined, values: readonly T[]) => (v && (values as readonly string[]).includes(v) ? (v as T) : undefined);

export default async function ContentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireOnboardedUser();
  const sp = await searchParams;
  const view = sp.view === "calendar" ? "calendar" : "list";
  const filters = {
    q: sp.q?.slice(0, 100),
    platform: pickEnum<Platform>(sp.platform, platforms),
    type: pickEnum<ContentType>(sp.type, contentTypes),
    status: pickEnum<ContentStatus>(sp.status, contentStatuses),
    archived: sp.archived === "1",
    sort: sp.sort === "views" ? ("views" as const) : sp.sort === "planned" ? ("planned" as const) : ("recent" as const),
    page: Math.max(1, Number(sp.page) || 1),
  };
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? new Date(`${sp.month}-15T12:00:00Z`) : new Date();
  const monthPeriod = periodOf("month", month);
  const [list, { snapshot }] = await Promise.all([
    listContents(user.id, view === "calendar" ? { ...filters, from: monthPeriod.start, to: monthPeriod.end, pageSize: 100, page: 1 } : filters.sort === "views" ? { ...filters, pageSize: 100, page: 1 } : { ...filters, pageSize: 30 }),
    getAnalytics(user.id),
  ]);
  const items = filters.sort === "views" ? [...list.items].sort((a, b) => (b.latest?.views ?? -1) - (a.latest?.views ?? -1)) : list.items;
  const qs = (extra: SP) => new URLSearchParams(Object.entries({ ...sp, ...extra }).filter(([, v]) => v !== undefined && v !== "") as [string, string][]).toString();

  return (
    <div>
      <PageHeader title="Contenus" subtitle="Idées, tournages, publications et performances." action={<Link href="/contents/new" className="btn-primary">Ajouter un contenu</Link>} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><Stat label="Publiés cette semaine" value={snapshot.content.publishedWeek} /></Card>
        <Card><Stat label="Publiés ce mois" value={snapshot.content.publishedMonth} /></Card>
        <Card><Stat label="En préparation" value={snapshot.content.pipeline} /></Card>
        <Card><Stat label="Meilleur format" value={snapshot.content.bestFormat ? CONTENT_TYPE_LABEL[snapshot.content.bestFormat.type] : "—"} hint={snapshot.content.bestFormat ? undefined : "données insuffisantes"} /></Card>
      </div>

      <form className="card mb-4 grid gap-2 md:grid-cols-[1.5fr_repeat(4,1fr)_auto]" role="search">
        <input type="hidden" name="view" value={view} />
        <input name="q" defaultValue={filters.q} placeholder="Rechercher titre ou hook…" className="input" aria-label="Recherche" />
        <select name="platform" defaultValue={filters.platform ?? ""} className="input" aria-label="Plateforme"><option value="">Plateformes</option>{platforms.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}</select>
        <select name="type" defaultValue={filters.type ?? ""} className="input" aria-label="Type"><option value="">Types</option>{contentTypes.map((t) => <option key={t} value={t}>{CONTENT_TYPE_LABEL[t]}</option>)}</select>
        <select name="status" defaultValue={filters.status ?? ""} className="input" aria-label="Statut"><option value="">Statuts</option>{contentStatuses.map((t) => <option key={t} value={t}>{CONTENT_STATUS_LABEL[t]}</option>)}</select>
        <select name="sort" defaultValue={filters.sort} className="input" aria-label="Tri"><option value="recent">Plus récents</option><option value="views">Plus de vues</option><option value="planned">Date prévue</option></select>
        <button className="btn-ghost">Filtrer</button>
      </form>
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href={`/contents?${qs({ view: "list" })}`} className={clsx("rounded-full px-3 py-1", view === "list" ? "bg-ink-3 text-bone" : "text-mute")}>Liste</Link>
        <Link href={`/contents?${qs({ view: "calendar" })}`} className={clsx("rounded-full px-3 py-1", view === "calendar" ? "bg-ink-3 text-bone" : "text-mute")}>Calendrier</Link>
        <Link href={`/contents?${qs({ archived: filters.archived ? undefined : "1" })}`} className="ml-auto rounded-full px-3 py-1 text-mute">{filters.archived ? "Voir actifs" : "Voir archivés"}</Link>
      </div>

      {view === "calendar" ? (
        <Calendar month={month} items={items} sp={sp} />
      ) : items.length === 0 ? (
        <EmptyState title="Aucun contenu" href="/contents/new" cta="Ajouter un contenu" />
      ) : (
        <Card className="p-0 md:p-0">
          <ul className="divide-y divide-line">
            {items.map((c) => {
              const sc = snapshot.content.scores.get(c.id);
              const o = sc ? overallScore(sc) : null;
              return (
                <li key={c.id}>
                  <Link href={`/contents/${c.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 transition hover:bg-ink-3/40">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 truncate font-medium">{c.title} {c.source === "DEMO" ? <DemoBadge /> : null}</div>
                      <div className="mt-0.5 text-xs text-mute">{PLATFORM_LABEL[c.platform]} · {CONTENT_TYPE_LABEL[c.type]} · {c.publishedAt ? formatDateFr(c.publishedAt) : c.plannedAt ? `prévu ${formatDateFr(c.plannedAt)}` : "non planifié"}</div>
                    </div>
                    <Badge tone={c.status === "PUBLISHED" ? "ok" : "neutral"}>{CONTENT_STATUS_LABEL[c.status]}</Badge>
                    <span className="w-24 text-right text-sm tabular-nums text-soft">{c.latest ? `${formatNumber(c.latest.views)} vues` : "—"}</span>
                    <span className="w-16 text-right text-sm tabular-nums">{o === null ? <span className="text-mute">—</span> : `${o}/100`}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {list.total > list.pageSize ? (
            <div className="flex justify-between px-4 py-3 text-sm">
              {list.page > 1 ? <Link href={`/contents?${qs({ page: String(list.page - 1) })}`} className="text-gold">← Précédent</Link> : <span />}
              <span className="text-mute">{list.total} contenus</span>
              {list.page * list.pageSize < list.total ? <Link href={`/contents?${qs({ page: String(list.page + 1) })}`} className="text-gold">Suivant →</Link> : <span />}
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}

function Calendar({ month, items, sp }: { month: Date; items: { id: string; title: string; status: string; publishedAt: Date | null; plannedAt: Date | null }[]; sp: SP }) {
  const p = periodOf("month", month);
  const gridStart = startOf("week", p.start);
  const days: Date[] = [];
  for (let d = gridStart; d < p.end || days.length % 7 !== 0; d = addUnits("day", d, 1)) days.push(d);
  const byDay = new Map<string, typeof items>();
  for (const c of items) {
    const at = c.publishedAt ?? c.plannedAt;
    if (!at) continue;
    const k = localDateKey(at);
    byDay.set(k, [...(byDay.get(k) ?? []), c]);
  }
  const monthKey = (d: Date) => localDateKey(d).slice(0, 7);
  const nav = (n: number) => new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v) as [string, string][]), view: "calendar", month: monthKey(addUnits("month", p.start, n)) }).toString();
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <Link href={`/contents?${nav(-1)}`} className="text-gold">←</Link>
        <span className="font-display text-lg capitalize">{new Intl.DateTimeFormat("fr-CH", { month: "long", year: "numeric", timeZone: "Europe/Zurich" }).format(p.start)}</span>
        <Link href={`/contents?${nav(1)}`} className="text-gold">→</Link>
      </div>
      <div className="grid grid-cols-7 gap-1 text-xs">
        {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => <div key={d} className="label py-1 text-center">{d}</div>)}
        {days.map((d) => {
          const k = localDateKey(d);
          const inMonth = monthKey(d) === monthKey(p.start);
          return (
            <div key={k} className={clsx("min-h-20 rounded-lg border border-line p-1", !inMonth && "opacity-30")}>
              <div className="text-mute">{Number(k.slice(8))}</div>
              {(byDay.get(k) ?? []).map((c) => (
                <Link key={c.id} href={`/contents/${c.id}`} className={clsx("mt-0.5 block truncate rounded px-1 py-0.5", c.status === "PUBLISHED" ? "bg-gold-soft text-bone" : "border border-dashed border-line-2 text-soft")} title={c.title}>
                  {c.title}
                </Link>
              ))}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
