import { requireOnboardedUser } from "@/lib/auth/session";
import { getAnalytics } from "@/domain/analytics/service";
import { listGoals } from "@/repositories/goals";
import { PageHeader, Card, SectionTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { GoalProgressList } from "@/components/domain/goal-progress";
import { GOAL_LABEL } from "@/lib/labels";
import { GoalForm } from "./goal-form";
import { deactivateGoalAction } from "./actions";

export const metadata = { title: "Objectifs" };

export default async function GoalsPage() {
  const user = await requireOnboardedUser();
  const [{ snapshot }, goals] = await Promise.all([getAnalytics(user.id), listGoals(user.id)]);
  return (
    <div>
      <PageHeader title="Objectifs" subtitle="Objectif, réel, progression, écart et tendance — calculés avec les mêmes définitions que partout ailleurs." />
      <Card>{snapshot.goals.length ? <GoalProgressList goals={snapshot.goals} /> : <EmptyState title="Aucun objectif défini." />}</Card>
      <SectionTitle>Définir / modifier un objectif</SectionTitle>
      <Card><GoalForm /></Card>
      {goals.length ? (
        <>
          <SectionTitle>Objectifs actifs</SectionTitle>
          <Card>
            <ul className="divide-y divide-line text-sm">
              {goals.map((g) => (
                <li key={g.id} className="flex items-center justify-between py-2">
                  <span>{GOAL_LABEL[g.metric]?.label} {g.source === "DEMO" ? <Badge tone="warn">DEMO</Badge> : null}</span>
                  <form action={deactivateGoalAction.bind(null, g.id)}><button className="text-xs text-mute hover:text-bad">Désactiver</button></form>
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : null}
    </div>
  );
}
