"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/actions";
import type { ScoreWeights } from "@/lib/validation/schemas";
import { Field, TextInput } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { deleteAccountAction, deleteDemoAction, profileAction, resetDemoAction, retentionAction, serviceAction, weightsAction } from "./actions";

export function ProfileForm({ p }: { p: { displayName: string; activity: string; city: string; instagramHandle: string | null; tiktokHandle: string | null; weeklyHoursAvailable: number | null; dataRetentionMonths: number } }) {
  const [state, action] = useActionState<ActionState, FormData>(profileAction, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <Field label="Nom" name="displayName"><TextInput name="displayName" defaultValue={p.displayName} required /></Field>
      <Field label="Activité" name="activity"><TextInput name="activity" defaultValue={p.activity} required /></Field>
      <Field label="Ville" name="city"><TextInput name="city" defaultValue={p.city} required /></Field>
      <Field label="Instagram (@)" name="instagramHandle"><TextInput name="instagramHandle" defaultValue={p.instagramHandle ?? ""} /></Field>
      <Field label="TikTok (@)" name="tiktokHandle"><TextInput name="tiktokHandle" defaultValue={p.tiktokHandle ?? ""} /></Field>
      <Field label="Heures dispo / semaine" name="weeklyHoursAvailable"><TextInput name="weeklyHoursAvailable" type="number" min={0} defaultValue={p.weeklyHoursAvailable ?? ""} /></Field>
      <Field label="Rétention des données (mois)" name="dataRetentionMonths" hint="Minimum 6"><TextInput name="dataRetentionMonths" type="number" min={6} max={120} defaultValue={p.dataRetentionMonths} /></Field>
      <div className="flex items-end gap-3 sm:col-span-2"><SubmitButton pendingText="…">Enregistrer</SubmitButton><FormMessage state={state} /></div>
    </form>
  );
}

export function ServiceForm() {
  const [state, action] = useActionState<ActionState, FormData>(serviceAction, {});
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-[1fr_120px_120px_auto]">
      <TextInput name="name" placeholder="Prestation (ex. Coupe)" required aria-label="Nom de la prestation" />
      <TextInput name="price" type="number" step="0.5" min={0} placeholder="CHF" required aria-label="Prix" />
      <TextInput name="durationMinutes" type="number" min={0} placeholder="min" aria-label="Durée" />
      <SubmitButton variant="ghost" pendingText="…">Enregistrer</SubmitButton>
      <div className="sm:col-span-4"><FormMessage state={state} /></div>
    </form>
  );
}

export function WeightsForm({ w }: { w: ScoreWeights }) {
  const [state, action] = useActionState<ActionState, FormData>(weightsAction, {});
  const groups: [keyof ScoreWeights, string][] = [["visibility", "Visibility"], ["engagement", "Engagement"], ["acquisition", "Acquisition"], ["business", "Business"]];
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        {groups.map(([g, label]) => (
          <fieldset key={g} className="space-y-2 rounded-xl border border-line p-3">
            <legend className="label px-1">{label}</legend>
            {Object.entries(w[g]).map(([k, v]) => (
              <label key={k} className="flex items-center justify-between gap-2 text-xs text-soft">{k}<input name={`${g}.${k}`} type="number" step="0.5" min={0} max={10} defaultValue={v} className="input w-20 py-1.5 text-xs" /></label>
            ))}
          </fieldset>
        ))}
      </div>
      <div className="flex items-center gap-3"><SubmitButton variant="ghost" pendingText="…">Enregistrer les pondérations</SubmitButton><FormMessage state={state} /></div>
    </form>
  );
}

export function DemoForms() {
  const [s1, reset] = useActionState<ActionState, FormData>(resetDemoAction, {});
  const [s2, del] = useActionState<ActionState, FormData>(deleteDemoAction, {});
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <form action={reset}><SubmitButton variant="ghost" pendingText="Réinitialisation…">RESET DEMO DATA</SubmitButton></form>
        <form action={del}><SubmitButton variant="danger" pendingText="…">Supprimer les données DEMO</SubmitButton></form>
      </div>
      <FormMessage state={s1.message ? s1 : s2} />
    </div>
  );
}

export function RetentionForm() {
  const [state, action] = useActionState<ActionState, FormData>(retentionAction, {});
  return <form action={action} className="flex flex-wrap items-center gap-3"><SubmitButton variant="ghost" pendingText="…">Appliquer la politique de rétention</SubmitButton><FormMessage state={state} /></form>;
}

export function DeleteAccountForm() {
  const [state, action] = useActionState<ActionState, FormData>(deleteAccountAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input name="confirm" className="input max-w-48" placeholder="Tape SUPPRIMER" aria-label="Confirmation" />
      <SubmitButton variant="danger" pendingText="Suppression…">Supprimer mon compte et toutes mes données</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
