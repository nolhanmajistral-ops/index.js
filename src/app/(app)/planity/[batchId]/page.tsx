import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/auth/session";
import { getImportBatch } from "@/repositories/imports";
import { PageHeader, Card, SectionTitle } from "@/components/ui/card";
import { formatDateTimeFr } from "@/lib/dates";

export const metadata = { title: "Import" };

export default async function BatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  const user = await requireOnboardedUser();
  const { batchId } = await params;
  const batch = await getImportBatch(user.id, batchId);
  if (!batch) notFound();
  return (
    <div>
      <PageHeader title={batch.fileName} subtitle={`${formatDateTimeFr(batch.createdAt)} · ${batch.status}${batch.rolledBackAt ? ` · annulé le ${formatDateTimeFr(batch.rolledBackAt)}` : ""}`} />
      <Card className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
        {[["Lignes", batch.totalRows], ["Importées", batch.importedRows], ["Ignorées", batch.skippedRows], ["Doublons", batch.duplicateRows], ["Erreurs", batch.errorRows]].map(([k, v]) => <div key={String(k)}><div className="label">{k}</div><div className="font-display text-2xl">{v}</div></div>)}
      </Card>
      <SectionTitle>Lignes en erreur</SectionTitle>
      <Card>
        {batch.rowErrors.length ? (
          <ul className="divide-y divide-line text-sm">
            {batch.rowErrors.map((e) => (
              <li key={e.id} className="py-2">
                <div>Ligne {e.rowNumber} : <span className="text-bad">{e.error}</span></div>
                {e.correction ? <div className="text-xs text-mute">Correction : {e.correction}</div> : null}
                <div className="truncate text-xs text-mute/70">{e.rawValue}</div>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-mute">Aucune erreur.</p>}
      </Card>
    </div>
  );
}
