"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/actions";
import { Field, Select, TextArea, TextInput } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { CHANNEL_LABEL, options } from "@/lib/labels";

export interface ClientDefaults {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  acquisitionChannel?: string;
  declaredAnswer?: string | null;
  originContentId?: string | null;
  notes?: string | null;
}

export function ClientForm({ action, defaults = {}, contents, submitLabel }: { action: (p: ActionState, fd: FormData) => Promise<ActionState>; defaults?: ClientDefaults; contents: { id: string; title: string }[]; submitLabel: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <Field label="Prénom" name="firstName" error={e.firstName}><TextInput name="firstName" defaultValue={defaults.firstName ?? ""} autoComplete="off" /></Field>
      <Field label="Nom" name="lastName"><TextInput name="lastName" defaultValue={defaults.lastName ?? ""} autoComplete="off" /></Field>
      <Field label="Email" name="email" error={e.email}><TextInput name="email" type="email" defaultValue={defaults.email ?? ""} autoComplete="off" /></Field>
      <Field label="Téléphone" name="phone"><TextInput name="phone" type="tel" defaultValue={defaults.phone ?? ""} placeholder="079 123 45 67" autoComplete="off" /></Field>
      <Field label="Comment nous as-tu trouvé ? (réponse du client)" name="declaredAnswer" hint="Réponse déclarée → attribution HIGH" className="sm:col-span-2"><TextInput name="declaredAnswer" defaultValue={defaults.declaredAnswer ?? ""} placeholder="ex. Instagram, un ami, Google…" /></Field>
      <Field label="Source d'acquisition (si non déclarée)" name="acquisitionChannel" hint="Sans réponse du client : confiance MEDIUM"><Select name="acquisitionChannel" defaultValue={defaults.acquisitionChannel ?? "UNKNOWN"} options={options(CHANNEL_LABEL)} /></Field>
      <Field label="Contenu d'origine" name="originContentId"><Select name="originContentId" defaultValue={defaults.originContentId ?? ""} options={[{ value: "", label: "—" }, ...contents.map((c) => ({ value: c.id, label: c.title }))]} /></Field>
      <Field label="Notes" name="notes" className="sm:col-span-2" hint="Minimisation : n'inscris que l'utile (pas de données sensibles)."><TextArea name="notes" defaultValue={defaults.notes ?? ""} maxLength={2000} /></Field>
      <div className="space-y-3 sm:col-span-2">
        <FormMessage state={state} />
        <SubmitButton pendingText="Enregistrement…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
