"use client";

import clsx from "clsx";
import { useFormStatus } from "react-dom";

export function SubmitButton({ children, className, variant = "primary", pendingText = "…" }: { children: React.ReactNode; className?: string; variant?: "primary" | "ghost" | "danger"; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={clsx(variant === "primary" ? "btn-primary" : variant === "danger" ? "btn-danger" : "btn-ghost", className)}>
      {pending ? pendingText : children}
    </button>
  );
}

export function FormMessage({ state }: { state?: { ok?: boolean; message?: string } | null }) {
  if (!state?.message) return null;
  return (
    <p role="status" className={clsx("rounded-lg px-3 py-2 text-sm", state.ok ? "bg-ok/10 text-ok" : "bg-bad/10 text-bad")}>
      {state.message}
    </p>
  );
}
