"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rollbackAction } from "./actions";

export function RollbackButton({ batchId }: { batchId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  return (
    <span className="flex items-center gap-2">
      <button
        className="btn-danger px-3 py-1.5 text-xs"
        disabled={pending}
        onClick={() => {
          if (!confirm("Annuler cet import ? Les rendez-vous, revenus et clients créés par cet import seront supprimés.")) return;
          start(async () => {
            const res = await rollbackAction(batchId);
            if (res.ok) router.push(`/planity?rolledBack=${encodeURIComponent(res.message ?? "")}`);
            else setMsg(res.message ?? "Erreur");
          });
        }}
      >
        Annuler cet import
      </button>
      {msg ? <span className="text-xs text-mute">{msg}</span> : null}
    </span>
  );
}
