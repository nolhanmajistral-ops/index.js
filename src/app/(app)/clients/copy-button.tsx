"use client";

import { useState } from "react";

/** Copie un texte (message de relance) quand le client n'a pas de numéro WhatsApp. */
export function CopyButton({ text, label = "Copier le message" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost px-3 py-1.5 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? "Copié ✓" : label}
    </button>
  );
}
