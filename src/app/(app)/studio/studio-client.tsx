"use client";

import { useState } from "react";
import clsx from "clsx";
import { Badge } from "@/components/ui/badge";
import { RichText } from "@/components/ui/rich-text";
import { readNdjson } from "@/lib/ndjson-client";
import { STUDIO_MODES, type StudioModeId } from "@/ai/studio/modes";

interface Source { title: string; url: string }
interface Result { text: string; mode: "llm" | "deterministic"; notice?: string; sources?: Source[] }
type StudioEvent = { type: "text"; delta: string } | { type: "status"; status: string } | { type: "done"; result: Result } | { type: "error"; message: string };

export function StudioClient({ llm, initialMode }: { llm: boolean; initialMode?: StudioModeId }) {
  const [modeId, setModeId] = useState<StudioModeId>(initialMode ?? "reel");
  const mode = STUDIO_MODES.find((m) => m.id === modeId)!;
  const [values, setValues] = useState<Record<string, string>>({});
  const [output, setOutput] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  const select = (id: StudioModeId) => {
    if (pending) return;
    setModeId(id);
    setOutput("");
    setResult(null);
    setError(null);
  };

  const generate = async () => {
    setPending(true);
    setOutput("");
    setResult(null);
    setError(null);
    setCopied(false);
    setStatus(llm ? "Écriture en cours…" : "Préparation de la trame…");
    const inputs = Object.fromEntries(mode.fields.map((f) => [f.name, values[`${modeId}.${f.name}`] ?? f.options?.[0]?.value ?? ""]));
    try {
      const res = await fetch("/api/ai/studio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: modeId, inputs }) });
      await readNdjson<StudioEvent>(res, (e) => {
        if (e.type === "text") {
          setStatus(null);
          setOutput((o) => o + e.delta);
        } else if (e.type === "status") setStatus(e.status);
        else if (e.type === "done") {
          setOutput(e.result.text);
          setResult(e.result);
        } else if (e.type === "error") setError(e.message);
      });
    } catch {
      setError("Connexion perdue. Réessaie.");
    } finally {
      setPending(false);
      setStatus(null);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const missingRequired = mode.fields.some((f) => f.required && (values[`${modeId}.${f.name}`] ?? "").trim().length < 2);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" role="tablist" aria-label="Type de contenu">
        {STUDIO_MODES.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={m.id === modeId}
            onClick={() => select(m.id)}
            className={clsx("rounded-xl border px-3 py-2.5 text-left text-sm transition", m.id === modeId ? "border-gold/70 bg-ink-3 text-bone" : "border-line text-soft hover:border-line-2 hover:text-bone")}
          >
            {m.label}
          </button>
        ))}
      </div>

      <form className="card space-y-4" onSubmit={(e) => { e.preventDefault(); if (!pending && !missingRequired) void generate(); }}>
        <div>
          <h2 className="font-display text-xl">{mode.label}</h2>
          <p className="mt-1 text-sm text-mute">{mode.description}</p>
        </div>
        {mode.fields.map((f) => {
          const key = `${modeId}.${f.name}`;
          const id = `studio-${modeId}-${f.name}`;
          return (
            <div key={key} className="space-y-1.5">
              <label htmlFor={id} className="text-sm text-soft">{f.label}{f.required ? "" : ""}</label>
              {f.kind === "textarea" ? (
                <textarea id={id} className="input min-h-28" maxLength={f.max} placeholder={f.placeholder} value={values[key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))} />
              ) : f.kind === "select" ? (
                <select id={id} className="input" value={values[key] ?? f.options?.[0]?.value ?? ""} onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}>
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input id={id} className="input" maxLength={f.max} placeholder={f.placeholder} value={values[key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))} />
              )}
            </div>
          );
        })}
        <button className="btn-primary w-full sm:w-auto" disabled={pending || missingRequired}>{pending ? "Génération…" : "Générer"}</button>
      </form>

      {output || status || error ? (
        <div className="card space-y-3" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {result ? <Badge tone={result.mode === "llm" ? "ok" : "warn"}>{result.mode === "llm" ? "IA" : result.notice ?? "Sans IA"}</Badge> : null}
            </div>
            {output && !pending ? <button type="button" onClick={() => void copy()} className="btn-ghost">{copied ? "Copié ✓" : "Copier"}</button> : null}
          </div>
          {status ? <p role="status" className="text-sm text-mute">{status}</p> : null}
          {error ? <p className="text-sm text-bad">{error}</p> : null}
          {output ? <div className="text-sm text-soft"><RichText text={output} /></div> : null}
          {result?.sources?.length ? (
            <div className="border-t border-line pt-2 text-xs text-mute">
              Sources :
              <ul className="mt-1 space-y-0.5">{result.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">{s.title}</a></li>)}</ul>
            </div>
          ) : null}
          {result ? <p className="text-xs text-mute">Rien n&apos;est publié automatiquement : relis, adapte à ta façon de parler, puis poste toi-même.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
