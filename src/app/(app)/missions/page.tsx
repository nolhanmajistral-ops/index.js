import { requireOnboardedUser } from "@/lib/auth/session";
import { ensureTodayMissions } from "@/ai/recommendations/service";
import { listRecentMissions } from "@/repositories/missions";
import { PageHeader, Card, SectionTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { MissionCard } from "./mission-card";
import { MAX_DAILY_MISSIONS } from "@/domain/missions/generator";

export const metadata = { title: "Missions" };

export default async function MissionsPage() {
  const user = await requireOnboardedUser();
  const today = await ensureTodayMissions(user.id);
  const history = (await listRecentMissions(user.id, new Date(Date.now() - 8 * 86_400_000))).filter((m) => !today.some((t) => t.id === m.id));
  const done = today.filter((m) => m.status === "DONE").length;
  const days = new Map<string, typeof history>();
  for (const m of history) days.set(m.date.toISOString().slice(0, 10), [...(days.get(m.date.toISOString().slice(0, 10)) ?? []), m]);
  return (
    <div>
      <PageHeader title="Missions du jour" subtitle={`Au maximum ${MAX_DAILY_MISSIONS}, générées à partir de tes données. ${done}/${today.length} faites.`} />
      {today.length === 0 ? <EmptyState title="Aucune mission aujourd'hui : rien d'urgent dans tes données." /> : (
        <div className="space-y-3">{today.map((m) => <MissionCard key={m.id} m={{ ...m, dataUsed: m.dataUsed as Record<string, unknown> | null }} />)}</div>
      )}
      <SectionTitle>Historique (7 jours)</SectionTitle>
      <Card>
        {days.size ? (
          <ul className="space-y-3 text-sm">
            {[...days.entries()].map(([d, ms]) => (
              <li key={d}>
                <div className="label">{new Date(d).toLocaleDateString("fr-CH", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}</div>
                <ul className="mt-1 space-y-1">{ms.map((m) => <li key={m.id} className="flex justify-between gap-2"><span>{m.title}{m.resultNote ? <span className="text-xs text-mute"> — {m.resultNote}</span> : null}</span><span className="flex gap-1">{m.source === "DEMO" ? <Badge tone="warn">DEMO</Badge> : null}<Badge tone={m.status === "DONE" ? "ok" : m.status === "SKIPPED" ? "neutral" : "warn"}>{{ DONE: "Done", SKIPPED: "Skipped", PARTIAL: "Partially done", PENDING: "Pending" }[m.status]}</Badge></span></li>)}</ul>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-mute">Aucun historique.</p>}
      </Card>
    </div>
  );
}
