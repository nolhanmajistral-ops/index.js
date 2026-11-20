"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { RichText } from "@/components/ui/rich-text";
import { readNdjson } from "@/lib/ndjson-client";

interface Source { title: string; url: string }
interface Msg { role: "user" | "assistant"; content: string; meta?: string; sources?: Source[]; data?: Record<string, unknown> }
interface Reply { answer: string; mode: "llm" | "deterministic"; model?: string; notice?: string; sources?: Source[]; dataUsed?: Record<string, unknown> }
type CoachEvent = { type: "text"; delta: string } | { type: "status"; status: string } | { type: "done"; reply: Reply } | { type: "error"; message: string };

const STORAGE_KEY = "nolhan-os.coach.v1";

function loadMessages(): Msg[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Msg[]) : [];
    return Array.isArray(parsed) ? parsed.slice(-30) : [];
  } catch {
    return [];
  }
}

export function CoachChat({ suggestions, llm, initialQuestion }: { suggestions: string[]; llm: boolean; initialQuestion?: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const autoAsked = useRef(false);
  const loaded = useRef(false);

  useEffect(() => {
    setMessages(loadMessages());
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    } catch {
      /* stockage indisponible : la conversation reste en mémoire */
    }
  }, [messages]);

  const ask = useCallback(
    async (q: string) => {
      const question = q.trim();
      if (!question || pending) return;
      const history = messages.filter((m) => m.content).map((m) => ({ role: m.role, content: m.content.slice(0, 6000) })).slice(-16);
      setMessages((m) => [...m, { role: "user", content: question }, { role: "assistant", content: "" }]);
      setInput("");
      setPending(true);
      setStatus(llm ? "Réflexion en cours…" : "Analyse de tes données…");
      const patchLast = (fn: (m: Msg) => Msg) => setMessages((all) => [...all.slice(0, -1), fn(all[all.length - 1]!)]);
      try {
        const res = await fetch("/api/ai/coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, history }) });
        await readNdjson<CoachEvent>(res, (e) => {
          if (e.type === "text") {
            setStatus(null);
            patchLast((m) => ({ ...m, content: m.content + e.delta }));
          } else if (e.type === "status") setStatus(e.status);
          else if (e.type === "done") {
            const r = e.reply;
            patchLast(() => ({ role: "assistant", content: r.answer, meta: r.mode === "llm" ? "IA" : r.notice ?? "Sans IA", sources: r.sources, data: r.dataUsed }));
          } else if (e.type === "error") patchLast((m) => ({ ...m, content: m.content || e.message, meta: "Erreur" }));
        });
      } catch {
        patchLast((m) => ({ ...m, content: m.content || "Connexion perdue. Réessaie.", meta: "Erreur" }));
      } finally {
        setPending(false);
        setStatus(null);
      }
    },
    [messages, pending, llm],
  );

  useEffect(() => {
    if (initialQuestion && !autoAsked.current && loaded.current) {
      autoAsked.current = true;
      void ask(initialQuestion);
    }
  }, [initialQuestion, ask]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button key={s} onClick={() => void ask(s)} disabled={pending} className="rounded-full border border-line-2 px-3 py-1.5 text-xs text-soft transition hover:border-gold/60 hover:text-bone disabled:opacity-50">{s}</button>
        ))}
      </div>
      <div className="min-h-40 space-y-3" aria-live="polite">
        {messages.length === 0 ? <p className="text-sm text-mute">Pose ta question : contenu, clients, prix, agenda… Je réponds avec tes chiffres NOLHAN OS{llm ? " et ce qui marche en ce moment dans la niche barber" : ""}.</p> : null}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-bone px-4 py-2 text-sm text-ink" : "max-w-[95%] rounded-2xl rounded-bl-sm border border-line bg-ink-3 px-4 py-3 text-sm text-soft"}>
            {m.role === "assistant" ? (m.content ? <RichText text={m.content} /> : <span className="text-mute">…</span>) : m.content}
            {m.sources?.length ? (
              <div className="mt-3 border-t border-line pt-2 text-xs text-mute">
                Sources :
                <ul className="mt-1 space-y-0.5">
                  {m.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">{s.title}</a></li>)}
                </ul>
              </div>
            ) : null}
            {m.meta === "IA" || m.meta === "Erreur" ? <div className="mt-2"><Badge tone={m.meta === "IA" ? "ok" : "bad"}>{m.meta}</Badge></div> : m.meta ? <p className="mt-2 text-xs text-mute">{m.meta}</p> : null}
            {m.data && Object.keys(m.data).length ? (
              <details className="mt-2 text-xs text-mute"><summary className="cursor-pointer">Données utilisées</summary><ul className="mt-1">{Object.entries(m.data).map(([k, v]) => <li key={k}>{k} : {String(v)}</li>)}</ul></details>
            ) : null}
          </div>
        ))}
        {status ? <div role="status" className="text-sm text-mute">{status}</div> : null}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void ask(input); }} className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={1000} className="input" placeholder="Ta question…" aria-label="Question au coach" />
        <button className="btn-primary" disabled={pending || !input.trim()}>Envoyer</button>
      </form>
      {messages.length ? <button type="button" onClick={() => setMessages([])} disabled={pending} className="self-start text-xs text-mute hover:text-bone">Nouvelle conversation</button> : null}
    </div>
  );
}
