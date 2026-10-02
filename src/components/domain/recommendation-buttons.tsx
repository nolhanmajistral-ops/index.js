"use client";

import { useTransition } from "react";
import { recommendationAction } from "@/app/(app)/ai/actions";

export function RecommendationButtons({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  if (status !== "PROPOSED") return <p className="mt-6 text-xs text-mute">Statut : {status === "DONE" ? "Done" : status === "PARTIAL" ? "Partially done" : "Skipped"} — le résultat sera évalué automatiquement.</p>;
  const act = (s: "DONE" | "PARTIAL" | "SKIPPED") => start(() => void recommendationAction(id, s));
  return (
    <div className="mt-6 flex flex-wrap gap-2">
      <button disabled={pending} onClick={() => act("DONE")} className="btn-primary">Fait</button>
      <button disabled={pending} onClick={() => act("PARTIAL")} className="btn-ghost">Partiellement</button>
      <button disabled={pending} onClick={() => act("SKIPPED")} className="btn-ghost">Passer</button>
    </div>
  );
}
