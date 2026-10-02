import type { ActionCandidate } from "@/domain/recommendations/types";
import { ConfidenceBadge } from "@/components/ui/badge";
import { RecommendationButtons } from "./recommendation-buttons";

export function NextMoveCard({ move, recommendationId, status }: { move: ActionCandidate | null; recommendationId?: string; status?: string }) {
  if (!move)
    return (
      <section className="rounded-3xl border border-gold/30 bg-gradient-to-br from-ink-3 to-ink-2 p-6">
        <div className="label text-gold">Ton prochain move</div>
        <p className="mt-3 text-mute">Données insuffisantes pour proposer une action. Importe tes rendez-vous Planity ou ajoute un contenu.</p>
      </section>
    );
  return (
    <section aria-labelledby="next-move" className="fade-in relative overflow-hidden rounded-3xl border border-gold/30 bg-gradient-to-br from-ink-3 via-ink-2 to-ink p-6 md:p-8">
      <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-gold/10 blur-3xl" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="next-move" className="label text-gold">Ton prochain move</h2>
        <ConfidenceBadge level={move.confidence} />
      </div>
      <p className="mt-4 font-display text-2xl leading-snug md:text-3xl">{move.action}</p>
      <dl className="mt-6 grid gap-5 text-sm md:grid-cols-3">
        <div>
          <dt className="label">Pourquoi</dt>
          <dd className="mt-1 text-soft">{move.why}</dd>
        </div>
        <div>
          <dt className="label">Données utilisées</dt>
          <dd className="mt-1">
            <ul className="space-y-0.5 text-soft">
              {Object.entries(move.dataUsed).map(([k, v]) => (
                <li key={k} className="flex justify-between gap-3">
                  <span className="text-mute">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</span>
                  <span className="tabular-nums">{v === null ? "—" : String(v)}</span>
                </li>
              ))}
            </ul>
          </dd>
        </div>
        <div>
          <dt className="label">Résultat attendu</dt>
          <dd className="mt-1 text-soft">{move.expectedResult}</dd>
        </div>
      </dl>
      {recommendationId ? <RecommendationButtons id={recommendationId} status={status ?? "PROPOSED"} /> : null}
    </section>
  );
}
