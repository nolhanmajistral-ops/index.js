"use client";

import { useState } from "react";
import clsx from "clsx";
import { Badge } from "@/components/ui/badge";

const FIELDS: [string, string, boolean][] = [
  ["date", "Date *", true], ["time", "Heure", false], ["clientName", "Client (nom complet)", false], ["firstName", "Prénom", false], ["lastName", "Nom", false],
  ["email", "Email", false], ["phone", "Téléphone", false], ["service", "Prestation *", true], ["price", "Prix", false], ["status", "Statut", false],
  ["externalId", "ID rendez-vous", false], ["howFound", "Comment nous as-tu trouvé ?", false], ["notes", "Notes", false],
];

type Mapping = Record<string, number | null | undefined>;
interface Report {
  totalRows: number; importedRows: number; duplicateRows: number; errorRows: number; clientsCreated: number; clientsMatched: number; reviewsCreated: number;
  servicesCreated: string[]; revenueCents: number; estimatedRevenueCents: number; manualRevenueMarkedDuplicate: number; manualRevenueMarkedReview: number;
  matchLevels: Record<string, number>; warnings: string[]; errors: { rowNumber: number; error: string; correction?: string | null }[];
  preview: { rowNumber: number; date: string; client: string; service: string; priceCents: number | null; status: string; outcome: string; match: string }[];
  batchId: string | null;
}
interface Inspect { headers: string[]; headerRowNumber: number; rowCount: number; mapping: Mapping; preview: Report | null; previewError: string | null }

const chf = (c: number) => `${new Intl.NumberFormat("fr-CH").format(c / 100)} CHF`;

export function ImportWizard() {
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<Inspect | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const step = report ? 3 : info ? 2 : 1;

  async function call(url: string, m?: Mapping) {
    if (!file) return null;
    const fd = new FormData();
    fd.append("file", file);
    if (m) fd.append("mapping", JSON.stringify(m));
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Erreur");
        return null;
      }
      return json;
    } catch {
      setError("Erreur réseau.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function inspect(m?: Mapping) {
    const json = await call("/api/planity/inspect", m);
    if (json) {
      setInfo(json);
      setMapping(json.mapping);
    }
  }

  async function doImport() {
    const json = await call("/api/planity/import", mapping);
    if (json) setReport(json.report);
  }

  const reset = () => { setFile(null); setInfo(null); setReport(null); setMapping({}); setError(null); };
  const shown = report ?? info?.preview ?? null;

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-2 text-xs">
        {["Fichier", "Aperçu & mapping", "Rapport"].map((s, i) => (
          <li key={s} className={clsx("rounded-full border px-3 py-1", step === i + 1 ? "border-gold/60 text-gold" : "border-line-2 text-mute")}>{i + 1}. {s}</li>
        ))}
      </ol>

      {step === 1 ? (
        <div className="space-y-3">
          <label className="block rounded-2xl border border-dashed border-line-2 p-6 text-center text-sm text-mute hover:border-mute">
            <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" aria-label="Fichier Planity" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {file ? <span className="text-bone">{file.name} · {(file.size / 1024).toFixed(0)} Ko</span> : "Choisir un export Planity (.csv ou .xlsx)"}
          </label>
          <button className="btn-primary" disabled={!file || busy} onClick={() => inspect()}>{busy ? "Analyse…" : "Analyser le fichier"}</button>
        </div>
      ) : null}

      {error ? <p role="alert" className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p> : null}

      {step === 2 && info ? (
        <div className="space-y-4">
          <p className="text-sm text-mute">{info.rowCount} lignes détectées (en-tête ligne {info.headerRowNumber}). Vérifie l&apos;association des colonnes :</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {FIELDS.map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm">
                <span className="text-soft">{label}</span>
                <select aria-label={`Colonne pour ${label}`} className="max-w-[55%] rounded-lg bg-ink-3 px-2 py-1 text-xs" value={mapping[key] ?? ""} onChange={(e) => setMapping({ ...mapping, [key]: e.target.value === "" ? null : Number(e.target.value) })}>
                  <option value="">— ignorer —</option>
                  {info.headers.map((h, i) => <option key={i} value={i}>{h || `Colonne ${i + 1}`}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" disabled={busy} onClick={() => inspect(mapping)}>Recalculer l&apos;aperçu</button>
            <button className="btn-primary" disabled={busy || !info.preview} onClick={doImport}>{busy ? "Import…" : "Importer"}</button>
            <button className="btn-ghost" onClick={reset}>Annuler</button>
          </div>
          {info.previewError ? <p className="text-sm text-bad">{info.previewError}</p> : null}
        </div>
      ) : null}

      {shown ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-xl">{report ? "Rapport d'import" : "Aperçu (aucune donnée écrite)"}</h3>
            {report ? <Badge tone="ok">Importé</Badge> : <Badge tone="gold">Simulation</Badge>}
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[["Lignes", shown.totalRows], ["Importées", shown.importedRows], ["Doublons ignorés", shown.duplicateRows], ["Erreurs", shown.errorRows], ["Clients créés", shown.clientsCreated], ["Clients reconnus", shown.clientsMatched], ["À vérifier", shown.reviewsCreated], ["CA importé", chf(shown.revenueCents)]].map(([k, v]) => (
              <div key={String(k)} className="rounded-xl border border-line p-3"><dt className="label">{k}</dt><dd className="mt-1 font-display text-xl tabular-nums">{v}</dd></div>
            ))}
          </dl>
          {shown.estimatedRevenueCents ? <p className="text-xs text-warn">Dont {chf(shown.estimatedRevenueCents)} estimé (prix catalogue, prix absent du fichier).</p> : null}
          {shown.manualRevenueMarkedDuplicate || shown.manualRevenueMarkedReview ? <p className="text-xs text-mute">Anti double-comptage : {shown.manualRevenueMarkedDuplicate} saisie(s) manuelle(s) marquée(s) doublon, {shown.manualRevenueMarkedReview} à vérifier.</p> : null}
          {shown.servicesCreated.length ? <p className="text-xs text-mute">Prestations créées : {shown.servicesCreated.join(", ")}</p> : null}
          {shown.warnings.map((w) => <p key={w} className="text-xs text-warn">{w}</p>)}
          {shown.errors.length ? (
            <details className="rounded-xl border border-bad/30 p-3 text-sm" open={!report}>
              <summary className="cursor-pointer text-bad">{shown.errors.length} ligne(s) en erreur</summary>
              <ul className="mt-2 space-y-1 text-xs">{shown.errors.slice(0, 50).map((e) => <li key={e.rowNumber}>Ligne {e.rowNumber} : {e.error}{e.correction ? <span className="text-mute"> — {e.correction}</span> : null}</li>)}</ul>
            </details>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead className="text-left text-mute"><tr><th className="py-1 font-normal">Ligne</th><th className="font-normal">Date</th><th className="font-normal">Client</th><th className="font-normal">Prestation</th><th className="font-normal">Prix</th><th className="font-normal">Statut</th><th className="font-normal">Matching</th><th className="font-normal">Résultat</th></tr></thead>
              <tbody>
                {shown.preview.map((p) => (
                  <tr key={p.rowNumber} className="border-t border-line">
                    <td className="py-1">{p.rowNumber}</td><td>{new Date(p.date).toLocaleString("fr-CH", { timeZone: "Europe/Zurich", dateStyle: "short", timeStyle: "short" })}</td><td>{p.client}</td><td>{p.service}</td><td>{p.priceCents === null ? "—" : chf(p.priceCents)}</td><td>{p.status}</td><td>{p.match}</td><td className={p.outcome.startsWith("Doublon") ? "text-mute" : "text-ok"}>{p.outcome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report ? <button className="btn-ghost" onClick={() => { reset(); location.reload(); }}>Nouvel import</button> : null}
        </div>
      ) : null}
    </div>
  );
}
