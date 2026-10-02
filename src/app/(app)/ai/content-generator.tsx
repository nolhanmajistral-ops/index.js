"use client";

import { useState, useTransition } from "react";
import { CONTENT_TYPE_LABEL } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import type { ContentIdea } from "@/ai/content/generator";
import { generateContentAction } from "./actions";

export function ContentGenerator() {
  const [format, setFormat] = useState("");
  const [brief, setBrief] = useState("");
  const [idea, setIdea] = useState<ContentIdea | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = () => start(async () => {
    const r = await generateContentAction({ format: format || undefined, brief: brief || undefined });
    setError(r.error ?? null);
    setIdea(r.idea ?? null);
  });
  const List = ({ title, items }: { title: string; items: string[] }) => (
    <div><div className="label">{title}</div><ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-soft">{items.map((x) => <li key={x}>{x}</li>)}</ul></div>
  );
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-[200px_1fr_auto]">
        <select value={format} onChange={(e) => setFormat(e.target.value)} className="input" aria-label="Format"><option value="">Meilleur format (auto)</option>{Object.entries(CONTENT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={500} className="input" placeholder="Brief optionnel (ex. client cheveux longs)" aria-label="Brief" />
        <button className="btn-primary" disabled={pending} onClick={run}>{pending ? "Génération…" : "Générer"}</button>
      </div>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
      {idea ? (
        <div className="space-y-4 rounded-2xl border border-line p-4">
          <div className="flex flex-wrap items-center gap-2"><Badge tone="gold">{CONTENT_TYPE_LABEL[idea.format]}</Badge><Badge>{idea.mode === "llm" ? "IA" : "Déterministe"}</Badge></div>
          <div><div className="label">Concept</div><p className="mt-1 font-display text-xl">{idea.concept}</p></div>
          <div><div className="label">Hook</div><p className="mt-1 text-soft">{idea.hook}</p></div>
          <div className="grid gap-4 md:grid-cols-2">
            <List title="Script" items={idea.script} />
            <List title="Plans vidéo" items={idea.plans} />
            <List title="Texte écran" items={idea.texteEcran} />
            <List title="Stories associées" items={idea.stories} />
          </div>
          <div><div className="label">CTA</div><p className="mt-1 text-sm text-soft">{idea.cta}</p></div>
          <div><div className="label">Caption</div><p className="mt-1 text-sm text-soft">{idea.caption}</p><p className="mt-1 text-xs text-mute">{idea.hashtags.join(" ")}</p></div>
          <p className="text-xs text-mute">{idea.justification}</p>
          <p className="text-xs text-warn">{idea.disclaimer}</p>
        </div>
      ) : null}
    </div>
  );
}
