"use client";

import { useTransition } from "react";
import clsx from "clsx";
import { deleteAppointmentAction, statusAction } from "./actions";

const BUTTONS = [
  { s: "COMPLETED", label: "✓", title: "Réalisé" },
  { s: "CANCELLED", label: "Annulé", title: "Annulé" },
  { s: "NO_SHOW", label: "Absent", title: "Absent" },
] as const;

export function AppointmentActions({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {BUTTONS.map((b) => (
        <button
          key={b.s}
          title={b.title}
          aria-label={b.title}
          disabled={pending}
          onClick={() => start(() => statusAction(id, status === b.s ? "BOOKED" : b.s))}
          className={clsx("rounded-md border px-1.5 py-0.5 text-[10px] transition", status === b.s ? "border-gold/60 bg-gold-soft text-bone" : "border-line-2 text-mute hover:text-bone")}
        >
          {b.label}
        </button>
      ))}
      <button
        title="Supprimer"
        aria-label="Supprimer"
        disabled={pending}
        onClick={() => {
          if (confirm("Supprimer ce rendez-vous ?")) start(() => deleteAppointmentAction(id));
        }}
        className="rounded-md px-1.5 py-0.5 text-[10px] text-mute hover:text-bad"
      >
        ✕
      </button>
    </div>
  );
}
