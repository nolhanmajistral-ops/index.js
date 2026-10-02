"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/actions";
import { Field, Select, TextInput } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { addPreferenceAction, completeExperimentAction, createExperimentAction, runLearningAction } from "./actions";

export function LearningButton() {
  const [state, action] = useActionState<ActionState, FormData>(runLearningAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <SubmitButton variant="ghost" pendingText="Évaluation…">Évaluer les résultats maintenant</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

const METRICS: [string, string][] = [["views", "Vues"], ["profileVisits", "Visites profil"], ["leads", "Leads"], ["newClients", "Nouveaux clients"], ["revenue", "CA"], ["followers", "Abonnés"]];

export function ExperimentForm({ today }: { today: string }) {
  const [state, action] = useActionState<ActionState, FormData>(createExperimentAction, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="Hypothèse" name="hypothesis" className="sm:col-span-2"><TextInput name="hypothesis" required minLength={5} placeholder="Publier plus de transformations augmente les nouveaux clients" /></Field>
      <Field label="Action" name="action"><TextInput name="action" required placeholder="4 transformations / semaine" /></Field>
      <Field label="Résultat attendu" name="expectedResult"><TextInput name="expectedResult" required placeholder="+2 nouveaux clients / semaine" /></Field>
      <Field label="Début" name="startDate"><TextInput name="startDate" type="date" defaultValue={today} required /></Field>
      <Field label="Durée (jours)" name="durationDays"><TextInput name="durationDays" type="number" min={1} max={180} defaultValue={14} required /></Field>
      <fieldset className="sm:col-span-2"><legend className="label mb-2">Métriques suivies</legend><div className="flex flex-wrap gap-3 text-sm">{METRICS.map(([v, l]) => <label key={v} className="flex items-center gap-1.5"><input type="checkbox" name="metrics" value={v} defaultChecked={v === "newClients" || v === "views"} className="accent-[#c8a96a]" />{l}</label>)}</div></fieldset>
      <div className="space-y-2 sm:col-span-2"><FormMessage state={state} /><SubmitButton pendingText="…">Lancer l&apos;expérience</SubmitButton></div>
    </form>
  );
}

export function CompleteExperimentForm({ id }: { id: string }) {
  const [state, action] = useActionState<ActionState, FormData>(completeExperimentAction, {});
  return (
    <form action={action} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_160px_auto]">
      <input type="hidden" name="id" value={id} />
      <input name="actual" className="input py-2 text-xs" placeholder="Résultat réel (chiffres)" aria-label="Résultat réel" />
      <input name="conclusion" className="input py-2 text-xs" placeholder="Conclusion" required aria-label="Conclusion" />
      <select name="outcome" className="input py-2 text-xs" aria-label="Verdict"><option value="POSITIVE">Positif</option><option value="NEUTRAL">Neutre</option><option value="NEGATIVE">Négatif</option><option value="INCONCLUSIVE">Non concluant</option></select>
      <SubmitButton variant="ghost" className="py-2 text-xs" pendingText="…">Clôturer</SubmitButton>
      <div className="sm:col-span-4"><FormMessage state={state} /></div>
    </form>
  );
}

export function PreferenceForm() {
  const [state, action] = useActionState<ActionState, FormData>(addPreferenceAction, {});
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-[200px_1fr_auto]">
      <Select name="kind" aria-label="Type" options={[{ value: "PREFERENCE", label: "Préférence" }, { value: "PREFERRED_FORMAT", label: "Format préféré" }, { value: "AVOIDED_FORMAT", label: "Format évité" }, { value: "GOAL", label: "Objectif" }, { value: "NOTE", label: "Note" }]} />
      <TextInput name="content" required minLength={3} maxLength={500} placeholder="ex. Je ne veux pas faire de face caméra" aria-label="Contenu" />
      <SubmitButton variant="ghost" pendingText="…">Ajouter</SubmitButton>
      <div className="sm:col-span-3"><FormMessage state={state} /></div>
    </form>
  );
}
