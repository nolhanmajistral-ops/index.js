"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/actions";
import { Field, Select, TextInput } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/form";
import { APPOINTMENT_STATUS_LABEL, options } from "@/lib/labels";
import { manualAppointmentAction, manualRevenueAction } from "./actions";

type Opt = { id: string; name: string; priceCents?: number };

export function AppointmentForm({ services, clients, now }: { services: Opt[]; clients: Opt[]; now: string }) {
  const [state, action] = useActionState<ActionState, FormData>(manualAppointmentAction, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="Client" name="a-clientId"><Select id="a-clientId" name="clientId" options={[{ value: "", label: "— sans client —" }, ...clients.map((c) => ({ value: c.id, label: c.name }))]} /></Field>
      <Field label="Prestation" name="a-serviceId" error={state.fieldErrors?.serviceId}><Select id="a-serviceId" name="serviceId" options={services.map((s) => ({ value: s.id, label: `${s.name} — ${(s.priceCents ?? 0) / 100} CHF` }))} /></Field>
      <Field label="Date et heure" name="a-startsAt"><TextInput id="a-startsAt" name="startsAt" type="datetime-local" defaultValue={now} required /></Field>
      <Field label="Statut" name="a-status"><Select id="a-status" name="status" defaultValue="COMPLETED" options={options(APPOINTMENT_STATUS_LABEL)} /></Field>
      <Field label="Prix (CHF, vide = tarif)" name="a-price"><TextInput id="a-price" name="price" type="number" step="0.5" min={0} /></Field>
      <div className="flex items-end"><SubmitButton pendingText="…">Ajouter le rendez-vous</SubmitButton></div>
      <div className="sm:col-span-2"><FormMessage state={state} /></div>
    </form>
  );
}

export function RevenueForm({ services, clients, now }: { services: Opt[]; clients: Opt[]; now: string }) {
  const [state, action] = useActionState<ActionState, FormData>(manualRevenueAction, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="Montant (CHF)" name="r-amount" error={state.fieldErrors?.amount}><TextInput id="r-amount" name="amount" type="number" step="0.05" min={0} required /></Field>
      <Field label="Date" name="r-occurredAt"><TextInput id="r-occurredAt" name="occurredAt" type="datetime-local" defaultValue={now} required /></Field>
      <Field label="Type" name="r-kind"><Select id="r-kind" name="kind" defaultValue="SERVICE" options={[{ value: "SERVICE", label: "Prestation" }, { value: "PRODUCT", label: "Produit" }, { value: "TIP", label: "Pourboire" }, { value: "OTHER", label: "Autre" }]} /></Field>
      <Field label="Client" name="r-clientId"><Select id="r-clientId" name="clientId" options={[{ value: "", label: "—" }, ...clients.map((c) => ({ value: c.id, label: c.name }))]} /></Field>
      <Field label="Prestation" name="r-serviceId"><Select id="r-serviceId" name="serviceId" options={[{ value: "", label: "—" }, ...services.map((s) => ({ value: s.id, label: s.name }))]} /></Field>
      <Field label="Libellé" name="r-label"><TextInput id="r-label" name="label" maxLength={200} /></Field>
      <div className="sm:col-span-2 space-y-2">
        <FormMessage state={state} />
        <SubmitButton pendingText="…">Enregistrer le revenu</SubmitButton>
      </div>
    </form>
  );
}
