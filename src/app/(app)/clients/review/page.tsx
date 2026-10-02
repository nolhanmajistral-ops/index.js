import { requireOnboardedUser } from "@/lib/auth/session";
import { listPendingReviews } from "@/repositories/match-reviews";
import { PageHeader, Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { SOURCE_LABEL } from "@/lib/labels";
import { formatDateFr } from "@/lib/dates";
import { ReviewButtons } from "./review-buttons";

export const metadata = { title: "À vérifier" };

const LEVEL: Record<string, string> = { PROBABLE: "Match probable", TO_VERIFY: "À vérifier" };

export default async function ReviewPage() {
  const user = await requireOnboardedUser();
  const reviews = await listPendingReviews(user.id);
  return (
    <div>
      <PageHeader title="Correspondances à vérifier" subtitle="Aucune fusion n'est faite automatiquement sur une simple ressemblance de nom. Chaque décision est tracée." />
      {reviews.length === 0 ? (
        <EmptyState title="Rien à vérifier." />
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge tone="warn">{LEVEL[r.level] ?? r.level} · {Math.round(r.score * 100)} %</Badge>
                <span className="text-xs text-mute">{(r.reasons as string[]).join(" · ")}</span>
              </div>
              <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                {[{ t: "Nouveau / importé", c: r.client }, { t: "Client existant (conservé)", c: r.candidateClient }].map(({ t, c }) => (
                  <details key={c.id} className="rounded-xl border border-line p-3" open>
                    <summary className="cursor-pointer"><span className="label">{t}</span> <span className="ml-1 font-medium">{c.displayName}</span></summary>
                    <dl className="mt-2 grid grid-cols-[110px_1fr] gap-1 text-xs">
                      <dt className="text-mute">Email</dt><dd>{c.email ?? "—"}</dd>
                      <dt className="text-mute">Téléphone</dt><dd>{c.phone ?? "—"}</dd>
                      <dt className="text-mute">Source</dt><dd>{SOURCE_LABEL[c.source]}</dd>
                      <dt className="text-mute">Créé le</dt><dd>{formatDateFr(c.createdAt)}</dd>
                    </dl>
                  </details>
                ))}
              </div>
              <ReviewButtons id={r.id} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
