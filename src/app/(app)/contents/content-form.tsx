"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/actions";
import { useRedirectOnSuccess } from "@/components/ui/use-redirect";
import { Field, Select, TextArea, TextInput } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { CONTENT_STATUS_LABEL, CONTENT_TYPE_LABEL, PLATFORM_LABEL, options } from "@/lib/labels";

export interface ContentDefaults {
  platform?: string;
  title?: string;
  type?: string;
  status?: string;
  hook?: string | null;
  description?: string | null;
  durationSec?: number | null;
  url?: string | null;
  notes?: string | null;
  publishedAt?: string | null;
  plannedAt?: string | null;
}

export function ContentForm({ action, defaults = {}, submitLabel }: { action: (p: ActionState, fd: FormData) => Promise<ActionState>; defaults?: ContentDefaults; submitLabel: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  useRedirectOnSuccess(state);
  const e = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <Field label="Titre" name="title" error={e.title} className="sm:col-span-2"><TextInput name="title" defaultValue={defaults.title} required maxLength={200} /></Field>
      <Field label="Plateforme" name="platform"><Select name="platform" defaultValue={defaults.platform ?? "INSTAGRAM"} options={options(PLATFORM_LABEL)} /></Field>
      <Field label="Type" name="type"><Select name="type" defaultValue={defaults.type ?? "TRANSFORMATION"} options={options(CONTENT_TYPE_LABEL)} /></Field>
      <Field label="Statut" name="status"><Select name="status" defaultValue={defaults.status ?? "IDEA"} options={options(CONTENT_STATUS_LABEL)} /></Field>
      <Field label="Durée (secondes)" name="durationSec" error={e.durationSec}><TextInput name="durationSec" type="number" min={0} defaultValue={defaults.durationSec ?? ""} /></Field>
      <Field label="Date de publication" name="publishedAt" hint="Vide = maintenant si statut « Publié »"><TextInput name="publishedAt" type="datetime-local" defaultValue={defaults.publishedAt ?? ""} /></Field>
      <Field label="Date prévue" name="plannedAt"><TextInput name="plannedAt" type="datetime-local" defaultValue={defaults.plannedAt ?? ""} /></Field>
      <Field label="Hook" name="hook" className="sm:col-span-2"><TextInput name="hook" defaultValue={defaults.hook ?? ""} maxLength={300} placeholder="Les 2 premières secondes" /></Field>
      <Field label="Description" name="description" className="sm:col-span-2"><TextArea name="description" defaultValue={defaults.description ?? ""} maxLength={3000} /></Field>
      <Field label="URL" name="url" error={e.url} className="sm:col-span-2"><TextInput name="url" type="url" defaultValue={defaults.url ?? ""} placeholder="https://www.instagram.com/reel/…" /></Field>
      <Field label="Notes" name="notes" className="sm:col-span-2"><TextArea name="notes" defaultValue={defaults.notes ?? ""} maxLength={3000} /></Field>
      <div className="space-y-3 sm:col-span-2">
        <FormMessage state={state} />
        <SubmitButton pendingText="Enregistrement…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

export function MetricForm({ action }: { action: (p: ActionState, fd: FormData) => Promise<ActionState> }) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  const fields: [string, string][] = [["views", "Vues"], ["likes", "Likes"], ["comments", "Commentaires"], ["shares", "Partages"], ["saves", "Sauvegardes"], ["followersGained", "Abonnés gagnés"], ["profileVisits", "Visites profil"], ["messages", "Messages"], ["leads", "Leads"]];
  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {fields.map(([n, l]) => (
          <Field key={n} label={l} name={`m-${n}`}><TextInput id={`m-${n}`} name={n} type="number" min={0} inputMode="numeric" /></Field>
        ))}
      </div>
      <FormMessage state={state} />
      <SubmitButton pendingText="Ajout…">Ajouter un snapshot</SubmitButton>
    </form>
  );
}
