import Link from "next/link";
import clsx from "clsx";
import { requireOnboardedUser } from "@/lib/auth/session";
import { listWeekAppointments } from "@/domain/planning/service";
import { listServices } from "@/repositories/services";
import { clientOptions } from "@/repositories/clients";
import { PageHeader, Card, SectionTitle } from "@/components/ui/card";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { Stat } from "@/components/ui/stat";
import { formatCHF } from "@/lib/money";
import { APPOINTMENT_STATUS_LABEL } from "@/lib/labels";
import { addUnits, fromLocalInput, localDateKey, periodOf } from "@/lib/dates";
import { AppointmentForm } from "./appointment-form";
import { AppointmentActions } from "./appointment-actions";

export const metadata = { title: "Planning" };

const TONE: Record<string, "ok" | "gold" | "warn" | "bad"> = { COMPLETED: "ok", BOOKED: "gold", CANCELLED: "warn", NO_SHOW: "bad" };

/** Prochain créneau de 30 min (entre 08:00 et 20:00, heure de Lausanne). */
function nextSlot(now: Date) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const [h, m] = f.format(now).split(":").map(Number) as [number, number];
  const t = Math.min(20 * 60, Math.max(8 * 60, Math.ceil((h * 60 + m) / 30) * 30));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export default async function PlanningPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireOnboardedUser();
  const sp = await searchParams;
  const now = new Date();
  const ref = (sp.week && fromLocalInput(sp.week)) || now;
  const week = periodOf("week", ref);
  const [appts, services, clients] = await Promise.all([listWeekAppointments(user.id, week.start, week.end), listServices(user.id, { activeOnly: true }), clientOptions(user.id)]);

  const days = Array.from({ length: 7 }, (_, i) => addUnits("day", week.start, i));
  const byDay = new Map<string, typeof appts>();
  for (const a of appts) {
    const k = localDateKey(a.startsAt);
    byDay.set(k, [...(byDay.get(k) ?? []), a]);
  }
  const done = appts.filter((a) => a.status === "COMPLETED");
  const booked = appts.filter((a) => a.status === "BOOKED");
  const todayKey = localDateKey(now);
  const weekKey = (d: Date) => localDateKey(d);
  const time = (d: Date) => new Intl.DateTimeFormat("fr-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" }).format(d);
  const dayLabel = (d: Date) => new Intl.DateTimeFormat("fr-CH", { timeZone: "Europe/Zurich", weekday: "short", day: "numeric", month: "short" }).format(d);
  const defaultDate = localDateKey(now) >= localDateKey(week.start) && now < week.end ? todayKey : localDateKey(week.start);

  return (
    <div>
      <PageHeader
        title="Planning"
        subtitle="Ajoute tes rendez-vous : le CA, les clients et les statistiques se mettent à jour automatiquement."
        action={<Link href="/planity" className="btn-ghost text-xs">Importer un export Planity</Link>}
      />

      <Card>
        <h2 className="mb-3 font-display text-lg">Nouveau rendez-vous</h2>
        {services.length ? (
          <AppointmentForm services={services.map((s) => ({ id: s.id, name: s.name, priceCents: s.priceCents }))} clients={clients.map((c) => ({ id: c.id, name: c.displayName }))} defaultDate={defaultDate} defaultTime={nextSlot(now)} />
        ) : (
          <p className="text-sm text-mute">Ajoute d&apos;abord tes prestations dans <Link href="/settings" className="text-gold">Réglages → Tarifs</Link>.</p>
        )}
      </Card>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link href={`/planning?week=${weekKey(addUnits("week", week.start, -1))}`} className="btn-ghost px-3 py-1.5" aria-label="Semaine précédente">←</Link>
          <Link href="/planning" className="btn-ghost px-3 py-1.5 text-xs">Aujourd&apos;hui</Link>
          <Link href={`/planning?week=${weekKey(addUnits("week", week.start, 1))}`} className="btn-ghost px-3 py-1.5" aria-label="Semaine suivante">→</Link>
        </div>
        <span className="font-display text-lg">Semaine du {dayLabel(week.start)}</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><Stat label="Réalisés" value={done.length} /></Card>
        <Card><Stat label="Réservés" value={booked.length} /></Card>
        <Card><Stat label="CA réalisé" value={formatCHF(done.reduce((s, a) => s + a.priceCents, 0))} /></Card>
        <Card><Stat label="Annulés / absents" value={appts.length - done.length - booked.length} /></Card>
      </div>

      <SectionTitle>Rendez-vous de la semaine</SectionTitle>
      <div className="grid gap-2 md:grid-cols-7">
        {days.map((d) => {
          const k = localDateKey(d);
          const list = byDay.get(k) ?? [];
          return (
            <div key={k} className={clsx("rounded-2xl border p-2", k === todayKey ? "border-gold/50 bg-ink-2" : "border-line bg-ink-2/60")}>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <span className={clsx("text-xs font-medium capitalize", k === todayKey ? "text-gold" : "text-soft")}>{dayLabel(d)}</span>
                <span className="text-[10px] text-mute">{list.filter((a) => a.status === "COMPLETED").length}/{list.length}</span>
              </div>
              {list.length === 0 ? <p className="px-1 pb-1 text-[11px] text-mute/60">—</p> : null}
              <ul className="space-y-1.5">
                {list.map((a) => (
                  <li key={a.id} className={clsx("rounded-xl border border-line bg-ink p-2 text-xs", (a.status === "CANCELLED" || a.status === "NO_SHOW") && "opacity-60")}>
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-medium tabular-nums">{time(a.startsAt)}</span>
                      <Badge tone={TONE[a.status]} className="px-1.5 text-[9px]">{APPOINTMENT_STATUS_LABEL[a.status]}</Badge>
                    </div>
                    <div className="mt-1 truncate text-bone">{a.client ? <Link href={`/clients/${a.client.id}`}>{a.client.displayName}</Link> : <span className="text-mute">Sans client</span>}</div>
                    <div className="truncate text-mute">{a.serviceName} · {formatCHF(a.priceCents)}</div>
                    {a.notes ? <div className="truncate text-mute/80" title={a.notes}>{a.notes}</div> : null}
                    {a.source === "DEMO" ? <DemoBadge /> : null}
                    <AppointmentActions id={a.id} status={a.status} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
