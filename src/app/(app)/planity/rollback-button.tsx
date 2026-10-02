"use client";

import { useState, useTransition } from "react";
import { rollbackAction } from "./actions";

export function RollbackButton({ batchId }: { batchId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      <button
        className="btn-danger px-3 py-1.5 text-xs"
        disabled={pending}
        onClick={() => {
          if (!confirm("Annuler cet import ? Les rendez-vous, revenus et clients créés par cet import seront supprimés.")) return;
          start(async () => setMsg((await rollbackAction(batchId)).message ?? null));
        }}
      >
        Annuler cet import
      </button>
      {msg ? <span className="text-xs text-mute">{msg}</span> : null}
    </span>
  );
}
