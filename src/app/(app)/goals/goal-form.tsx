"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/actions";
import { Field, Select, TextInput } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { GOAL_LABEL } from "@/lib/labels";
import { goalAction } from "./actions";

export function GoalForm() {
  const [state, action] = useActionState<ActionState, FormData>(goalAction, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_200px_auto]">
      <Field label="Objectif" name="metric"><Select name="metric" options={Object.entries(GOAL_LABEL).map(([value, v]) => ({ value, label: `${v.label}${v.unit === "chf" ? " (CHF)" : ""}` }))} /></Field>
      <Field label="Cible" name="target"><TextInput name="target" type="number" min={0} step="any" required /></Field>
      <div className="flex items-end"><SubmitButton pendingText="…">Enregistrer</SubmitButton></div>
      <div className="sm:col-span-3"><FormMessage state={state} /></div>
    </form>
  );
}
