import Link from "next/link";
import { requireOnboardedUser } from "@/lib/auth/session";
import { listImportBatches } from "@/repositories/imports";
import { listSyncJobs } from "@/repositories/sync";
import { PageHeader, Card, SectionTitle } from "@/components/ui/card";
import { Badge, ConnectionBadge } from "@/components/ui/badge";
import { formatDateTimeFr } from "@/lib/dates";
import { ImportWizard } from "./import-wizard";
import { RollbackButton } from "./rollback-button";

export const metadata = { title: "Planity" };

const STATUS: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "neutral" }> = { COMPLETED: { label: "Terminé", tone: "ok" }, ROLLED_BACK: { label: "Annulé", tone: "neutral" }, FAILED: { label: "Échec", tone: "bad" }, PROCESSING: { label: "En cours", tone: "warn" } };

export default async function PlanityPage() {
  const user = await requireOnboardedUser();
  const [batches, jobs] = await Promise.all([listImportBatches(user.id), listSyncJobs(user.id, "PLANITY", 10)]);
  const planityBatches = batches.filter((b) => b.provider === "PLANITY");
  const connected = planityBatches.some((b) => b.status === "COMPLETED");
  return (
    <div>
      <PageHeader title="Planity" subtitle="Import des exports CSV/XLSX. Planity ne fournit pas d'API publique : aucune synchronisation automatique n'est simulée." action={<ConnectionBadge status={connected ? "CONNECTED_IMPORT" : "CONFIGURATION_REQUIRED"} />} />
      <Card><ImportWizard /></Card>
      <p className="mt-2 text-xs text-mute">Fichiers de test : <code>docs/samples/planity-sample.csv</code> et <code>.xlsx</code> (données fictives). Taille max configurable (IMPORT_MAX_FILE_MB).</p>

      <SectionTitle>Historique des imports</SectionTitle>
      <Card>
        {batches.length ? (
          <ul className="divide-y divide-line text-sm">
            {batches.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <Link href={`/planity/${b.id}`} className="font-medium">{b.fileName}</Link> {b.provider === "DEMO" ? <Badge tone="warn">DEMO</Badge> : null}
                  <div className="text-xs text-mute">{formatDateTimeFr(b.createdAt)} · {b.totalRows} lignes · {b.importedRows} importées · {b.duplicateRows} doublons · {b.errorRows} erreurs</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={STATUS[b.status]?.tone}>{STATUS[b.status]?.label ?? b.status}</Badge>
                  {b.status === "COMPLETED" && b.provider === "PLANITY" ? <RollbackButton batchId={b.id} /> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-mute">Aucun import.</p>}
      </Card>

      <SectionTitle>Journal de synchronisation</SectionTitle>
      <Card>
        {jobs.length ? (
          <table className="w-full text-xs tabular-nums">
            <thead className="text-left text-mute"><tr><th className="py-1 font-normal">Début</th><th className="font-normal">Statut</th><th className="font-normal">Enregistrements</th><th className="font-normal">Erreurs</th><th className="font-normal">Durée</th></tr></thead>
            <tbody>{jobs.map((j) => <tr key={j.id} className="border-t border-line"><td className="py-1">{formatDateTimeFr(j.startedAt)}</td><td>{j.status}</td><td>{j.records}</td><td>{j.errors}</td><td>{j.durationMs === null ? "—" : `${j.durationMs} ms`}</td></tr>)}</tbody>
          </table>
        ) : <p className="text-sm text-mute">Aucune exécution.</p>}
      </Card>
    </div>
  );
}
