"use client";

import { useActionState } from "react";
import clsx from "clsx";
import type { ActionState } from "@/lib/actions";
import { FormMessage } from "@/components/ui/form";
import { missionResultAction } from "./actions";

const LABEL: Record<string, string> = { PENDING: "Pending", DONE: "Done", SKIPPED: "Skipped", PARTIAL: "Partially done" };

export function MissionCard({ m }: { m: { id: string; rank: number; title: string; why: string; action: string; expectedResult: string; status: string; resultNote: string | null; dataUsed: Record<string, unknown> | null } }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(missionResultAction, {});
  return (
    <article className={clsx("card fade-in", m.status !== "PENDING" && "opacity-70")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gold/50 text-xs text-gold">{m.rank}</span>
          <div>
            <h3 className="font-display text-xl">{m.title}</h3>
            <p className="mt-1 text-sm text-soft">{m.action}</p>
          </div>
        </div>
        <span className="text-xs text-mute">{LABEL[m.status]}</span>
      </div>
      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
        <div><dt className="label">Pourquoi</dt><dd className="mt-1 text-soft">{m.why}</dd></div>
        <div><dt className="label">Résultat attendu</dt><dd className="mt-1 text-soft">{m.expectedResult}</dd></div>
      </dl>
      <form action={action} className="mt-4 flex flex-wrap items-center gap-2">
        <input type="hidden" name="missionId" value={m.id} />
        <input name="resultNote" defaultValue={m.resultNote ?? ""} placeholder="Résultat (optionnel)" className="input max-w-xs py-2 text-xs" aria-label="Résultat de la mission" />
        {(["DONE", "PARTIAL", "SKIPPED"] as const).map((s) => (
          <button key={s} name="status" value={s} disabled={pending} className={clsx(s === "DONE" ? "btn-primary" : "btn-ghost", "px-3 py-2 text-xs", m.status === s && "ring-1 ring-gold")}>{LABEL[s]}</button>
        ))}
      </form>
      <div className="mt-2"><FormMessage state={state} /></div>
    </article>
  );
}
