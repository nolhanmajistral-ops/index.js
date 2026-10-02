"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { askCoachAction } from "./actions";

interface Msg { role: "user" | "assistant"; content: string; meta?: string; data?: Record<string, unknown> }

function Rich({ text }: { text: string }) {
  return (
    <div className="space-y-2 whitespace-pre-wrap">
      {text.split("\n\n").map((p, i) => (
        <p key={i}>{p.split(/(\*\*[^*]+\*\*)/).map((s, j) => (s.startsWith("**") ? <strong key={j} className="text-bone">{s.slice(2, -2)}</strong> : <span key={j}>{s}</span>))}</p>
      ))}
    </div>
  );
}

export function CoachChat({ suggestions }: { suggestions: string[] }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pending, start] = useTransition();
  const ask = (q: string) => {
    if (!q.trim() || pending) return;
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    start(async () => {
      const res = await askCoachAction({ question: q, history });
      setMessages((m) => [...m, res.reply ? { role: "assistant", content: res.reply.answer, meta: res.reply.mode === "llm" ? `IA · ${res.reply.model}` : res.reply.notice ?? "Mode déterministe", data: res.reply.dataUsed } : { role: "assistant", content: res.error ?? "Erreur." }]);
    });
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => <button key={s} onClick={() => ask(s)} disabled={pending} className="rounded-full border border-line-2 px-3 py-1.5 text-xs text-soft transition hover:border-gold/60 hover:text-bone">{s}</button>)}
      </div>
      <div className="min-h-40 space-y-3" aria-live="polite">
        {messages.length === 0 ? <p className="text-sm text-mute">Pose une question. Les réponses utilisent uniquement tes données NOLHAN OS.</p> : null}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-bone px-4 py-2 text-sm text-ink" : "max-w-[95%] rounded-2xl rounded-bl-sm border border-line bg-ink-3 px-4 py-3 text-sm text-soft"}>
            {m.role === "assistant" ? <Rich text={m.content} /> : m.content}
            {m.meta ? <div className="mt-2"><Badge>{m.meta}</Badge></div> : null}
            {m.data && Object.keys(m.data).length ? (
              <details className="mt-2 text-xs text-mute"><summary className="cursor-pointer">Données utilisées</summary><ul className="mt-1">{Object.entries(m.data).map(([k, v]) => <li key={k}>{k} : {String(v)}</li>)}</ul></details>
            ) : null}
          </div>
        ))}
        {pending ? <div className="text-sm text-mute">Analyse en cours…</div> : null}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={500} className="input" placeholder="Ta question…" aria-label="Question au coach" />
        <button className="btn-primary" disabled={pending || !input.trim()}>Envoyer</button>
      </form>
    </div>
  );
}
