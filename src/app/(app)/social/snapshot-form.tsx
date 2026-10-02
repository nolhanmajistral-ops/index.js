"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/actions";
import { Field, Select, TextInput } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { addSnapshotAction } from "./actions";

export function SnapshotForm({ now }: { now: string }) {
  const [state, action] = useActionState<ActionState, FormData>(addSnapshotAction, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <Field label="Plateforme" name="s-platform"><Select id="s-platform" name="platform" options={[{ value: "INSTAGRAM", label: "Instagram" }, { value: "TIKTOK", label: "TikTok" }]} /></Field>
      <Field label="Date du relevé" name="s-capturedAt"><TextInput id="s-capturedAt" name="capturedAt" type="datetime-local" defaultValue={now} required /></Field>
      <Field label="Abonnés" name="s-followers"><TextInput id="s-followers" name="followers" type="number" min={0} /></Field>
      <Field label="Vues (cumul)" name="s-views"><TextInput id="s-views" name="views" type="number" min={0} /></Field>
      <Field label="Likes" name="s-likes"><TextInput id="s-likes" name="likes" type="number" min={0} /></Field>
      <Field label="Commentaires" name="s-comments"><TextInput id="s-comments" name="comments" type="number" min={0} /></Field>
      <Field label="Partages" name="s-shares"><TextInput id="s-shares" name="shares" type="number" min={0} /></Field>
      <div className="flex items-end sm:col-span-2"><SubmitButton pendingText="…">Ajouter le snapshot</SubmitButton></div>
      <div className="sm:col-span-3"><FormMessage state={state} /></div>
    </form>
  );
}
