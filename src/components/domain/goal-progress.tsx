import type { GoalProgress } from "@/domain/goals/progress";
import { GOAL_LABEL } from "@/lib/labels";
import { formatCHF, formatNumber } from "@/lib/money";
import { Badge } from "@/components/ui/badge";

const fmt = (metric: string, v: number | null) => (v === null ? "Non disponible" : GOAL_LABEL[metric]?.unit === "chf" ? formatCHF(v) : formatNumber(v));

export function GoalProgressList({ goals }: { goals: GoalProgress[] }) {
  return (
    <ul className="space-y-4">
      {goals.map((g) => {
        const p = g.progress === null ? 0 : Math.min(1, g.progress);
        return (
          <li key={g.goalId}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span>{GOAL_LABEL[g.metric]?.label ?? g.metric}</span>
              <span className="tabular-nums text-soft">
                {fmt(g.metric, g.actual)} <span className="text-mute">/ {fmt(g.metric, g.target)}</span>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-3" role="progressbar" aria-valuenow={Math.round(p * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-[var(--color-chart)] transition-all" style={{ width: `${p * 100}%` }} />
            </div>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-mute">
              {g.actual === null ? (
                <span>{g.unavailableReason ?? "Non disponible"}</span>
              ) : (
                <>
                  <span>{Math.round((g.progress ?? 0) * 100)} %</span>
                  {g.gap !== null && g.gap > 0 ? <span>· écart {fmt(g.metric, g.gap)}</span> : <span>· atteint</span>}
                  {g.trend ? <span>· tendance {g.trend === "up" ? "▲" : g.trend === "down" ? "▼" : "="} vs période précédente</span> : null}
                  {g.onTrack !== null ? <Badge tone={g.onTrack ? "ok" : "warn"}>{g.onTrack ? "Dans le rythme" : "En retard"}</Badge> : null}
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
