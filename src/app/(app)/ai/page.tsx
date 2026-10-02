import { requireOnboardedUser } from "@/lib/auth/session";
import { aiStatus } from "@/ai/providers";
import { SUGGESTED_QUESTIONS } from "@/ai/coach/deterministic";
import { listExperiments, listMemories, listRecommendations } from "@/repositories/ai";
import { PageHeader, Card, SectionTitle } from "@/components/ui/card";
import { Badge, ConfidenceBadge } from "@/components/ui/badge";
import { formatDateFr, localDateKey } from "@/lib/dates";
import { CoachChat } from "./coach-chat";
import { ContentGenerator } from "./content-generator";
import { CompleteExperimentForm, ExperimentForm, LearningButton, PreferenceForm } from "./forms";
import { abandonExperimentAction, deleteMemoryAction } from "./actions";

export const metadata = { title: "Coach IA" };

const OUTCOME: Record<string, { label: string; tone: "ok" | "neutral" | "bad" | "warn" }> = { POSITIVE: { label: "Positif", tone: "ok" }, NEUTRAL: { label: "Neutre", tone: "neutral" }, NEGATIVE: { label: "Négatif", tone: "bad" }, INCONCLUSIVE: { label: "Non concluant", tone: "warn" } };

export default async function AiPage() {
  const user = await requireOnboardedUser();
  const [recs, experiments, memories] = await Promise.all([listRecommendations(user.id, 20), listExperiments(user.id), listMemories(user.id, undefined, 40)]);
  const status = aiStatus();
  return (
    <div>
      <PageHeader title="Coach IA" subtitle="Réponses fondées uniquement sur tes données. Sinon : « Données insuffisantes pour conclure. »" action={<Badge tone={status.configured ? "ok" : "warn"}>{status.configured ? `Fournisseur : ${status.provider}` : "Mode déterministe (aucun LLM configuré)"}</Badge>} />
      <Card><CoachChat suggestions={SUGGESTED_QUESTIONS} /></Card>

      <SectionTitle>Générateur de contenu</SectionTitle>
      <Card><ContentGenerator /></Card>

      <SectionTitle action={<LearningButton />}>Recommandations & apprentissage</SectionTitle>
      <Card>
        {recs.length ? (
          <ul className="divide-y divide-line text-sm">
            {recs.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{r.action}</span>
                  <span className="flex flex-wrap gap-1">
                    <ConfidenceBadge level={r.confidence} />
                    <Badge>{{ PROPOSED: "Proposée", DONE: "Done", SKIPPED: "Skipped", PARTIAL: "Partially done" }[r.status]}</Badge>
                    {r.outcome ? <Badge tone={OUTCOME[r.outcome]?.tone}>{OUTCOME[r.outcome]?.label}</Badge> : null}
                  </span>
                </div>
                <div className="mt-1 text-xs text-mute">{formatDateFr(r.createdAt)} · {r.ruleCode}{r.evaluatedAt ? ` · ${r.evaluationNote}` : r.status === "DONE" || r.status === "PARTIAL" ? ` · évaluation prévue le ${formatDateFr(r.evaluateAfter)}` : ""}</div>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-mute">Aucune recommandation pour l&apos;instant (elles apparaissent sur le dashboard).</p>}
        <p className="mt-3 text-xs text-mute">Boucle : Observation → Recommandation → Action → Résultat → Évaluation → Mémoire → Recommandation future. L&apos;évaluation compare la métrique visée avant/après : c&apos;est une corrélation, pas une preuve de causalité.</p>
      </Card>

      <SectionTitle>Expériences</SectionTitle>
      <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
        <Card><ExperimentForm today={localDateKey(new Date())} /></Card>
        <Card>
          {experiments.length ? (
            <ul className="space-y-4 text-sm">
              {experiments.map((e) => (
                <li key={e.id} className="border-b border-line pb-3 last:border-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{e.hypothesis}</span>{e.source === "DEMO" ? <Badge tone="warn">DEMO</Badge> : null}<Badge>{e.status}</Badge>{e.outcome ? <Badge tone={OUTCOME[e.outcome]?.tone}>{OUTCOME[e.outcome]?.label}</Badge> : null}</div>
                  <div className="mt-1 text-xs text-mute">{e.action} · {e.durationDays} j dès le {formatDateFr(e.startDate)} · attendu : {e.expectedResult}</div>
                  {e.conclusion ? <div className="mt-1 text-xs text-soft">Conclusion : {e.conclusion}</div> : null}
                  {e.status === "RUNNING" || e.status === "PLANNED" ? (
                    <>
                      <CompleteExperimentForm id={e.id} />
                      <form action={abandonExperimentAction.bind(null, e.id)}><button className="mt-1 text-xs text-mute hover:text-bad">Abandonner</button></form>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-mute">Aucune expérience.</p>}
        </Card>
      </div>

      <SectionTitle>Mémoire</SectionTitle>
      <Card className="space-y-4">
        <PreferenceForm />
        <ul className="divide-y divide-line text-sm">
          {memories.map((m) => (
            <li key={m.id} className="flex items-start justify-between gap-3 py-2">
              <span><Badge>{m.kind}</Badge> <span className="text-soft">{m.content}</span></span>
              <form action={deleteMemoryAction.bind(null, m.id)}><button className="text-xs text-mute hover:text-bad" aria-label="Oublier">✕</button></form>
            </li>
          ))}
          {memories.length === 0 ? <li className="py-2 text-mute">Mémoire vide.</li> : null}
        </ul>
      </Card>
    </div>
  );
}
